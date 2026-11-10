CREATE TABLE public.rota_dias_sem_visita (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rota_id uuid NOT NULL REFERENCES public.rotas(id) ON DELETE CASCADE,
  dia date NOT NULL,
  motivo text NOT NULL,
  observacao text,
  autor_id uuid NOT NULL,
  origem text NOT NULL DEFAULT 'app',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rota_id, dia)
);
GRANT SELECT, INSERT, DELETE ON public.rota_dias_sem_visita TO authenticated;
GRANT ALL ON public.rota_dias_sem_visita TO service_role;
ALTER TABLE public.rota_dias_sem_visita ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ver dias sem visita" ON public.rota_dias_sem_visita FOR SELECT TO authenticated
  USING (public.fn_pode_ver_rota(auth.uid(), rota_id));
CREATE POLICY "registrar dia sem visita" ON public.rota_dias_sem_visita FOR INSERT TO authenticated
  WITH CHECK (autor_id = auth.uid() AND public.fn_pode_escrever_diario(auth.uid(), rota_id));
CREATE POLICY "admin remove dia sem visita" ON public.rota_dias_sem_visita FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.fn_dias_sem_visita_validar() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.rotas;
BEGIN
  SELECT * INTO r FROM public.rotas WHERE id = NEW.rota_id;
  IF NOT FOUND OR r.status <> 'aprovada' THEN RAISE EXCEPTION 'Viagem não aprovada.'; END IF;
  IF NEW.dia < r.data_inicio OR NEW.dia > r.data_fim THEN RAISE EXCEPTION 'Dia fora da viagem.'; END IF;
  IF NEW.dia >= (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN RAISE EXCEPTION 'Só dias anteriores podem ser marcados sem visita.'; END IF;
  IF NEW.motivo NOT IN ('deslocamento','folga','outro') THEN RAISE EXCEPTION 'Motivo inválido.'; END IF;
  IF NEW.motivo = 'outro' AND nullif(btrim(coalesce(NEW.observacao,'')),'') IS NULL THEN RAISE EXCEPTION 'Explique o motivo na observação.'; END IF;
  IF NEW.autor_id <> r.vendedor_id AND NOT public.has_role(NEW.autor_id, 'admin') THEN RAISE EXCEPTION 'Só o vendedor da viagem ou admin.'; END IF;
  IF EXISTS (SELECT 1 FROM public.rota_paradas p WHERE p.rota_id = r.id AND p.dia = NEW.dia AND p.visitada IS NOT NULL AND coalesce(p.tipo,'') <> 'pernoite') THEN
    RAISE EXCEPTION 'Esse dia já tem visita registrada.';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.fn_dias_sem_visita_validar() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_dias_sem_visita_validar BEFORE INSERT OR UPDATE ON public.rota_dias_sem_visita
  FOR EACH ROW EXECUTE FUNCTION public.fn_dias_sem_visita_validar();

CREATE OR REPLACE FUNCTION public.julia_registrar_voz(p_ligacao uuid, p_rota uuid, p_acao text, p_dados jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE l public.ligacoes_viagem; r public.rotas; p public.rota_paradas; g uuid; texto text; anterior text:=current_setting('request.jwt.claim.sub',true); n date; v_relato jsonb; atividade uuid; tipo_tarefa uuid; quando timestamptz; v_contatos jsonb;
BEGIN
 SELECT * INTO l FROM public.ligacoes_viagem WHERE id=p_ligacao AND rota_id=p_rota FOR UPDATE;
 IF NOT FOUND OR l.status NOT IN ('discando','em_andamento') OR l.data_ref<>(now() AT TIME ZONE 'America/Sao_Paulo')::date THEN RAISE EXCEPTION 'Ligação não está ativa nesta viagem e data.'; END IF;
 SELECT * INTO r FROM public.rotas WHERE id=p_rota FOR UPDATE;
 IF r.vendedor_id<>l.vendedor_id OR r.status<>'aprovada' OR NOT public.fn_pode_escrever_diario(l.vendedor_id,r.id) THEN RAISE EXCEPTION 'Viagem não permite registro.'; END IF;
 PERFORM set_config('request.jwt.claim.sub',l.vendedor_id::text,true);
 IF p_acao='registrar_visita' THEN
  SELECT * INTO p FROM public.rota_paradas WHERE id=(p_dados->>'parada_id')::uuid AND rota_id=r.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Parada não pertence à viagem.'; END IF;
  IF p.visitada IS NOT NULL THEN RAISE EXCEPTION 'Parada já informada; corrija pelo CRM.'; END IF;
  texto:=nullif(btrim(CASE WHEN (p_dados->>'visitada')::boolean THEN p_dados->>'resultado' ELSE p_dados->>'motivo' END),'');
  IF texto IS NULL OR length(texto)>4500 THEN RAISE EXCEPTION 'Informe resultado ou motivo válido.'; END IF;
  SELECT coalesce(jsonb_object_agg(key,value),'{}'::jsonb) INTO v_relato FROM jsonb_each(p_dados) WHERE key IN ('contato_nome','contato_cargo','decisores','sacos_safra','equipamento_atual','problema_principal','interesse','motivo_interesse','objecoes','concorrente','proximo_passo','proximo_passo_data');
  PERFORM public.julia_validar_relato(v_relato);
  IF NOT (p_dados->>'visitada')::boolean AND v_relato<>'{}'::jsonb THEN RAISE EXCEPTION 'Relato detalhado somente para visita realizada.'; END IF;
  IF (p_dados->>'visitada')::boolean AND v_relato ? 'proximo_passo' AND v_relato ? 'proximo_passo_data' AND p.organizacao_id IS NOT NULL THEN
   SELECT id INTO tipo_tarefa FROM public.tipos_atividade WHERE ativo AND lower(nome)='tarefa' ORDER BY ordem,id LIMIT 1;
   IF tipo_tarefa IS NULL THEN RAISE EXCEPTION 'Tipo Tarefa não está disponível na agenda.'; END IF;
   quando:=((v_relato->>'proximo_passo_data')::date+time '09:00') AT TIME ZONE 'America/Sao_Paulo';
   INSERT INTO public.atividades(tipo,tipo_id,titulo,descricao,conteudo,data_atividade,data_inicio,responsavel_id,organizacao_id,oportunidade_id,concluida,evento_automatico)
    VALUES('tarefa',tipo_tarefa,'Próximo passo: '||(v_relato->>'proximo_passo'),'Combinado na visita — '||texto,'Combinado na visita — '||texto,quando,quando,l.vendedor_id,p.organizacao_id,p.oportunidade_id,false,false) RETURNING id INTO atividade;
   v_relato:=v_relato||jsonb_build_object('atividade_id',atividade);
  END IF;
  -- Contato novo só com confirmação explícita; o gatilho de levantamento lê isto e devolve o casamento em julia.contatos.
  PERFORM set_config('julia.contato_novo_confirmado', CASE WHEN p_dados->>'contato_novo_confirmado' = 'true' THEN 'true' ELSE 'false' END, true);
  PERFORM set_config('julia.contatos', '', true);
  UPDATE public.rota_paradas SET visitada=(p_dados->>'visitada')::boolean,resultado=CASE WHEN (p_dados->>'visitada')::boolean THEN texto END,motivo_nao_visita=CASE WHEN NOT (p_dados->>'visitada')::boolean THEN texto END,relato=nullif(v_relato,'{}'::jsonb) WHERE id=p.id;
  IF (p_dados->>'visitada')::boolean AND p.atividade_id IS NOT NULL THEN
   UPDATE public.atividades SET concluida=true,data_conclusao=now(),resultado=texto WHERE id=p.atividade_id;
  END IF;
  v_contatos := nullif(current_setting('julia.contatos', true), '')::jsonb;
  PERFORM set_config('julia.contato_novo_confirmado', '', true);
  PERFORM set_config('julia.contatos', '', true);
  INSERT INTO public.rota_diario(rota_id,parada_id,organizacao_id,autor_id,texto) VALUES(r.id,p.id,p.organizacao_id,l.vendedor_id,'Júlia — '||texto);
 ELSIF p_acao='registrar_pernoite' THEN
  n:=coalesce(nullif(p_dados->>'noite','')::date, l.data_ref);
  IF n>l.data_ref OR n<r.data_inicio THEN RAISE EXCEPTION 'Noite fora da viagem até hoje.'; END IF;
  IF n>=r.data_fim THEN RAISE EXCEPTION 'Último dia: não há pernoite a registrar.'; END IF;
  IF p_dados->>'tipo'='hotel' THEN
   INSERT INTO public.rota_gastos(rota_id,categoria,valor,data,descricao,autor_id) VALUES(r.id,'hotel',(p_dados->>'valor')::numeric,n,'Hotel '||(p_dados->>'hotel_nome'),l.vendedor_id) RETURNING id INTO g;
  END IF;
  INSERT INTO public.rota_pernoites(rota_id,noite,tipo,cidade,estado,hotel_nome,gasto_id,observacao,autor_id)
   VALUES(r.id,n,p_dados->>'tipo',p_dados->>'cidade',p_dados->>'uf',p_dados->>'hotel_nome',g,p_dados->>'observacao',l.vendedor_id);
 ELSIF p_acao='registrar_dia_sem_visita' THEN
  INSERT INTO public.rota_dias_sem_visita(rota_id,dia,motivo,observacao,autor_id,origem)
   VALUES(r.id,(p_dados->>'dia')::date,p_dados->>'motivo',nullif(btrim(p_dados->>'observacao'),''),l.vendedor_id,'julia')
   ON CONFLICT (rota_id,dia) DO NOTHING;
 ELSE RAISE EXCEPTION 'Ferramenta desconhecida.';
 END IF;
 PERFORM set_config('request.jwt.claim.sub',coalesce(anterior,''),true);
 RETURN jsonb_build_object('ok',true,'gasto_id',g,'atividade_id',atividade,'contatos_resolvidos',coalesce(v_contatos,'[]'::jsonb));
END $function$;

INSERT INTO public.push_regras(prefixo, ativo, urgente, descricao) VALUES
  ('fechou:', true, false, 'Vendedor fechou o dia (admins)'),
  ('naofechou:', true, false, 'Vendedor não fechou o dia às 22h (admins)')
ON CONFLICT (prefixo) DO UPDATE SET ativo = EXCLUDED.ativo, urgente = EXCLUDED.urgente, descricao = EXCLUDED.descricao;