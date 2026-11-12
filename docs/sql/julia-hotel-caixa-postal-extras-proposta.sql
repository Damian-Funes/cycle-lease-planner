-- PROPOSTA (NÃO APLICADA) — Júlia: hotel pago pela empresa sem valor + nova tentativa após caixa postal.
-- Aplicar só após OK explícito do CEO. Testar antes em BEGIN … ROLLBACK (Murilo 11/11, Renan 11/11).
-- "Visitou mais alguém?" (confirmar_extras) não precisa de SQL: grava no diário da viagem.

-- 1) Gasto de hotel pode ficar sem valor só quando pago pela empresa.
ALTER TABLE public.rota_gastos ADD COLUMN IF NOT EXISTS pago_pela_empresa boolean NOT NULL DEFAULT false;
ALTER TABLE public.rota_gastos ALTER COLUMN valor DROP NOT NULL;
ALTER TABLE public.rota_gastos DROP CONSTRAINT IF EXISTS rota_gastos_valor_check;
ALTER TABLE public.rota_gastos ADD CONSTRAINT rota_gastos_valor_check CHECK (
 (valor IS NULL AND pago_pela_empresa AND categoria='hotel') OR (valor > 0 AND valor < 100000));

CREATE OR REPLACE FUNCTION public.julia_registrar_voz(p_ligacao uuid, p_rota uuid, p_acao text, p_dados jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE l public.ligacoes_viagem; r public.rotas; p public.rota_paradas; g uuid; texto text; anterior text:=current_setting('request.jwt.claim.sub',true); n date; v_relato jsonb; atividade uuid; tipo_tarefa uuid; quando timestamptz; v_contatos jsonb; empresa boolean:=false; vend text; a uuid;
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
   empresa:=coalesce((p_dados->>'pago_pela_empresa')::boolean,false) AND nullif(p_dados->>'valor','') IS NULL;
   IF NOT empresa AND nullif(p_dados->>'valor','') IS NULL THEN RAISE EXCEPTION 'Informe o valor do hotel ou diga que foi pago pela empresa.'; END IF;
   INSERT INTO public.rota_gastos(rota_id,categoria,valor,data,descricao,autor_id,pago_pela_empresa)
    VALUES(r.id,'hotel',CASE WHEN empresa THEN NULL ELSE (p_dados->>'valor')::numeric END,n,
     'Hotel '||(p_dados->>'hotel_nome')||CASE WHEN empresa THEN ' — pago pela empresa, valor a confirmar pelo financeiro/nota' ELSE '' END,l.vendedor_id,empresa) RETURNING id INTO g;
   IF empresa THEN
    SELECT coalesce(initcap(nullif(btrim(nome),'')),'Vendedor') INTO vend FROM public.profiles WHERE user_id=l.vendedor_id;
    FOR a IN SELECT DISTINCT user_id FROM public.user_roles WHERE role IN ('admin','financeiro') LOOP
     INSERT INTO public.notificacoes(user_id,tipo,chave,titulo,texto,link,rota_id)
      VALUES(a,'julia_viagem','hotel_empresa:'||g,'Hotel pago pela empresa: confirmar valor',
       coalesce(vend,'Vendedor')||' · '||(p_dados->>'hotel_nome')||' ('||coalesce(p_dados->>'cidade','')||'/'||coalesce(p_dados->>'uf','')||') · noite de '||to_char(n,'DD/MM'),
       '/viagens/'||r.id||'/acompanhar',r.id)
      ON CONFLICT (user_id,chave) DO NOTHING;
    END LOOP;
   END IF;
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

CREATE OR REPLACE FUNCTION public.fn_rotas_exigir_notas_hotel()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE n date;
BEGIN
 IF NEW.status='concluida' AND OLD.status IS DISTINCT FROM 'concluida' THEN
  SELECT p.noite INTO n FROM public.rota_pernoites p LEFT JOIN public.rota_gastos g ON g.id=p.gasto_id
   WHERE p.rota_id=NEW.id AND p.tipo='hotel' AND (g.id IS NULL OR nullif(btrim(g.arquivo_path),'' ) IS NULL) ORDER BY p.noite LIMIT 1;
  IF n IS NOT NULL THEN RAISE EXCEPTION 'Envie a foto da nota do hotel da noite de %.',to_char(n,'DD/MM'); END IF;
   SELECT p.noite INTO n FROM public.rota_pernoites p JOIN public.rota_gastos g ON g.id=p.gasto_id
    WHERE p.rota_id=NEW.id AND p.tipo='hotel' AND g.valor IS NULL ORDER BY p.noite LIMIT 1;
   IF n IS NOT NULL THEN RAISE EXCEPTION 'Financeiro precisa informar o valor do hotel da noite de %.',to_char(n,'DD/MM'); END IF;
 END IF;
 RETURN NEW;
END $function$;

INSERT INTO public.push_regras(prefixo,ativo,urgente,descricao) VALUES('hotel_empresa:',true,false,'Financeiro/admin: hotel pago pela empresa, valor a confirmar') ON CONFLICT (prefixo) DO NOTHING;

-- 2) Nova tentativa após caixa postal (uma por dia, pode ser a 4ª automática).
ALTER TABLE public.ligacoes_viagem DROP CONSTRAINT IF EXISTS ligacoes_viagem_origem_check;
ALTER TABLE public.ligacoes_viagem ADD CONSTRAINT ligacoes_viagem_origem_check CHECK (origem = ANY (ARRAY['inicial','retentativa','retorno','teste','faxina','manual','entrada','fechamento','retentativa_retorno']));

CREATE OR REPLACE FUNCTION public.julia_reservar_ligacao(p_rota uuid, p_origem text, p_quando timestamp with time zone, p_admin uuid DEFAULT NULL::uuid, p_teste boolean DEFAULT false)
 RETURNS ligacoes_viagem
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r public.rotas; l public.ligacoes_viagem; n integer; d date:=(now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
 SELECT * INTO r FROM public.rotas WHERE id=p_rota FOR UPDATE;
 IF NOT FOUND OR r.status<>'aprovada' OR d NOT BETWEEN r.data_inicio AND r.data_fim THEN RAISE EXCEPTION 'Selecione uma viagem aprovada em andamento.'; END IF;
 IF NOT (public.has_role(r.vendedor_id,'comercial') OR public.has_role(r.vendedor_id,'rtv') OR (r.vendedor_id='660c2932-4404-48ca-ad2d-c76862bb9d74' AND public.has_role(r.vendedor_id,'admin'))) THEN RAISE EXCEPTION 'Vendedor fora da whitelist.'; END IF;
 IF p_teste AND (p_admin IS DISTINCT FROM '660c2932-4404-48ca-ad2d-c76862bb9d74'::uuid OR NOT public.has_role(p_admin,'admin')) THEN RAISE EXCEPTION 'Teste permitido somente ao Damian administrador.'; END IF;
 IF p_admin IS NOT NULL AND NOT public.has_role(p_admin,'admin') THEN RAISE EXCEPTION 'Somente admin.'; END IF;
 IF p_origem='manual' AND (p_admin IS NULL OR p_teste) THEN RAISE EXCEPTION 'Religar manual é só para admin.'; END IF;
 IF p_origem NOT IN ('inicial','retentativa','retorno','teste','manual','fechamento','retentativa_retorno') OR p_teste<>(p_origem='teste') THEN RAISE EXCEPTION 'Origem inválida.'; END IF;
 IF p_origem='retentativa_retorno' AND NOT EXISTS(SELECT 1 FROM public.ligacoes_viagem WHERE vendedor_id=r.vendedor_id AND data_ref=d AND origem IN ('retorno','fechamento') AND teste=false) THEN RAISE EXCEPTION 'Nova tentativa exige retorno ou fechamento anterior.'; END IF;
 IF p_origem IN ('retorno','retentativa') AND NOT EXISTS(SELECT 1 FROM public.ligacoes_viagem WHERE vendedor_id=r.vendedor_id AND data_ref=d AND origem IN ('inicial','manual') AND teste=false) THEN RAISE EXCEPTION 'Retorno exige tentativa anterior.'; END IF;
 IF (p_quando AT TIME ZONE 'America/Sao_Paulo')::date<>d OR (p_quando AT TIME ZONE 'America/Sao_Paulo')::time>'22:00' THEN RAISE EXCEPTION 'Agende hoje até 22h.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(r.vendedor_id::text||d::text,0));
 IF p_origem='manual' THEN
  IF EXISTS(SELECT 1 FROM public.ligacoes_viagem WHERE vendedor_id=r.vendedor_id AND data_ref=d AND teste=false AND status IN ('discando','em_andamento')) THEN
   RAISE EXCEPTION 'Já existe uma ligação em andamento com este vendedor. Aguarde o encerramento.'; END IF;
  UPDATE public.ligacoes_viagem SET status='cancelada',erro='substituida por religar manual',updated_at=now()
   WHERE vendedor_id=r.vendedor_id AND data_ref=d AND teste=false
     AND (status='aguardando_escolha' OR (status='agendada' AND agendada_para<=now()+interval '15 minutes'));
  INSERT INTO public.ligacoes_viagem(rota_id,vendedor_id,data_ref,tentativa,origem,agendada_para,solicitado_por,teste)
   VALUES(r.id,r.vendedor_id,d,(SELECT coalesce(max(tentativa),0)+1 FROM public.ligacoes_viagem WHERE vendedor_id=r.vendedor_id AND data_ref=d AND teste=false),'manual',p_quando,p_admin,false) RETURNING * INTO l;
  RETURN l;
 END IF;
 SELECT * INTO l FROM public.ligacoes_viagem WHERE vendedor_id=r.vendedor_id AND data_ref=d AND origem=p_origem FOR UPDATE;
 IF FOUND THEN
  IF p_teste AND l.teste AND l.status IN ('falhou','concluida','nao_atendeu') THEN
   UPDATE public.ligacoes_viagem SET rota_id=r.id,status='agendada',agendada_para=p_quando,solicitado_por=p_admin,
    escolha=NULL,telefone=NULL,conversation_id=NULL,call_sid=NULL,resumo=NULL,transcricao=NULL,duracao_s=NULL,erro=NULL,updated_at=now()
    WHERE id=l.id RETURNING * INTO l;
  ELSIF p_teste AND l.status IN ('discando','em_andamento') THEN
   RAISE EXCEPTION 'Já existe uma ligação de teste em andamento. Aguarde o encerramento.';
  ELSIF p_origem IN ('retorno','fechamento') AND l.status NOT IN ('discando','em_andamento') THEN
   UPDATE public.ligacoes_viagem SET rota_id=r.id,status='agendada',agendada_para=p_quando,
    escolha=NULL,telefone=NULL,conversation_id=NULL,call_sid=NULL,resumo=NULL,transcricao=NULL,duracao_s=NULL,erro=NULL,updated_at=now()
    WHERE id=l.id RETURNING * INTO l;
  END IF;
  RETURN l;
 END IF;
 SELECT count(*) INTO n FROM public.ligacoes_viagem WHERE vendedor_id=r.vendedor_id AND data_ref=d AND teste=false AND origem<>'manual';
 -- Só a nova tentativa após caixa postal pode ser a 4ª automática do dia.
 IF NOT p_teste AND p_origem<>'fechamento' AND n>=CASE WHEN p_origem='retentativa_retorno' THEN 4 ELSE 3 END THEN RAISE EXCEPTION 'Máximo de tentativas automáticas por dia.'; END IF;
 INSERT INTO public.ligacoes_viagem(rota_id,vendedor_id,data_ref,tentativa,origem,agendada_para,solicitado_por,teste)
  VALUES(r.id,r.vendedor_id,d,CASE WHEN p_teste THEN 1 ELSE (SELECT coalesce(max(tentativa),0)+1 FROM public.ligacoes_viagem WHERE vendedor_id=r.vendedor_id AND data_ref=d AND teste=false) END,p_origem,p_quando,p_admin,p_teste) RETURNING * INTO l;
 RETURN l;
END $function$;
