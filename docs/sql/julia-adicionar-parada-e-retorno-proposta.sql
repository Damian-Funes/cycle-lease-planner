-- PROPOSTA (não aplicada). Aplicar só com OK explícito do CEO, após teste em BEGIN…ROLLBACK.
-- Parte 1: Júlia adiciona parada fora da rota. Parte 2: retorno não some com religar manual + ligação de fechamento.

-- ===== Parte 1 =====
ALTER TABLE public.rota_paradas ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'planejada';
ALTER TABLE public.rota_paradas DROP CONSTRAINT IF EXISTS rota_paradas_origem_check;
ALTER TABLE public.rota_paradas ADD CONSTRAINT rota_paradas_origem_check CHECK (origem IN ('planejada','julia'));
ALTER TABLE public.rota_paradas ADD COLUMN IF NOT EXISTS criada_por uuid;
ALTER TABLE public.rota_paradas ADD COLUMN IF NOT EXISTS ligacao_id uuid REFERENCES public.ligacoes_viagem(id) ON DELETE SET NULL;
ALTER TABLE public.organizacoes ADD COLUMN IF NOT EXISTS criada_pela_julia boolean NOT NULL DEFAULT false;

-- Parada extra da Júlia não é replanejamento: não volta a viagem para aprovação.
CREATE OR REPLACE FUNCTION public.fn_paradas_reaprovacao() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE rid uuid; planejamento boolean;
BEGIN
 rid:=CASE WHEN TG_OP='DELETE' THEN OLD.rota_id ELSE NEW.rota_id END;
 planejamento:=TG_OP IN ('INSERT','DELETE');
 IF TG_OP='INSERT' AND NEW.origem='julia' AND current_setting('app.julia_parada_extra',true)='on' THEN planejamento:=false; END IF;
 IF TG_OP='UPDATE' THEN planejamento:=ROW(NEW.oportunidade_id,NEW.cidade,NEW.estado,NEW.ordem,NEW.objetivo,NEW.tipo,NEW.latitude,NEW.longitude,NEW.atividade_id) IS DISTINCT FROM ROW(OLD.oportunidade_id,OLD.cidade,OLD.estado,OLD.ordem,OLD.objetivo,OLD.tipo,OLD.latitude,OLD.longitude,OLD.atividade_id) OR (OLD.organizacao_id IS NOT NULL AND NEW.organizacao_id IS DISTINCT FROM OLD.organizacao_id); END IF;
 IF planejamento THEN UPDATE public.rotas SET status='aguardando_aprovacao' WHERE id=rid AND status='aprovada' AND coalesce(data_fim,data_rota)>=(now() AT TIME ZONE 'America/Sao_Paulo')::date; END IF;
 RETURN NULL;
END $$;

-- Igual à atual, com 2 exceções para a parada extra da Júlia:
--  (a) no INSERT feito pela função da Júlia, o dia pedido é mantido (dia anterior da viagem);
--  (b) ao prestar contas de parada 'julia' que já tem dia, o dia é mantido (não vira "hoje").
CREATE OR REPLACE FUNCTION public.fn_paradas_protecao() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE r public.rotas; planejamento boolean; admin boolean:=coalesce(public.has_role(auth.uid(),'admin'),false); hoje date:=(now() AT TIME ZONE 'America/Sao_Paulo')::date; prestou boolean:=false;
 extra boolean:=TG_OP='INSERT' AND NEW.origem='julia' AND current_setting('app.julia_parada_extra',true)='on';
BEGIN
 IF TG_OP='UPDATE' AND NEW.rota_id IS DISTINCT FROM OLD.rota_id THEN RAISE EXCEPTION 'Não é permitido transferir paradas entre rotas.'; END IF;
 SELECT * INTO r FROM public.rotas WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.rota_id ELSE NEW.rota_id END FOR UPDATE;
 IF NOT FOUND THEN IF TG_OP='DELETE' THEN RETURN OLD; END IF; RAISE EXCEPTION 'Rota não encontrada.'; END IF;
 IF NOT admin AND r.status IN ('concluida','cancelada') THEN RAISE EXCEPTION 'Paradas de uma rota encerrada não podem ser alteradas.'; END IF;
 IF TG_OP='INSERT' AND NEW.tipo='pernoite' THEN RAISE EXCEPTION 'Pernoites são registrados durante a viagem, não no planejamento.'; END IF;
 planejamento:=TG_OP IN ('INSERT','DELETE') AND NOT extra;
 IF TG_OP='UPDATE' THEN planejamento:=ROW(NEW.oportunidade_id,NEW.cidade,NEW.estado,NEW.ordem,NEW.objetivo,NEW.tipo,NEW.latitude,NEW.longitude,NEW.atividade_id) IS DISTINCT FROM ROW(OLD.oportunidade_id,OLD.cidade,OLD.estado,OLD.ordem,OLD.objetivo,OLD.tipo,OLD.latitude,OLD.longitude,OLD.atividade_id) OR (OLD.organizacao_id IS NOT NULL AND NEW.organizacao_id IS DISTINCT FROM OLD.organizacao_id); END IF;
 IF planejamento AND NOT admin AND r.status='aprovada' AND coalesce(r.data_fim,r.data_rota)<hoje THEN RAISE EXCEPTION 'O plano de uma viagem passada não pode ser alterado. Preste contas.'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF (TG_OP='INSERT' AND (NEW.visitada IS NOT NULL OR NEW.resultado IS NOT NULL OR NEW.motivo_nao_visita IS NOT NULL)) OR (TG_OP='UPDATE' AND ROW(NEW.visitada,NEW.resultado,NEW.motivo_nao_visita) IS DISTINCT FROM ROW(OLD.visitada,OLD.resultado,OLD.motivo_nao_visita)) THEN
   IF NOT admin AND (r.status<>'aprovada' OR coalesce(r.data_inicio,r.data_rota)>hoje) THEN RAISE EXCEPTION 'Preste contas somente na data de uma viagem aprovada.'; END IF;
   prestou:=true;
   NEW.informada_em:=CASE WHEN NEW.visitada IS NULL THEN NULL ELSE now() END;
 ELSIF TG_OP='UPDATE' THEN NEW.informada_em:=OLD.informada_em; ELSE NEW.informada_em:=NULL; END IF;
 IF prestou THEN
   NEW.dia := CASE WHEN NEW.visitada IS NULL THEN NULL
                   WHEN TG_OP='UPDATE' AND OLD.origem='julia' AND OLD.dia IS NOT NULL THEN OLD.dia
                   ELSE least(greatest(hoje, coalesce(r.data_inicio,r.data_rota)), coalesce(r.data_fim,r.data_rota)) END;
 ELSIF TG_OP='UPDATE' AND NOT admin THEN NEW.dia := OLD.dia;
 ELSIF TG_OP='INSERT' AND NOT extra THEN NEW.dia := NULL;
 END IF;
 IF NEW.dia IS NOT NULL AND (NEW.dia < coalesce(r.data_inicio,r.data_rota) OR NEW.dia > coalesce(r.data_fim,r.data_rota)) THEN RAISE EXCEPTION 'O dia da parada precisa estar dentro do período da viagem.'; END IF;
 RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.julia_adicionar_parada(p_ligacao uuid, p_rota uuid, p_dados jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE l public.ligacoes_viagem; r public.rotas; hoje date:=(now() AT TIME ZONE 'America/Sao_Paulo')::date;
 d date; org uuid:=public.fn_uuid_seguro(p_dados->>'organizacao_id'); onome text; v_nome text:=nullif(btrim(p_dados->>'nome_empresa'),'');
 cid text:=nullif(btrim(p_dados->>'cidade'),''); uf text:=upper(nullif(btrim(p_dados->>'uf'),'')); criada boolean:=false;
 pid uuid; anterior text:=current_setting('request.jwt.claim.sub',true); vend text; a uuid;
BEGIN
 SELECT * INTO l FROM public.ligacoes_viagem WHERE id=p_ligacao;
 IF NOT FOUND OR l.status NOT IN ('discando','em_andamento') OR l.rota_id IS DISTINCT FROM p_rota THEN RAISE EXCEPTION 'Ligação não está ativa nesta viagem.'; END IF;
 SELECT * INTO r FROM public.rotas WHERE id=p_rota FOR UPDATE;
 IF NOT FOUND OR r.status<>'aprovada' OR r.vendedor_id<>l.vendedor_id THEN RAISE EXCEPTION 'Viagem indisponível.'; END IF;
 d:=coalesce(nullif(p_dados->>'dia','')::date, hoje);
 IF d>hoje OR d<coalesce(r.data_inicio,r.data_rota) OR d>coalesce(r.data_fim,r.data_rota) THEN RAISE EXCEPTION 'O dia % não é um dia desta viagem até hoje.', to_char(d,'DD/MM'); END IF;
 PERFORM set_config('request.jwt.claim.sub',r.vendedor_id::text,true);
 IF org IS NOT NULL THEN
  SELECT o.nome,o.cidade,o.estado INTO onome,cid,uf FROM public.organizacoes o WHERE o.id=org;
  IF NOT FOUND THEN RAISE EXCEPTION 'Organização não encontrada.'; END IF;
 ELSE
  IF v_nome IS NULL OR cid IS NULL OR uf !~ '^[A-Z]{2}$' THEN RAISE EXCEPTION 'Informe nome da empresa, cidade e UF.'; END IF;
  SELECT id,nome INTO org,onome FROM public.organizacoes
   WHERE public.fn_nome_normalizado(organizacoes.nome)=public.fn_nome_normalizado(v_nome)
     AND upper(coalesce(estado,''))=uf AND public.fn_nome_normalizado(coalesce(cidade,''))=public.fn_nome_normalizado(cid)
     AND descartada_em IS NULL ORDER BY created_at LIMIT 1;
  IF org IS NULL THEN
   -- responsavel_id: trigger de criação usa o vendedor (claim acima); nunca admin.
   INSERT INTO public.organizacoes(nome,cidade,estado,criada_pela_julia) VALUES(v_nome,cid,uf,true) RETURNING id,nome INTO org,onome;
   criada:=true;
  END IF;
 END IF;
 -- Duplicata: mesma organização nesta viagem no mesmo dia, ou planejada ainda não informada (se o pedido é hoje).
 SELECT id INTO pid FROM public.rota_paradas WHERE rota_id=r.id AND organizacao_id=org AND tipo<>'pernoite'
  AND (dia=d OR (dia IS NULL AND visitada IS NULL AND d=hoje)) ORDER BY ordem LIMIT 1;
 IF pid IS NOT NULL THEN
  PERFORM set_config('request.jwt.claim.sub',coalesce(anterior,''),true);
  RETURN jsonb_build_object('ok',true,'parada_id',pid,'organizacao_id',org,'empresa',onome,'ja_existia',true,'organizacao_criada',false,'dia',d);
 END IF;
 PERFORM set_config('app.julia_parada_extra','on',true);
 INSERT INTO public.rota_paradas(rota_id,organizacao_id,cidade,estado,tipo,ordem,dia,origem,criada_por,ligacao_id,objetivo)
  VALUES(r.id,org,cid,uf,'visita',(SELECT coalesce(max(ordem),0)+1 FROM public.rota_paradas WHERE rota_id=r.id),d,'julia',r.vendedor_id,l.id,'Visita fora da rota (Júlia)')
  RETURNING id INTO pid;
 PERFORM set_config('app.julia_parada_extra','off',true);
 PERFORM set_config('request.jwt.claim.sub',coalesce(anterior,''),true);
 SELECT coalesce(nullif(btrim(nome),''),'Vendedor') INTO vend FROM public.profiles WHERE user_id=r.vendedor_id;
 FOR a IN SELECT user_id FROM public.user_roles WHERE role='admin' LOOP
  INSERT INTO public.notificacoes(user_id,tipo,chave,titulo,texto,link,rota_id)
   VALUES(a,'julia_viagem','parada_extra:'||pid,'Parada adicionada fora da rota: '||onome||' por '||coalesce(vend,'Vendedor'),
    to_char(d,'DD/MM')||CASE WHEN criada THEN ' · empresa nova, a completar' ELSE '' END,'/viagens/'||r.id||'/acompanhar',r.id)
   ON CONFLICT (user_id,chave) DO NOTHING;
 END LOOP;
 RETURN jsonb_build_object('ok',true,'parada_id',pid,'organizacao_id',org,'empresa',onome,'ja_existia',false,'organizacao_criada',criada,'dia',d);
END $$;
REVOKE ALL ON FUNCTION public.julia_adicionar_parada(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.julia_adicionar_parada(uuid,uuid,jsonb) TO service_role;

INSERT INTO public.push_regras(prefixo,ativo,urgente,descricao) VALUES('parada_extra:',true,false,'Admins: Júlia adicionou parada fora da rota') ON CONFLICT (prefixo) DO NOTHING;

-- ===== Parte 2 =====
ALTER TABLE public.ligacoes_viagem DROP CONSTRAINT ligacoes_viagem_origem_check;
ALTER TABLE public.ligacoes_viagem ADD CONSTRAINT ligacoes_viagem_origem_check CHECK (origem = ANY (ARRAY['inicial','retentativa','retorno','teste','faxina','manual','entrada','fechamento']));

CREATE OR REPLACE FUNCTION public.julia_reservar_ligacao(p_rota uuid,p_origem text,p_quando timestamptz,p_admin uuid DEFAULT NULL,p_teste boolean DEFAULT false)
RETURNS public.ligacoes_viagem LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.rotas; l public.ligacoes_viagem; n integer; d date:=(now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
 SELECT * INTO r FROM public.rotas WHERE id=p_rota FOR UPDATE;
 IF NOT FOUND OR r.status<>'aprovada' OR d NOT BETWEEN r.data_inicio AND r.data_fim THEN RAISE EXCEPTION 'Selecione uma viagem aprovada em andamento.'; END IF;
 IF NOT (public.has_role(r.vendedor_id,'comercial') OR public.has_role(r.vendedor_id,'rtv') OR (r.vendedor_id='660c2932-4404-48ca-ad2d-c76862bb9d74' AND public.has_role(r.vendedor_id,'admin'))) THEN RAISE EXCEPTION 'Vendedor fora da whitelist.'; END IF;
 IF p_teste AND (p_admin IS DISTINCT FROM '660c2932-4404-48ca-ad2d-c76862bb9d74'::uuid OR NOT public.has_role(p_admin,'admin')) THEN RAISE EXCEPTION 'Teste permitido somente ao Damian administrador.'; END IF;
 IF p_admin IS NOT NULL AND NOT public.has_role(p_admin,'admin') THEN RAISE EXCEPTION 'Somente admin.'; END IF;
 IF p_origem='manual' AND (p_admin IS NULL OR p_teste) THEN RAISE EXCEPTION 'Religar manual é só para admin.'; END IF;
 IF p_origem NOT IN ('inicial','retentativa','retorno','teste','manual','fechamento') OR p_teste<>(p_origem='teste') THEN RAISE EXCEPTION 'Origem inválida.'; END IF;
 IF p_origem IN ('retorno','retentativa') AND NOT EXISTS(SELECT 1 FROM public.ligacoes_viagem WHERE vendedor_id=r.vendedor_id AND data_ref=d AND origem IN ('inicial','manual') AND teste=false) THEN RAISE EXCEPTION 'Retorno exige tentativa anterior.'; END IF;
 IF (p_quando AT TIME ZONE 'America/Sao_Paulo')::date<>d OR (p_quando AT TIME ZONE 'America/Sao_Paulo')::time>'22:00' THEN RAISE EXCEPTION 'Agende hoje até 22h.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(r.vendedor_id::text||d::text,0));
 IF p_origem='manual' THEN
  IF EXISTS(SELECT 1 FROM public.ligacoes_viagem WHERE vendedor_id=r.vendedor_id AND data_ref=d AND teste=false AND status IN ('discando','em_andamento')) THEN
   RAISE EXCEPTION 'Já existe uma ligação em andamento com este vendedor. Aguarde o encerramento.'; END IF;
  -- Só substitui o que seria agora (até +15 min) ou aguardava escolha; retorno marcado para mais tarde fica.
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
   -- Antes: devolvia a linha antiga (até cancelada) e a ferramenta dizia "ok". Agora reagenda de fato.
   UPDATE public.ligacoes_viagem SET rota_id=r.id,status='agendada',agendada_para=p_quando,
    escolha=NULL,telefone=NULL,conversation_id=NULL,call_sid=NULL,resumo=NULL,transcricao=NULL,duracao_s=NULL,erro=NULL,updated_at=now()
    WHERE id=l.id RETURNING * INTO l;
  END IF;
  RETURN l;
 END IF;
 SELECT count(*) INTO n FROM public.ligacoes_viagem WHERE vendedor_id=r.vendedor_id AND data_ref=d AND teste=false AND origem<>'manual';
 IF NOT p_teste AND n>=3 AND p_origem<>'fechamento' THEN RAISE EXCEPTION 'Máximo de 3 tentativas por dia.'; END IF;
 INSERT INTO public.ligacoes_viagem(rota_id,vendedor_id,data_ref,tentativa,origem,agendada_para,solicitado_por,teste)
  VALUES(r.id,r.vendedor_id,d,CASE WHEN p_teste THEN 1 ELSE (SELECT coalesce(max(tentativa),0)+1 FROM public.ligacoes_viagem WHERE vendedor_id=r.vendedor_id AND data_ref=d AND teste=false) END,p_origem,p_quando,p_admin,p_teste) RETURNING * INTO l;
 RETURN l;
END $$;
REVOKE ALL ON FUNCTION public.julia_reservar_ligacao(uuid,text,timestamptz,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.julia_reservar_ligacao(uuid,text,timestamptz,uuid,boolean) TO service_role;
