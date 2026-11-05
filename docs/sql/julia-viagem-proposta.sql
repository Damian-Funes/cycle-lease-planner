-- Aprovada pelo Damian: proposta original + relato de visita. Não inclui cron nem ativação.
BEGIN;
ALTER TABLE public.rota_paradas ADD COLUMN IF NOT EXISTS relato jsonb;

-- Valida o mesmo contrato no banco, inclusive quando a gravação vem diretamente do CRM.
CREATE OR REPLACE FUNCTION public.julia_validar_relato(p_relato jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path=public AS $$
DECLARE k text; v jsonb; item jsonb; data_passo date;
BEGIN
 IF p_relato IS NULL THEN RETURN NULL; END IF;
 IF jsonb_typeof(p_relato)<>'object' THEN RAISE EXCEPTION 'Relato precisa ser um objeto.'; END IF;
 FOR k,v IN SELECT * FROM jsonb_each(p_relato) LOOP
  IF k IN ('contato_nome','contato_cargo','decisores','equipamento_atual','problema_principal','motivo_interesse','concorrente','proximo_passo') THEN
   IF jsonb_typeof(v)<>'string' OR length(btrim(v#>>'{}')) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Relato %: texto de até 500 caracteres.',k; END IF;
  ELSIF k='sacos_safra' THEN
   IF jsonb_typeof(v)<>'number' THEN RAISE EXCEPTION 'sacos_safra deve ser numérico.'; END IF;
   IF (v#>>'{}')::numeric<0 THEN RAISE EXCEPTION 'sacos_safra deve ser maior ou igual a zero.'; END IF;
  ELSIF k='interesse' THEN
   IF jsonb_typeof(v)<>'string' OR v#>>'{}' NOT IN ('alto','medio','baixo') THEN RAISE EXCEPTION 'Interesse inválido.'; END IF;
  ELSIF k='objecoes' THEN
   IF jsonb_typeof(v)<>'array' THEN RAISE EXCEPTION 'Objeções precisam ser uma lista.'; END IF;
   IF jsonb_array_length(v)>20 THEN RAISE EXCEPTION 'Máximo 20 objeções.'; END IF;
   FOR item IN SELECT * FROM jsonb_array_elements(v) LOOP
    IF jsonb_typeof(item)<>'string' OR length(btrim(item#>>'{}')) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Objeção: texto de até 500 caracteres.'; END IF;
   END LOOP;
  ELSIF k='proximo_passo_data' THEN
   IF jsonb_typeof(v)<>'string' OR (v#>>'{}') !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'Data do próximo passo inválida.'; END IF;
   data_passo:=(v#>>'{}')::date;
   IF data_passo<(now() AT TIME ZONE 'America/Sao_Paulo')::date THEN RAISE EXCEPTION 'Data do próximo passo não pode ser passada em BRT.'; END IF;
  ELSIF k='atividade_id' THEN
   PERFORM (v#>>'{}')::uuid; -- metadado atribuído pelo servidor, não aceito pela ferramenta
  ELSE RAISE EXCEPTION 'Campo desconhecido no relato: %.',k;
  END IF;
 END LOOP;
 RETURN p_relato;
END $$;
REVOKE ALL ON FUNCTION public.julia_validar_relato(jsonb) FROM PUBLIC,anon,authenticated;

-- Guarda adicional: preserva integralmente as funções de proteção/reaprovação existentes.
-- relato não entra nas comparações de planejamento; este trigger só protege o novo campo.
CREATE OR REPLACE FUNCTION public.fn_paradas_relato_protecao() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE admin boolean:=coalesce(public.has_role(auth.uid(),'admin'),false); mudou boolean;
BEGIN
 mudou:=CASE WHEN TG_OP='INSERT' THEN NEW.relato IS NOT NULL ELSE NEW.relato IS DISTINCT FROM OLD.relato END;
 IF NOT mudou THEN RETURN NEW; END IF;
 IF NOT admin THEN
  IF TG_OP='UPDATE' THEN
   IF ROW(NEW.visitada,NEW.resultado,NEW.motivo_nao_visita) IS NOT DISTINCT FROM ROW(OLD.visitada,OLD.resultado,OLD.motivo_nao_visita) THEN RAISE EXCEPTION 'Relato só pode ser gravado junto com a prestação da visita.'; END IF;
  END IF;
  IF NEW.visitada IS DISTINCT FROM true OR nullif(btrim(NEW.resultado),'') IS NULL THEN RAISE EXCEPTION 'Relato exige visita realizada com resultado.'; END IF;
 END IF;
 -- Datas antigas permanecem válidas em correções admin que não alterem o compromisso.
 IF TG_OP='UPDATE' AND admin AND NEW.relato->>'proximo_passo_data' IS NOT DISTINCT FROM OLD.relato->>'proximo_passo_data' THEN
  PERFORM public.julia_validar_relato(NEW.relato-'proximo_passo_data');
 ELSE PERFORM public.julia_validar_relato(NEW.relato); END IF;
 IF NEW.relato ? 'atividade_id' AND NOT EXISTS(SELECT 1 FROM public.atividades a JOIN public.rotas r ON r.id=NEW.rota_id WHERE a.id=(NEW.relato->>'atividade_id')::uuid AND a.responsavel_id=r.vendedor_id AND a.organizacao_id=NEW.organizacao_id AND a.oportunidade_id IS NOT DISTINCT FROM NEW.oportunidade_id AND a.titulo='Próximo passo: '||(NEW.relato->>'proximo_passo')) THEN RAISE EXCEPTION 'Atividade do relato não corresponde à visita.'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.fn_paradas_relato_protecao() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_paradas_relato_protecao ON public.rota_paradas;
CREATE TRIGGER trg_paradas_relato_protecao BEFORE INSERT OR UPDATE ON public.rota_paradas FOR EACH ROW EXECUTE FUNCTION public.fn_paradas_relato_protecao();
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS celular text;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.profiles'::regclass AND conname='profiles_celular_e164') THEN
  ALTER TABLE public.profiles ADD CONSTRAINT profiles_celular_e164 CHECK (celular IS NULL OR celular ~ '^\+55[1-9][0-9]{9,10}$');
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public.fn_profiles_celular_admin() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF (TG_OP='INSERT' AND NEW.celular IS NOT NULL) OR (TG_OP='UPDATE' AND NEW.celular IS DISTINCT FROM OLD.celular) THEN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Só o administrador altera o celular do vendedor.'; END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_profiles_celular_admin ON public.profiles;
CREATE TRIGGER trg_profiles_celular_admin BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.fn_profiles_celular_admin();
REVOKE ALL ON FUNCTION public.fn_profiles_celular_admin() FROM PUBLIC,anon,authenticated;

-- Não cria usuários. Ausências são reportadas; as quatro identidades foram conferidas em profiles.user_id.
DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT * FROM (VALUES
 ('0488a4f9-5a4a-4cac-a564-beec5fb21757'::uuid,'+5544991498825'),
 ('2555cff8-3ac8-4525-bf38-6198dc85c887'::uuid,'+5544998600660'),
 ('14138b1c-5b33-4a66-b0f0-fc06e58da561'::uuid,'+5561993354334'),
 ('660c2932-4404-48ca-ad2d-c76862bb9d74'::uuid,'+5544998187930')) AS t(user_id,celular)
 LOOP
  UPDATE public.profiles SET celular=p.celular WHERE user_id=p.user_id;
  IF NOT FOUND THEN RAISE NOTICE 'Profile ausente: %',p.user_id; END IF;
 END LOOP;
END $$;
ALTER TABLE public.viagem_parametros ADD COLUMN IF NOT EXISTS ligacao_ativa boolean NOT NULL DEFAULT false;
ALTER TABLE public.viagem_parametros ADD COLUMN IF NOT EXISTS contato_hora time NOT NULL DEFAULT '16:00';
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.viagem_parametros'::regclass AND conname='julia_contato_janela') THEN
  ALTER TABLE public.viagem_parametros ADD CONSTRAINT julia_contato_janela CHECK(contato_hora>='15:50' AND contato_hora<'22:00');
 END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.ligacoes_viagem (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), rota_id uuid NOT NULL REFERENCES public.rotas(id) ON DELETE CASCADE,
 vendedor_id uuid NOT NULL, data_ref date NOT NULL, tentativa integer NOT NULL,
 origem text NOT NULL CHECK(origem IN ('inicial','retentativa','retorno','teste')),
 status text NOT NULL DEFAULT 'agendada' CHECK(status IN ('aguardando_escolha','agendada','discando','em_andamento','concluida','nao_atendeu','falhou','cancelada')),
 agendada_para timestamptz NOT NULL, escolha text CHECK(escolha IN ('agora','18h','19h','20h','app')),
 telefone text, conversation_id text UNIQUE, call_sid text, resumo text, transcricao jsonb, duracao_s integer, erro text,
 solicitado_por uuid, teste boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(tentativa BETWEEN 1 AND 3), UNIQUE(vendedor_id,data_ref,tentativa), UNIQUE(vendedor_id,data_ref,origem)
);
GRANT SELECT ON public.ligacoes_viagem TO authenticated;
GRANT ALL ON public.ligacoes_viagem TO service_role;
ALTER TABLE public.ligacoes_viagem ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ligacoes_viagem_ler ON public.ligacoes_viagem;
CREATE POLICY ligacoes_viagem_ler ON public.ligacoes_viagem FOR SELECT TO authenticated USING (vendedor_id=auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE INDEX IF NOT EXISTS ligacoes_viagem_agenda_idx ON public.ligacoes_viagem(status,agendada_para);
CREATE TABLE IF NOT EXISTS public.notificacoes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, tipo text NOT NULL, titulo text NOT NULL, texto text, link text,
 chave text NOT NULL, lida_em timestamptz, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,chave)
);
GRANT SELECT ON public.notificacoes TO authenticated;
GRANT UPDATE(lida_em) ON public.notificacoes TO authenticated;
GRANT ALL ON public.notificacoes TO service_role;
ALTER TABLE public.notificacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notificacoes_ler ON public.notificacoes;
CREATE POLICY notificacoes_ler ON public.notificacoes FOR SELECT TO authenticated USING(user_id=auth.uid());
DROP POLICY IF EXISTS notificacoes_marcar ON public.notificacoes;
CREATE POLICY notificacoes_marcar ON public.notificacoes FOR UPDATE TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
CREATE INDEX IF NOT EXISTS notificacoes_user_idx ON public.notificacoes(user_id,lida_em,created_at DESC);

-- Hotel registrado por voz pode aguardar foto; demais validações permanecem.
CREATE OR REPLACE FUNCTION public.fn_pernoites_validar() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.rotas;
BEGIN
 IF TG_OP='UPDATE' THEN NEW.rota_id:=OLD.rota_id; NEW.autor_id:=OLD.autor_id; END IF;
 SELECT * INTO r FROM public.rotas WHERE id=NEW.rota_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Viagem não encontrada.'; END IF;
 IF NEW.noite < r.data_inicio OR NEW.noite >= r.data_fim THEN RAISE EXCEPTION 'A noite precisa estar dentro do período da viagem.'; END IF;
 NEW.estado:=upper(nullif(btrim(NEW.estado),''));
 IF NEW.tipo IN ('hotel','sem_custo') AND (nullif(btrim(NEW.cidade),'') IS NULL OR coalesce(NEW.estado,'') !~ '^[A-Z]{2}$') THEN RAISE EXCEPTION 'Informe cidade e UF de onde dormiu.'; END IF;
 IF NEW.tipo='hotel' THEN
  IF nullif(btrim(NEW.hotel_nome),'') IS NULL THEN RAISE EXCEPTION 'Informe o nome do hotel.'; END IF;
  IF NEW.gasto_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.rota_gastos g WHERE g.id=NEW.gasto_id AND g.rota_id=NEW.rota_id AND g.categoria='hotel') THEN RAISE EXCEPTION 'Pernoite em hotel precisa do gasto de hotel.'; END IF;
 ELSIF nullif(btrim(NEW.observacao),'') IS NULL THEN RAISE EXCEPTION 'Explique por que não houve hotel nesta noite.';
 END IF;
 NEW.updated_at:=now(); RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.fn_pernoites_validar() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.fn_rotas_exigir_notas_hotel() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n date;
BEGIN
 IF NEW.status='concluida' AND OLD.status IS DISTINCT FROM 'concluida' THEN
  SELECT p.noite INTO n FROM public.rota_pernoites p LEFT JOIN public.rota_gastos g ON g.id=p.gasto_id
   WHERE p.rota_id=NEW.id AND p.tipo='hotel' AND (g.id IS NULL OR nullif(btrim(g.arquivo_path),'') IS NULL) ORDER BY p.noite LIMIT 1;
  IF n IS NOT NULL THEN RAISE EXCEPTION 'Envie a foto da nota do hotel da noite de %.',to_char(n,'DD/MM'); END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.fn_rotas_exigir_notas_hotel() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_rotas_exigir_notas_hotel ON public.rotas;
CREATE TRIGGER trg_rotas_exigir_notas_hotel BEFORE UPDATE OF status ON public.rotas FOR EACH ROW EXECUTE FUNCTION public.fn_rotas_exigir_notas_hotel();

-- Reserva transacional: evita duplicidade e corrida entre cron/retorno/admin.
CREATE OR REPLACE FUNCTION public.julia_reservar_ligacao(p_rota uuid,p_origem text,p_quando timestamptz,p_admin uuid DEFAULT NULL,p_teste boolean DEFAULT false)
RETURNS public.ligacoes_viagem LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.rotas; l public.ligacoes_viagem; n integer; d date:=(now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
 SELECT * INTO r FROM public.rotas WHERE id=p_rota FOR UPDATE;
 IF NOT FOUND OR r.status<>'aprovada' OR d NOT BETWEEN r.data_inicio AND r.data_fim THEN RAISE EXCEPTION 'Selecione uma viagem aprovada em andamento.'; END IF;
 IF NOT (public.has_role(r.vendedor_id,'comercial') OR public.has_role(r.vendedor_id,'rtv') OR (r.vendedor_id='660c2932-4404-48ca-ad2d-c76862bb9d74' AND public.has_role(r.vendedor_id,'admin'))) THEN RAISE EXCEPTION 'Vendedor fora da whitelist.'; END IF;
 IF p_teste AND (p_admin IS DISTINCT FROM '660c2932-4404-48ca-ad2d-c76862bb9d74'::uuid OR NOT public.has_role(p_admin,'admin')) THEN RAISE EXCEPTION 'Teste permitido somente ao Damian administrador.'; END IF;
 IF p_admin IS NOT NULL AND NOT public.has_role(p_admin,'admin') THEN RAISE EXCEPTION 'Somente admin.'; END IF;
 IF p_origem NOT IN ('inicial','retentativa','retorno','teste') OR p_teste<>(p_origem='teste') THEN RAISE EXCEPTION 'Origem inválida.'; END IF;
 IF p_origem IN ('retorno','retentativa') AND NOT EXISTS(SELECT 1 FROM public.ligacoes_viagem WHERE vendedor_id=r.vendedor_id AND data_ref=d AND origem='inicial') THEN RAISE EXCEPTION 'Retorno exige tentativa inicial.'; END IF;
 IF (p_quando AT TIME ZONE 'America/Sao_Paulo')::date<>d OR (p_quando AT TIME ZONE 'America/Sao_Paulo')::time>'22:00' THEN RAISE EXCEPTION 'Agende hoje até 22h.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(r.vendedor_id::text||d::text,0));
 SELECT * INTO l FROM public.ligacoes_viagem WHERE vendedor_id=r.vendedor_id AND data_ref=d AND origem=p_origem;
 IF FOUND THEN RETURN l; END IF;
 SELECT coalesce(max(tentativa),0) INTO n FROM public.ligacoes_viagem WHERE vendedor_id=r.vendedor_id AND data_ref=d;
 IF n>=3 THEN RAISE EXCEPTION 'Máximo de 3 tentativas por dia.'; END IF;
 INSERT INTO public.ligacoes_viagem(rota_id,vendedor_id,data_ref,tentativa,origem,agendada_para,solicitado_por,teste)
  VALUES(r.id,r.vendedor_id,d,n+1,p_origem,p_quando,p_admin,p_teste) RETURNING * INTO l;
 RETURN l;
END $$;
REVOKE ALL ON FUNCTION public.julia_reservar_ligacao(uuid,text,timestamptz,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.julia_reservar_ligacao(uuid,text,timestamptz,uuid,boolean) TO service_role;

-- Escolha somente do dono e apenas antes da discagem. Cancelar não apaga histórico.
CREATE OR REPLACE FUNCTION public.julia_escolher_contato(p_ligacao uuid,p_escolha text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE l public.ligacoes_viagem; t timestamptz;
BEGIN
 SELECT * INTO l FROM public.ligacoes_viagem WHERE id=p_ligacao FOR UPDATE;
 IF NOT FOUND OR l.vendedor_id IS DISTINCT FROM auth.uid() OR l.teste THEN RAISE EXCEPTION 'Escolha somente para sua viagem.'; END IF;
 IF l.data_ref<>(now() AT TIME ZONE 'America/Sao_Paulo')::date OR l.status NOT IN ('aguardando_escolha','agendada') THEN RAISE EXCEPTION 'Esta ligação não aceita mais escolha.'; END IF;
 IF p_escolha NOT IN ('agora','18h','19h','20h','app') THEN RAISE EXCEPTION 'Escolha inválida.'; END IF;
 t:=CASE WHEN p_escolha IN ('agora','app') THEN now() ELSE (l.data_ref::text||' '||left(p_escolha,2)||':00:00-03')::timestamptz END;
 IF p_escolha<>'app' AND (t<now()-interval '1 second' OR (t AT TIME ZONE 'America/Sao_Paulo')::time>'22:00') THEN RAISE EXCEPTION 'Escolha um horário futuro até 22h.'; END IF;
 UPDATE public.ligacoes_viagem SET escolha=p_escolha,agendada_para=t,status=CASE WHEN p_escolha='app' THEN 'cancelada' ELSE 'agendada' END,updated_at=now() WHERE id=l.id;
END $$;
REVOKE ALL ON FUNCTION public.julia_escolher_contato(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.julia_escolher_contato(uuid,text) TO authenticated;

-- Único ponto de gravação das ferramentas de voz: transação + identidade do dono para os triggers.
CREATE OR REPLACE FUNCTION public.julia_registrar_voz(p_ligacao uuid,p_rota uuid,p_acao text,p_dados jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE l public.ligacoes_viagem; r public.rotas; p public.rota_paradas; g uuid; texto text; anterior text:=current_setting('request.jwt.claim.sub',true); n date; relato jsonb; atividade uuid; tipo_tarefa uuid; quando timestamptz;
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
  SELECT coalesce(jsonb_object_agg(key,value),'{}'::jsonb) INTO relato FROM jsonb_each(p_dados) WHERE key IN ('contato_nome','contato_cargo','decisores','sacos_safra','equipamento_atual','problema_principal','interesse','motivo_interesse','objecoes','concorrente','proximo_passo','proximo_passo_data');
  PERFORM public.julia_validar_relato(relato);
  IF NOT (p_dados->>'visitada')::boolean AND relato<>'{}'::jsonb THEN RAISE EXCEPTION 'Relato detalhado somente para visita realizada.'; END IF;
  IF (p_dados->>'visitada')::boolean AND relato ? 'proximo_passo' AND relato ? 'proximo_passo_data' AND p.organizacao_id IS NOT NULL THEN
   SELECT id INTO tipo_tarefa FROM public.tipos_atividade WHERE ativo AND lower(nome)='tarefa' ORDER BY ordem,id LIMIT 1;
   IF tipo_tarefa IS NULL THEN RAISE EXCEPTION 'Tipo Tarefa não está disponível na agenda.'; END IF;
   quando:=((relato->>'proximo_passo_data')::date+time '09:00') AT TIME ZONE 'America/Sao_Paulo';
   INSERT INTO public.atividades(tipo,tipo_id,titulo,descricao,conteudo,data_atividade,data_inicio,responsavel_id,organizacao_id,oportunidade_id,concluida,evento_automatico)
    VALUES('tarefa',tipo_tarefa,'Próximo passo: '||(relato->>'proximo_passo'),'Combinado na visita — '||texto,'Combinado na visita — '||texto,quando,quando,l.vendedor_id,p.organizacao_id,p.oportunidade_id,false,false) RETURNING id INTO atividade;
   relato:=relato||jsonb_build_object('atividade_id',atividade);
  END IF;
  UPDATE public.rota_paradas SET visitada=(p_dados->>'visitada')::boolean,resultado=CASE WHEN (p_dados->>'visitada')::boolean THEN texto END,motivo_nao_visita=CASE WHEN NOT (p_dados->>'visitada')::boolean THEN texto END,relato=nullif(relato,'{}'::jsonb) WHERE id=p.id;
  IF (p_dados->>'visitada')::boolean AND p.atividade_id IS NOT NULL THEN
   UPDATE public.atividades SET concluida=true,data_conclusao=now(),resultado=texto WHERE id=p.atividade_id;
  END IF;
  INSERT INTO public.rota_diario(rota_id,parada_id,organizacao_id,autor_id,texto) VALUES(r.id,p.id,p.organizacao_id,l.vendedor_id,'Júlia — '||texto);
 ELSIF p_acao='registrar_pernoite' THEN
  n:=l.data_ref;
  IF n>=r.data_fim THEN RAISE EXCEPTION 'Último dia: não há pernoite a registrar.'; END IF;
  IF p_dados->>'tipo'='hotel' THEN
   INSERT INTO public.rota_gastos(rota_id,categoria,valor,data,descricao,autor_id) VALUES(r.id,'hotel',(p_dados->>'valor')::numeric,n,'Hotel '||(p_dados->>'hotel_nome'),l.vendedor_id) RETURNING id INTO g;
  END IF;
  INSERT INTO public.rota_pernoites(rota_id,noite,tipo,cidade,estado,hotel_nome,gasto_id,observacao,autor_id)
   VALUES(r.id,n,p_dados->>'tipo',p_dados->>'cidade',p_dados->>'uf',p_dados->>'hotel_nome',g,p_dados->>'observacao',l.vendedor_id);
 ELSE RAISE EXCEPTION 'Ferramenta desconhecida.';
 END IF;
 PERFORM set_config('request.jwt.claim.sub',coalesce(anterior,''),true);
 RETURN jsonb_build_object('ok',true,'gasto_id',g,'atividade_id',atividade);
END $$;
REVOKE ALL ON FUNCTION public.julia_registrar_voz(uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.julia_registrar_voz(uuid,uuid,text,jsonb) TO service_role;

-- Webhook inteiro em transação: uma entrega repetida não duplica diário/notificações/retry.
CREATE OR REPLACE FUNCTION public.julia_finalizar_ligacao(p_conversa text,p_falha boolean,p_resumo text,p_transcricao jsonb,p_duracao integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE l public.ligacoes_viagem; n record; d date:=(now() AT TIME ZONE 'America/Sao_Paulo')::date; prox timestamptz:=now()+interval '30 minutes'; total integer;
BEGIN
 SELECT * INTO l FROM public.ligacoes_viagem WHERE conversation_id=p_conversa FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',true,'ignorada',true); END IF;
 IF l.status NOT IN ('discando','em_andamento') THEN RETURN jsonb_build_object('ok',true,'duplicada',true); END IF;
 UPDATE public.ligacoes_viagem SET status=CASE WHEN p_falha THEN 'nao_atendeu' ELSE 'concluida' END,resumo=left(p_resumo,4500),transcricao=p_transcricao,duracao_s=p_duracao,updated_at=now() WHERE id=l.id;
 IF NOT p_falha THEN
  INSERT INTO public.rota_diario(rota_id,autor_id,texto) VALUES(l.rota_id,l.vendedor_id,'Ligação da Júlia: '||left(p_resumo,4500));
 ELSIF NOT l.teste AND l.data_ref=d AND (prox AT TIME ZONE 'America/Sao_Paulo')::date=d AND (prox AT TIME ZONE 'America/Sao_Paulo')::time<'22:00' THEN
  SELECT count(*) INTO total FROM public.ligacoes_viagem WHERE vendedor_id=l.vendedor_id AND data_ref=d;
  IF total<3 AND NOT EXISTS(SELECT 1 FROM public.ligacoes_viagem WHERE vendedor_id=l.vendedor_id AND data_ref=d AND origem IN ('retentativa','retorno'))
     AND EXISTS(SELECT 1 FROM public.rotas WHERE id=l.rota_id AND status='aprovada' AND d BETWEEN data_inicio AND data_fim) THEN
   PERFORM public.julia_reservar_ligacao(l.rota_id,'retentativa',prox);
  END IF;
 END IF;
 FOR n IN SELECT p.noite,p.gasto_id FROM public.rota_pernoites p JOIN public.rota_gastos g ON g.id=p.gasto_id WHERE p.rota_id=l.rota_id AND p.tipo='hotel' AND nullif(btrim(g.arquivo_path),'') IS NULL
 LOOP
  INSERT INTO public.notificacoes(user_id,tipo,titulo,texto,link,chave)
   VALUES(l.vendedor_id,'julia_viagem','Envie a nota do hotel','Noite de '||to_char(n.noite,'DD/MM'),'/viagens/'||l.rota_id||'/hoje?nota='||n.gasto_id,'nota:'||n.gasto_id)
   ON CONFLICT(user_id,chave) DO NOTHING;
 END LOOP;
 RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.julia_finalizar_ligacao(text,boolean,text,jsonb,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.julia_finalizar_ligacao(text,boolean,text,jsonb,integer) TO service_role;
COMMIT;