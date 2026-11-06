ALTER TABLE public.ligacoes_viagem DROP CONSTRAINT IF EXISTS ligacoes_viagem_origem_check;
ALTER TABLE public.ligacoes_viagem ADD CONSTRAINT ligacoes_viagem_origem_check
  CHECK (origem = ANY (ARRAY['inicial','retentativa','retorno','teste','faxina','manual','entrada']));
ALTER TABLE public.ligacoes_viagem DROP CONSTRAINT IF EXISTS ligacoes_viagem_rota_entrada_check;
ALTER TABLE public.ligacoes_viagem ADD CONSTRAINT ligacoes_viagem_rota_entrada_check
  CHECK (rota_id IS NOT NULL OR origem = 'entrada') NOT VALID;
DROP INDEX IF EXISTS public.ligacoes_viagem_vendedor_id_data_ref_origem_key;
CREATE UNIQUE INDEX ligacoes_viagem_vendedor_id_data_ref_origem_key ON public.ligacoes_viagem (vendedor_id, data_ref, origem)
  WHERE origem NOT IN ('manual','entrada');

CREATE OR REPLACE FUNCTION public.julia_reservar_entrada(p_vendedor uuid, p_rota uuid, p_telefone text, p_call_sid text, p_teste boolean, p_solicitante uuid)
RETURNS public.ligacoes_viagem LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r public.rotas; l public.ligacoes_viagem; d date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF p_teste AND (p_solicitante IS DISTINCT FROM '660c2932-4404-48ca-ad2d-c76862bb9d74'::uuid OR NOT has_role(p_solicitante,'admin')) THEN RAISE EXCEPTION 'Teste só para o Damian admin.'; END IF;
  IF NOT p_teste AND p_solicitante IS DISTINCT FROM p_vendedor THEN RAISE EXCEPTION 'Quem ligou não é o vendedor.'; END IF;
  IF NOT p_teste AND NOT has_any_role(p_vendedor, ARRAY['comercial','rtv','gerente_comercial']::app_role[]) THEN RAISE EXCEPTION 'Número exclusivo do comercial.'; END IF;
  IF p_rota IS NOT NULL THEN
    SELECT * INTO r FROM rotas WHERE id = p_rota FOR UPDATE;
    IF NOT FOUND OR r.status <> 'aprovada' OR d NOT BETWEEN r.data_inicio AND r.data_fim OR r.vendedor_id <> p_vendedor THEN RAISE EXCEPTION 'Sem viagem aprovada hoje.'; END IF;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_vendedor::text || d::text, 0));
  IF EXISTS (SELECT 1 FROM ligacoes_viagem WHERE vendedor_id = p_vendedor AND data_ref = d AND teste = p_teste AND status IN ('discando','em_andamento')) THEN
    RAISE EXCEPTION 'Já existe uma ligação em andamento.'; END IF;
  IF NOT p_teste THEN
    UPDATE ligacoes_viagem SET status = 'cancelada', erro = 'Vendedor ligou', updated_at = now()
     WHERE vendedor_id = p_vendedor AND data_ref = d AND teste = false AND status IN ('agendada','aguardando_escolha');
  END IF;
  INSERT INTO ligacoes_viagem (rota_id, vendedor_id, data_ref, tentativa, origem, agendada_para, solicitado_por, teste, status, telefone, call_sid)
  VALUES (p_rota, p_vendedor, d,
    (SELECT coalesce(max(tentativa),0) + 1 FROM ligacoes_viagem WHERE vendedor_id = p_vendedor AND data_ref = d AND teste = p_teste),
    'entrada', now(), p_solicitante, p_teste, 'em_andamento', p_telefone, nullif(p_call_sid,''))
  RETURNING * INTO l;
  RETURN l;
END $$;

CREATE OR REPLACE FUNCTION public.julia_finalizar_ligacao(p_conversa text, p_falha boolean, p_resumo text, p_transcricao jsonb, p_duracao integer)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE l public.ligacoes_viagem; n record; d date:=(now() AT TIME ZONE 'America/Sao_Paulo')::date; prox timestamptz:=now()+interval '30 minutes'; total integer;
BEGIN
 SELECT * INTO l FROM public.ligacoes_viagem WHERE conversation_id=p_conversa FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',true,'ignorada',true); END IF;
 IF l.status NOT IN ('discando','em_andamento') THEN RETURN jsonb_build_object('ok',true,'duplicada',true); END IF;
 UPDATE public.ligacoes_viagem SET status=CASE WHEN p_falha THEN 'nao_atendeu' ELSE 'concluida' END,resumo=left(p_resumo,4500),transcricao=p_transcricao,duracao_s=p_duracao,updated_at=now() WHERE id=l.id;
 IF l.rota_id IS NULL THEN RETURN jsonb_build_object('ok',true,'livre',true); END IF;
 IF NOT p_falha THEN
  INSERT INTO public.rota_diario(rota_id,autor_id,texto) VALUES(l.rota_id,l.vendedor_id,'Ligação da Júlia: '||left(p_resumo,4500));
 ELSIF NOT l.teste AND l.origem<>'entrada' AND l.data_ref=d AND (prox AT TIME ZONE 'America/Sao_Paulo')::date=d AND (prox AT TIME ZONE 'America/Sao_Paulo')::time<'22:00' THEN
  SELECT count(*) INTO total FROM public.ligacoes_viagem WHERE vendedor_id=l.vendedor_id AND data_ref=d AND teste=false;
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
END $function$;

CREATE OR REPLACE FUNCTION public.julia_ligacao_ativa(p_ligacao uuid)
RETURNS public.ligacoes_viagem LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE l public.ligacoes_viagem;
BEGIN
  SELECT * INTO l FROM ligacoes_viagem WHERE id = p_ligacao AND status IN ('discando','em_andamento') AND data_ref = fn_rota_hoje_brt();
  IF l.id IS NULL THEN RAISE EXCEPTION 'Ligação inválida ou encerrada.'; END IF;
  RETURN l;
END $$;

CREATE OR REPLACE FUNCTION public.julia_registrar_contato(p_ligacao uuid, p_org uuid, p_dados jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE l public.ligacoes_viagem; o public.organizacoes; c record; v_pessoa uuid; v_ativ uuid; v_prox uuid;
  v_canal text := coalesce(p_dados->>'canal','outro'); v_tipo text; v_tipo_id uuid;
  v_nome text := nullif(btrim(p_dados->>'contato_nome'),''); v_cargo text := nullif(btrim(p_dados->>'contato_cargo'),'');
  v_dec text := nullif(btrim(p_dados->>'decisores'),''); v_res text := nullif(btrim(p_dados->>'resultado'),'');
  v_pp text := nullif(btrim(p_dados->>'proximo_passo'),''); v_ppd date := fn_data_segura(p_dados->>'proximo_passo_data');
  v_resumo text; quando timestamptz; v_amb boolean := false; v_opp uuid;
BEGIN
  l := julia_ligacao_ativa(p_ligacao);
  SELECT * INTO o FROM organizacoes WHERE id = p_org;
  IF o.id IS NULL OR o.descartada_em IS NOT NULL OR NOT pode_ver_organizacao(l.vendedor_id, o.estado_id, o.responsavel_id) THEN
    RAISE EXCEPTION 'Organização não encontrada para este vendedor.'; END IF;
  IF v_res IS NULL OR length(v_res) < 10 THEN RAISE EXCEPTION 'Descreva o resultado do contato (mínimo 10 caracteres).'; END IF;
  IF v_canal NOT IN ('telefone','whatsapp','visita','email','outro') THEN RAISE EXCEPTION 'Canal inválido.'; END IF;
  v_tipo := CASE v_canal WHEN 'telefone' THEN 'Ligação' WHEN 'whatsapp' THEN 'WhatsApp' WHEN 'visita' THEN 'Visita' WHEN 'email' THEN 'Email' ELSE 'Nota' END;
  SELECT id INTO v_tipo_id FROM tipos_atividade WHERE nome = v_tipo LIMIT 1;
  SELECT id INTO v_opp FROM oportunidades WHERE organizacao_id = p_org AND status = 'aberta' AND responsavel_id = l.vendedor_id ORDER BY created_at DESC LIMIT 1;
  IF v_nome IS NOT NULL THEN
    SELECT * INTO c FROM fn_casar_pessoa_org(p_org, v_nome);
    IF c.ambigua THEN v_amb := true;
    ELSIF c.pessoa_id IS NULL THEN
      INSERT INTO pessoas (nome, cargo, organizacao_id, responsavel_id) VALUES (v_nome, v_cargo, p_org, l.vendedor_id) RETURNING id INTO v_pessoa;
    ELSE v_pessoa := c.pessoa_id;
      UPDATE pessoas SET cargo = CASE WHEN nullif(btrim(cargo),'') IS NULL AND v_cargo IS NOT NULL THEN v_cargo ELSE cargo END WHERE id = v_pessoa;
    END IF;
  END IF;
  PERFORM fn_registrar_decisores(p_org, v_dec, l.vendedor_id);
  v_resumo := concat_ws(E'\n', v_res,
    CASE WHEN v_nome IS NOT NULL THEN 'Contato: '||v_nome||coalesce(' ('||v_cargo||')','') END,
    CASE WHEN p_dados ? 'sacos_safra' THEN 'Sacos/safra: '||(p_dados->>'sacos_safra') END,
    CASE WHEN p_dados ? 'equipamento_atual' THEN 'Equipamento: '||(p_dados->>'equipamento_atual') END,
    CASE WHEN p_dados ? 'interesse' THEN 'Interesse: '||(p_dados->>'interesse') END,
    CASE WHEN p_dados ? 'concorrente' THEN 'Concorrente: '||(p_dados->>'concorrente') END,
    CASE WHEN v_pp IS NOT NULL THEN 'Próximo passo: '||v_pp END);
  INSERT INTO atividades (tipo, tipo_id, titulo, descricao, resultado, concluida, situacao, data_conclusao, data_atividade, data_inicio,
    organizacao_id, oportunidade_id, pessoa_id, responsavel_id, evento_automatico)
  VALUES (lower(v_tipo), v_tipo_id, v_tipo||' com cliente (via Júlia)', v_resumo, v_res||' (via Júlia)', true, 'concluida', now(), now(), now(),
    p_org, v_opp, v_pessoa, l.vendedor_id, true) RETURNING id INTO v_ativ;
  IF v_ppd IS NOT NULL AND v_ppd >= fn_rota_hoje_brt() THEN
    v_pp := coalesce(v_pp, '(sem descrição)');
    quando := (v_ppd + time '09:00') AT TIME ZONE 'America/Sao_Paulo';
    INSERT INTO atividades (tipo, tipo_id, titulo, descricao, data_atividade, data_inicio, responsavel_id, organizacao_id, oportunidade_id, pessoa_id, concluida, evento_automatico)
    VALUES ('tarefa', (SELECT id FROM tipos_atividade WHERE nome='Tarefa' LIMIT 1), 'Próximo passo: '||v_pp, 'Combinado em contato ('||v_canal||') — via Júlia',
      quando, quando, l.vendedor_id, p_org, v_opp, v_pessoa, false, false) RETURNING id INTO v_prox;
  END IF;
  INSERT INTO organizacao_levantamentos (organizacao_id, origem, autor_id, data_visita, resultado, contato_nome, contato_cargo, decisores,
    sacos_safra, equipamento_atual, problema_principal, interesse, motivo_interesse, objecoes, concorrente, proximo_passo, proximo_passo_data,
    atividade_id, atividade_visita_id, pessoa_id, oportunidade_id)
  VALUES (p_org, 'julia', l.vendedor_id, fn_rota_hoje_brt(), v_res, v_nome, v_cargo, v_dec, fn_num_seguro(p_dados->>'sacos_safra'),
    nullif(btrim(p_dados->>'equipamento_atual'),''), nullif(btrim(p_dados->>'problema_principal'),''),
    CASE WHEN p_dados->>'interesse' IN ('alto','medio','baixo') THEN p_dados->>'interesse' END, nullif(btrim(p_dados->>'motivo_interesse'),''),
    CASE WHEN jsonb_typeof(p_dados->'objecoes')='array' THEN ARRAY(SELECT jsonb_array_elements_text(p_dados->'objecoes')) END,
    nullif(btrim(p_dados->>'concorrente'),''), v_pp, v_ppd, v_prox, v_ativ, v_pessoa, v_opp);
  RETURN jsonb_build_object('atividade_id', v_ativ, 'proximo_passo_atividade_id', v_prox, 'pessoa_id', v_pessoa,
    'empresa', coalesce(o.nome_fantasia, o.nome), 'contato_ambiguo', v_amb);
END $$;

CREATE OR REPLACE FUNCTION public.julia_listar_atividades(p_ligacao uuid, p_limite integer DEFAULT 10)
RETURNS TABLE(atividade_id uuid, titulo text, tipo text, data date, hora text, empresa text, vencida boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE l public.ligacoes_viagem;
BEGIN
  l := julia_ligacao_ativa(p_ligacao);
  RETURN QUERY
  SELECT a.id, a.titulo, coalesce(t.nome, a.tipo),
    (coalesce(a.data_inicio,a.data_atividade) AT TIME ZONE 'America/Sao_Paulo')::date,
    to_char(coalesce(a.data_inicio,a.data_atividade) AT TIME ZONE 'America/Sao_Paulo','HH24:MI'),
    coalesce(o.nome_fantasia, o.nome),
    (coalesce(a.data_inicio,a.data_atividade) AT TIME ZONE 'America/Sao_Paulo')::date < fn_rota_hoje_brt()
  FROM atividades a LEFT JOIN tipos_atividade t ON t.id = a.tipo_id LEFT JOIN organizacoes o ON o.id = a.organizacao_id
  WHERE a.responsavel_id = l.vendedor_id AND a.concluida = false AND a.situacao = 'aberta' AND NOT a.evento_automatico
    AND (coalesce(a.data_inicio,a.data_atividade) AT TIME ZONE 'America/Sao_Paulo')::date <= fn_rota_hoje_brt()
  ORDER BY coalesce(a.data_inicio,a.data_atividade) LIMIT least(greatest(p_limite,1),20);
END $$;

CREATE OR REPLACE FUNCTION public.julia_resolver_atividade(p_ligacao uuid, p_atividade uuid, p_acao text, p_resultado text, p_nova_data date, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE l public.ligacoes_viagem; a public.atividades; quando timestamptz;
BEGIN
  l := julia_ligacao_ativa(p_ligacao);
  SELECT * INTO a FROM atividades WHERE id = p_atividade;
  IF a.id IS NULL OR a.responsavel_id IS DISTINCT FROM l.vendedor_id THEN RAISE EXCEPTION 'Atividade não encontrada para este vendedor.'; END IF;
  IF p_acao IN ('reagendar','nao_fiz') THEN
    IF p_nova_data IS NULL THEN RAISE EXCEPTION 'Informe a nova data.'; END IF;
    quando := (p_nova_data + coalesce((coalesce(a.data_inicio,a.data_atividade) AT TIME ZONE 'America/Sao_Paulo')::time, time '09:00')) AT TIME ZONE 'America/Sao_Paulo';
  END IF;
  CASE p_acao
    WHEN 'feito' THEN PERFORM fn_atividade_concluir(p_atividade, p_resultado, l.vendedor_id, 'julia');
    WHEN 'cancelar' THEN PERFORM fn_atividade_cancelar(p_atividade, p_motivo, l.vendedor_id, 'julia');
    WHEN 'reagendar' THEN PERFORM fn_atividade_reagendar(p_atividade, quando, p_motivo, l.vendedor_id, 'julia');
    WHEN 'nao_fiz' THEN PERFORM fn_atividade_nao_fiz(p_atividade, quando, p_motivo, l.vendedor_id, 'julia');
    ELSE RAISE EXCEPTION 'Ação inválida.';
  END CASE;
  RETURN jsonb_build_object('atividade_id', p_atividade, 'acao', p_acao, 'titulo', a.titulo, 'nova_data', p_nova_data);
END $$;

CREATE OR REPLACE FUNCTION public.julia_criar_compromisso(p_ligacao uuid, p_dados jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE l public.ligacoes_viagem; o public.organizacoes; v_org uuid := fn_uuid_seguro(p_dados->>'organizacao_id');
  v_tipo text := p_dados->>'tipo'; v_tit text := nullif(btrim(p_dados->>'titulo'),''); v_data date := fn_data_segura(p_dados->>'data');
  v_hora time; quando timestamptz; v_id uuid; v_opp uuid;
BEGIN
  l := julia_ligacao_ativa(p_ligacao);
  IF v_tit IS NULL THEN RAISE EXCEPTION 'Informe o título.'; END IF;
  IF v_tipo NOT IN ('Ligação','Visita','Reunião','Tarefa','WhatsApp') THEN RAISE EXCEPTION 'Tipo inválido.'; END IF;
  IF v_data IS NULL OR v_data < fn_rota_hoje_brt() THEN RAISE EXCEPTION 'Data inválida ou no passado.'; END IF;
  IF coalesce(p_dados->>'hora','') ~ '^\d{2}:\d{2}$' THEN v_hora := (p_dados->>'hora')::time; ELSE v_hora := time '09:00'; END IF;
  quando := (v_data + v_hora) AT TIME ZONE 'America/Sao_Paulo';
  IF quando < now() THEN RAISE EXCEPTION 'Horário no passado.'; END IF;
  IF v_org IS NOT NULL THEN
    SELECT * INTO o FROM organizacoes WHERE id = v_org;
    IF o.id IS NULL OR NOT pode_ver_organizacao(l.vendedor_id, o.estado_id, o.responsavel_id) THEN RAISE EXCEPTION 'Organização não encontrada para este vendedor.'; END IF;
    SELECT id INTO v_opp FROM oportunidades WHERE organizacao_id = v_org AND status = 'aberta' AND responsavel_id = l.vendedor_id ORDER BY created_at DESC LIMIT 1;
  END IF;
  INSERT INTO atividades (tipo, tipo_id, titulo, descricao, data_atividade, data_inicio, responsavel_id, organizacao_id, oportunidade_id, concluida, evento_automatico)
  VALUES (lower(v_tipo), (SELECT id FROM tipos_atividade WHERE nome = v_tipo LIMIT 1), v_tit,
    concat_ws(E'\n', nullif(btrim(p_dados->>'descricao'),''), 'Criado pela Júlia'), quando, quando, l.vendedor_id, v_org, v_opp, false, false)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('atividade_id', v_id, 'quando', quando, 'empresa', coalesce(o.nome_fantasia, o.nome));
END $$;

DO $$ DECLARE f text; BEGIN
  FOREACH f IN ARRAY ARRAY['julia_reservar_entrada(uuid,uuid,text,text,boolean,uuid)','julia_ligacao_ativa(uuid)',
    'julia_registrar_contato(uuid,uuid,jsonb)','julia_listar_atividades(uuid,integer)',
    'julia_resolver_atividade(uuid,uuid,text,text,date,text)','julia_criar_compromisso(uuid,jsonb)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM public, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', f);
  END LOOP;
END $$;