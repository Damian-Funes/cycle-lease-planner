-- PROPOSTA (aplicar só após aprovação): gasto da Júlia + admin por voz.
-- 1) Ligações recusadas em tabela própria (não polui métricas dos vendedores).
-- 2) Custo e papel (vendedor|admin) em ligacoes_viagem.
-- 3) Limites de alerta configuráveis; alerta no sininho dos admins gerado no banco.
-- 4) Admin atribui compromisso/contato a um vendedor; vendedor sempre fica com ele mesmo (trava aqui).

-- ---------- 1. Configuração ----------
CREATE TABLE IF NOT EXISTS public.julia_gasto_config (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  max_recusadas_dia integer NOT NULL DEFAULT 5 CHECK (max_recusadas_dia >= 1),
  max_minutos_recusadas_dia numeric NOT NULL DEFAULT 10 CHECK (max_minutos_recusadas_dia > 0),
  reais_por_credito numeric CHECK (reais_por_credito IS NULL OR reais_por_credito >= 0),
  reais_por_minuto numeric CHECK (reais_por_minuto IS NULL OR reais_por_minuto >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT, UPDATE ON public.julia_gasto_config TO authenticated;
GRANT ALL ON public.julia_gasto_config TO service_role;
ALTER TABLE public.julia_gasto_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin le config gasto" ON public.julia_gasto_config;
CREATE POLICY "admin le config gasto" ON public.julia_gasto_config FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "admin altera config gasto" ON public.julia_gasto_config;
CREATE POLICY "admin altera config gasto" ON public.julia_gasto_config FOR UPDATE TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
INSERT INTO public.julia_gasto_config (id) VALUES (1) ON CONFLICT DO NOTHING;

-- ---------- 2. Recusadas ----------
CREATE TABLE IF NOT EXISTS public.julia_ligacoes_recusadas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recebida_em timestamptz NOT NULL DEFAULT now(),
  data_ref date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  telefone_mascarado text NOT NULL,
  telefone_hash text,
  call_sid text,
  conversation_id text UNIQUE,
  duracao_s integer CHECK (duracao_s IS NULL OR duracao_s >= 0),
  custo_creditos numeric CHECK (custo_creditos IS NULL OR custo_creditos >= 0),
  motivo text NOT NULL DEFAULT 'nao' CHECK (motivo IN ('nao','ocupado')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS julia_recusadas_data_idx ON public.julia_ligacoes_recusadas (data_ref);
CREATE INDEX IF NOT EXISTS julia_recusadas_sid_idx ON public.julia_ligacoes_recusadas (call_sid);
GRANT SELECT ON public.julia_ligacoes_recusadas TO authenticated;
GRANT ALL ON public.julia_ligacoes_recusadas TO service_role;
ALTER TABLE public.julia_ligacoes_recusadas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin le recusadas" ON public.julia_ligacoes_recusadas;
CREATE POLICY "admin le recusadas" ON public.julia_ligacoes_recusadas FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));

-- ---------- 3. Custo e papel nas ligações ----------
ALTER TABLE public.ligacoes_viagem ADD COLUMN IF NOT EXISTS custo_creditos numeric;
ALTER TABLE public.ligacoes_viagem ADD COLUMN IF NOT EXISTS papel_ligacao text NOT NULL DEFAULT 'vendedor';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ligacoes_viagem_papel_check') THEN
    ALTER TABLE public.ligacoes_viagem ADD CONSTRAINT ligacoes_viagem_papel_check CHECK (papel_ligacao IN ('vendedor','admin'));
  END IF;
END $$;

-- ---------- 4. Registro e fechamento de recusa (service only) ----------
CREATE OR REPLACE FUNCTION public.julia_registrar_recusa(p_mascarado text, p_hash text, p_call_sid text, p_motivo text)
RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO julia_ligacoes_recusadas (telefone_mascarado, telefone_hash, call_sid, motivo)
  VALUES (left(coalesce(p_mascarado,'?'),20), nullif(p_hash,''), nullif(p_call_sid,''), CASE WHEN p_motivo = 'ocupado' THEN 'ocupado' ELSE 'nao' END)
  RETURNING id
$$;

CREATE OR REPLACE FUNCTION public.julia_finalizar_recusa(p_recusa uuid, p_call_sid text, p_conversa text, p_duracao integer, p_creditos numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_dia date; c public.julia_gasto_config; v_qtd integer; v_min numeric; v_excedeu boolean;
BEGIN
  SELECT id INTO v_id FROM julia_ligacoes_recusadas
   WHERE (p_recusa IS NOT NULL AND id = p_recusa) OR (p_recusa IS NULL AND nullif(p_call_sid,'') IS NOT NULL AND call_sid = p_call_sid)
   ORDER BY recebida_em DESC LIMIT 1;
  IF v_id IS NULL THEN
    -- Sem registro da entrada (falha lá): grava assim mesmo para o gasto não sumir.
    INSERT INTO julia_ligacoes_recusadas (telefone_mascarado, call_sid) VALUES ('?', nullif(p_call_sid,'')) RETURNING id INTO v_id;
  END IF;
  UPDATE julia_ligacoes_recusadas SET conversation_id = coalesce(conversation_id, nullif(p_conversa,'')),
    duracao_s = greatest(coalesce(p_duracao,0),0), custo_creditos = p_creditos, updated_at = now()
   WHERE id = v_id RETURNING data_ref INTO v_dia;
  SELECT * INTO c FROM julia_gasto_config WHERE id = 1;
  SELECT count(*), coalesce(sum(duracao_s),0) / 60.0 INTO v_qtd, v_min FROM julia_ligacoes_recusadas WHERE data_ref = v_dia;
  v_excedeu := v_qtd > coalesce(c.max_recusadas_dia,5) OR v_min > coalesce(c.max_minutos_recusadas_dia,10);
  IF v_excedeu THEN
    -- Uma notificação por admin por dia, atualizada com os números do momento.
    INSERT INTO notificacoes (user_id, chave, tipo, titulo, texto, link)
    SELECT ur.user_id, 'julia-recusadas:'||v_dia, 'julia_viagem', 'Júlia: muitas ligações de números de fora',
      v_qtd||' recusadas hoje, '||round(v_min,1)||' min.', '/configuracoes/viagens'
      FROM user_roles ur WHERE ur.role = 'admin'
    ON CONFLICT (user_id, chave) DO UPDATE SET texto = EXCLUDED.texto, lida_em = NULL, resolvida_em = NULL;
  END IF;
  RETURN jsonb_build_object('recusa_id', v_id, 'recusadas_dia', v_qtd, 'minutos_dia', round(v_min,1), 'alerta', v_excedeu);
END $$;

-- ---------- 5. Resumo do gasto (só admin) ----------
CREATE OR REPLACE FUNCTION public.fn_julia_gasto_resumo()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE hoje date := fn_rota_hoje_brt(); c public.julia_gasto_config; r jsonb;
BEGIN
  IF NOT has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Só admin.'; END IF;
  SELECT * INTO c FROM julia_gasto_config WHERE id = 1;
  WITH per(nome, dias) AS (VALUES ('hoje',0),('d7',6),('d30',29)),
  rec AS (
    SELECT p.nome, count(x.id) qtd, coalesce(sum(x.duracao_s),0) seg, sum(x.custo_creditos) cred, count(x.id) FILTER (WHERE x.duracao_s IS NULL) sem_duracao
      FROM per p LEFT JOIN julia_ligacoes_recusadas x ON x.data_ref BETWEEN hoje - p.dias AND hoje GROUP BY p.nome),
  lig AS (
    SELECT p.nome, coalesce(l.papel_ligacao,'vendedor') || CASE WHEN l.teste THEN '_teste' ELSE '' END grupo,
      count(l.id) qtd, coalesce(sum(l.duracao_s),0) seg, sum(l.custo_creditos) cred
      FROM per p JOIN ligacoes_viagem l ON l.data_ref BETWEEN hoje - p.dias AND hoje AND coalesce(l.duracao_s,0) > 0
     GROUP BY p.nome, 2),
  top AS (
    SELECT coalesce(telefone_hash, telefone_mascarado) k, max(telefone_mascarado) mascarado, count(*) qtd,
      coalesce(sum(duracao_s),0) seg, max(recebida_em) ultima
      FROM julia_ligacoes_recusadas WHERE data_ref >= hoje - 29 GROUP BY 1 ORDER BY 3 DESC, 5 DESC LIMIT 10)
  SELECT jsonb_build_object(
    'config', to_jsonb(c),
    'recusadas', (SELECT jsonb_object_agg(nome, jsonb_build_object('qtd',qtd,'segundos',seg,'creditos',cred,'sem_duracao',sem_duracao)) FROM rec),
    'ligacoes', coalesce((SELECT jsonb_agg(jsonb_build_object('periodo',nome,'grupo',grupo,'qtd',qtd,'segundos',seg,'creditos',cred)) FROM lig),'[]'::jsonb),
    'top_numeros', coalesce((SELECT jsonb_agg(jsonb_build_object('numero',mascarado,'qtd',qtd,'segundos',seg,'ultima',ultima)) FROM top),'[]'::jsonb)
  ) INTO r;
  RETURN r;
END $$;

-- ---------- 6. Reserva da entrada com papel admin ----------
DROP FUNCTION IF EXISTS public.julia_reservar_entrada(uuid, uuid, text, text, boolean, uuid);
CREATE OR REPLACE FUNCTION public.julia_reservar_entrada(p_vendedor uuid, p_rota uuid, p_telefone text, p_call_sid text, p_teste boolean, p_solicitante uuid, p_papel text DEFAULT 'vendedor')
RETURNS ligacoes_viagem LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE r public.rotas; l public.ligacoes_viagem; d date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF p_papel NOT IN ('vendedor','admin') THEN RAISE EXCEPTION 'Papel inválido.'; END IF;
  IF p_papel = 'admin' THEN
    -- Admin por voz: lista fixa (Damian), sempre modo livre, em nome próprio.
    IF p_solicitante IS DISTINCT FROM '660c2932-4404-48ca-ad2d-c76862bb9d74'::uuid OR NOT has_role(p_solicitante,'admin') THEN RAISE EXCEPTION 'Admin por voz não autorizado.'; END IF;
    IF p_vendedor IS DISTINCT FROM p_solicitante OR p_rota IS NOT NULL OR p_teste THEN RAISE EXCEPTION 'Admin liga em nome próprio, sem viagem.'; END IF;
  ELSE
    IF p_teste AND (p_solicitante IS DISTINCT FROM '660c2932-4404-48ca-ad2d-c76862bb9d74'::uuid OR NOT has_role(p_solicitante,'admin')) THEN RAISE EXCEPTION 'Teste só para o Damian admin.'; END IF;
    IF NOT p_teste AND p_solicitante IS DISTINCT FROM p_vendedor THEN RAISE EXCEPTION 'Quem ligou não é o vendedor.'; END IF;
    IF NOT p_teste AND NOT has_any_role(p_vendedor, ARRAY['comercial','rtv','gerente_comercial']::app_role[]) THEN RAISE EXCEPTION 'Número exclusivo do comercial.'; END IF;
  END IF;
  IF p_rota IS NOT NULL THEN
    SELECT * INTO r FROM rotas WHERE id = p_rota FOR UPDATE;
    IF NOT FOUND OR r.status <> 'aprovada' OR d NOT BETWEEN r.data_inicio AND r.data_fim OR r.vendedor_id <> p_vendedor THEN RAISE EXCEPTION 'Sem viagem aprovada hoje.'; END IF;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_vendedor::text || d::text, 0));
  IF EXISTS (SELECT 1 FROM ligacoes_viagem WHERE vendedor_id = p_vendedor AND data_ref = d AND teste = p_teste AND status IN ('discando','em_andamento')) THEN
    RAISE EXCEPTION 'Já existe uma ligação em andamento.'; END IF;
  IF NOT p_teste AND p_papel = 'vendedor' THEN
    UPDATE ligacoes_viagem SET status = 'cancelada', erro = 'Vendedor ligou', updated_at = now()
     WHERE vendedor_id = p_vendedor AND data_ref = d AND teste = false AND status IN ('agendada','aguardando_escolha');
  END IF;
  INSERT INTO ligacoes_viagem (rota_id, vendedor_id, data_ref, tentativa, origem, agendada_para, solicitado_por, teste, status, telefone, call_sid, papel_ligacao)
  VALUES (p_rota, p_vendedor, d,
    (SELECT coalesce(max(tentativa),0) + 1 FROM ligacoes_viagem WHERE vendedor_id = p_vendedor AND data_ref = d AND teste = p_teste),
    'entrada', now(), p_solicitante, p_teste, 'em_andamento', p_telefone, nullif(p_call_sid,''), p_papel)
  RETURNING * INTO l;
  RETURN l;
END $function$;

-- ---------- 7. Responsável efetivo (trava admin x vendedor) ----------
-- Só ligação de admin (papel + papel admin no banco) pode atribuir a outro; o alvo tem de ser do comercial.
CREATE OR REPLACE FUNCTION public.fn_julia_responsavel(l public.ligacoes_viagem, p_alvo text)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v uuid := fn_uuid_seguro(p_alvo);
BEGIN
  IF v IS NULL OR v = l.vendedor_id THEN RETURN l.vendedor_id; END IF;
  IF l.papel_ligacao <> 'admin' OR NOT has_role(l.vendedor_id,'admin') THEN RETURN l.vendedor_id; END IF;
  IF NOT has_any_role(v, ARRAY['comercial','rtv','gerente_comercial']::app_role[]) THEN RAISE EXCEPTION 'Vendedor não encontrado no comercial.'; END IF;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.fn_julia_avisar_atribuicao(l public.ligacoes_viagem, p_resp uuid, p_ativ uuid, p_texto text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_resp IS NULL OR p_resp = l.vendedor_id OR p_ativ IS NULL THEN RETURN; END IF;
  INSERT INTO notificacoes (user_id, chave, tipo, titulo, texto, link)
  VALUES (p_resp, 'julia-admin:'||p_ativ, 'julia_viagem',
    coalesce((SELECT split_part(nome,' ',1) FROM profiles WHERE user_id = l.vendedor_id),'Admin')||' marcou para você', left(p_texto,300), '/atividades')
  ON CONFLICT (user_id, chave) DO NOTHING;
END $$;

-- ---------- 8. Compromisso com responsável ----------
CREATE OR REPLACE FUNCTION public.julia_criar_compromisso(p_ligacao uuid, p_dados jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE l public.ligacoes_viagem; o public.organizacoes; v_org uuid := fn_uuid_seguro(p_dados->>'organizacao_id');
  v_tipo text := p_dados->>'tipo'; v_tit text := nullif(btrim(p_dados->>'titulo'),''); v_data date := fn_data_segura(p_dados->>'data');
  v_hora time; quando timestamptz; v_id uuid; v_opp uuid; v_resp uuid;
BEGIN
  l := julia_ligacao_ativa(p_ligacao);
  v_resp := fn_julia_responsavel(l, p_dados->>'responsavel_id');
  IF v_tit IS NULL THEN RAISE EXCEPTION 'Informe o título.'; END IF;
  IF v_tipo NOT IN ('Ligação','Visita','Reunião','Tarefa','WhatsApp') THEN RAISE EXCEPTION 'Tipo inválido.'; END IF;
  IF v_data IS NULL OR v_data < fn_rota_hoje_brt() THEN RAISE EXCEPTION 'Data inválida ou no passado.'; END IF;
  IF coalesce(p_dados->>'hora','') ~ '^\d{2}:\d{2}$' THEN v_hora := (p_dados->>'hora')::time; ELSE v_hora := time '09:00'; END IF;
  quando := (v_data + v_hora) AT TIME ZONE 'America/Sao_Paulo';
  IF quando < now() THEN RAISE EXCEPTION 'Horário no passado.'; END IF;
  IF v_org IS NOT NULL THEN
    SELECT * INTO o FROM organizacoes WHERE id = v_org;
    IF o.id IS NULL OR NOT pode_ver_organizacao(l.vendedor_id, o.estado_id, o.responsavel_id) THEN RAISE EXCEPTION 'Organização não encontrada para este vendedor.'; END IF;
    SELECT id INTO v_opp FROM oportunidades WHERE organizacao_id = v_org AND status = 'aberta' AND responsavel_id = v_resp ORDER BY created_at DESC LIMIT 1;
  END IF;
  INSERT INTO atividades (tipo, tipo_id, titulo, descricao, data_atividade, data_inicio, responsavel_id, organizacao_id, oportunidade_id, concluida, evento_automatico)
  VALUES (lower(v_tipo), (SELECT id FROM tipos_atividade WHERE nome = v_tipo LIMIT 1), v_tit,
    concat_ws(E'\n', nullif(btrim(p_dados->>'descricao'),''),
      CASE WHEN v_resp <> l.vendedor_id THEN 'Marcado por '||coalesce((SELECT nome FROM profiles WHERE user_id = l.vendedor_id),'admin')||' via Júlia' ELSE 'Criado pela Júlia' END),
    quando, quando, v_resp, v_org, v_opp, false, false)
  RETURNING id INTO v_id;
  PERFORM fn_julia_avisar_atribuicao(l, v_resp, v_id, v_tit||' — '||to_char(quando AT TIME ZONE 'America/Sao_Paulo','DD/MM HH24:MI')||coalesce(' · '||coalesce(o.nome_fantasia,o.nome),''));
  RETURN jsonb_build_object('atividade_id', v_id, 'quando', quando, 'empresa', coalesce(o.nome_fantasia, o.nome), 'responsavel_id', v_resp,
    'responsavel_nome', (SELECT nome FROM profiles WHERE user_id = v_resp));
END $function$;

-- ---------- 9. Contato de cliente com responsável ----------
CREATE OR REPLACE FUNCTION public.julia_registrar_contato(p_ligacao uuid, p_org uuid, p_dados jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE l public.ligacoes_viagem; o public.organizacoes; v_pessoa uuid; v_ativ uuid; v_prox uuid; v_r jsonb;
  v_canal text := coalesce(p_dados->>'canal','outro'); v_tipo text; v_tipo_id uuid;
  v_nome text := nullif(btrim(p_dados->>'contato_nome'),''); v_cargo text := nullif(btrim(p_dados->>'contato_cargo'),'');
  v_dec text := nullif(btrim(p_dados->>'decisores'),''); v_res text := nullif(btrim(p_dados->>'resultado'),'');
  v_pp text := nullif(btrim(p_dados->>'proximo_passo'),''); v_ppd date := fn_data_segura(p_dados->>'proximo_passo_data');
  v_criar boolean := coalesce(p_dados->>'contato_novo_confirmado','') = 'true';
  v_resumo text; quando timestamptz; v_amb boolean := false; v_opp uuid; v_contatos jsonb := '[]'::jsonb; v_resp uuid;
BEGIN
  l := julia_ligacao_ativa(p_ligacao);
  v_resp := fn_julia_responsavel(l, p_dados->>'responsavel_id');
  SELECT * INTO o FROM organizacoes WHERE id = p_org;
  IF o.id IS NULL OR o.descartada_em IS NOT NULL OR NOT pode_ver_organizacao(l.vendedor_id, o.estado_id, o.responsavel_id) THEN
    RAISE EXCEPTION 'Organização não encontrada para este vendedor.'; END IF;
  IF v_res IS NULL OR length(v_res) < 10 THEN RAISE EXCEPTION 'Descreva o resultado do contato (mínimo 10 caracteres).'; END IF;
  IF v_canal NOT IN ('telefone','whatsapp','visita','email','outro') THEN RAISE EXCEPTION 'Canal inválido.'; END IF;
  v_tipo := CASE v_canal WHEN 'telefone' THEN 'Ligação' WHEN 'whatsapp' THEN 'WhatsApp' WHEN 'visita' THEN 'Visita' WHEN 'email' THEN 'Email' ELSE 'Nota' END;
  SELECT id INTO v_tipo_id FROM tipos_atividade WHERE nome = v_tipo LIMIT 1;
  SELECT id INTO v_opp FROM oportunidades WHERE organizacao_id = p_org AND status = 'aberta' AND responsavel_id = v_resp ORDER BY created_at DESC LIMIT 1;
  IF v_nome IS NOT NULL THEN
    v_r := fn_resolver_contato_org(p_org, v_nome, v_cargo, false, v_resp, v_criar, 'contato');
    v_pessoa := (v_r->>'pessoa_id')::uuid; v_amb := v_r->>'tipo' = 'ambigua';
    v_contatos := v_contatos || jsonb_build_array(v_r);
  END IF;
  v_contatos := v_contatos || fn_registrar_decisores_detalhe(p_org, v_dec, v_resp, v_criar);
  v_resumo := concat_ws(E'\n', v_res,
    CASE WHEN v_nome IS NOT NULL THEN 'Contato: '||v_nome||coalesce(' ('||v_cargo||')','') END,
    CASE WHEN p_dados ? 'sacos_safra' THEN 'Sacos/safra: '||(p_dados->>'sacos_safra') END,
    CASE WHEN p_dados ? 'equipamento_atual' THEN 'Equipamento: '||(p_dados->>'equipamento_atual') END,
    CASE WHEN p_dados ? 'interesse' THEN 'Interesse: '||(p_dados->>'interesse') END,
    CASE WHEN p_dados ? 'concorrente' THEN 'Concorrente: '||(p_dados->>'concorrente') END,
    CASE WHEN v_pp IS NOT NULL THEN 'Próximo passo: '||v_pp END,
    CASE WHEN v_resp <> l.vendedor_id THEN 'Registrado por '||coalesce((SELECT nome FROM profiles WHERE user_id = l.vendedor_id),'admin') END);
  INSERT INTO atividades (tipo, tipo_id, titulo, descricao, resultado, concluida, situacao, data_conclusao, data_atividade, data_inicio,
    organizacao_id, oportunidade_id, pessoa_id, responsavel_id, evento_automatico)
  VALUES (lower(v_tipo), v_tipo_id, v_tipo||' com cliente (via Júlia)', v_resumo, v_res||' (via Júlia)', true, 'concluida', now(), now(), now(),
    p_org, v_opp, v_pessoa, v_resp, true) RETURNING id INTO v_ativ;
  IF v_ppd IS NOT NULL AND v_ppd >= fn_rota_hoje_brt() THEN
    v_pp := coalesce(v_pp, '(sem descrição)');
    quando := (v_ppd + time '09:00') AT TIME ZONE 'America/Sao_Paulo';
    INSERT INTO atividades (tipo, tipo_id, titulo, descricao, data_atividade, data_inicio, responsavel_id, organizacao_id, oportunidade_id, pessoa_id, concluida, evento_automatico)
    VALUES ('tarefa', (SELECT id FROM tipos_atividade WHERE nome='Tarefa' LIMIT 1), 'Próximo passo: '||v_pp, 'Combinado em contato ('||v_canal||') — via Júlia',
      quando, quando, v_resp, p_org, v_opp, v_pessoa, false, false) RETURNING id INTO v_prox;
    PERFORM fn_julia_avisar_atribuicao(l, v_resp, v_prox, 'Próximo passo: '||v_pp||' — '||to_char(v_ppd,'DD/MM')||' · '||coalesce(o.nome_fantasia,o.nome));
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
    'empresa', coalesce(o.nome_fantasia, o.nome), 'contato_ambiguo', v_amb, 'contatos_resolvidos', v_contatos,
    'responsavel_id', v_resp, 'responsavel_nome', (SELECT nome FROM profiles WHERE user_id = v_resp));
END $function$;

-- ---------- 10. Atividades vencidas de um vendedor (só admin lista; resolver continua só as próprias) ----------
DROP FUNCTION IF EXISTS public.julia_listar_atividades(uuid, integer);
CREATE OR REPLACE FUNCTION public.julia_listar_atividades(p_ligacao uuid, p_limite integer DEFAULT 10, p_vendedor uuid DEFAULT NULL)
RETURNS TABLE(atividade_id uuid, titulo text, tipo text, data date, hora text, empresa text, vencida boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE l public.ligacoes_viagem; v_alvo uuid;
BEGIN
  l := julia_ligacao_ativa(p_ligacao);
  v_alvo := fn_julia_responsavel(l, p_vendedor::text);
  RETURN QUERY
  SELECT a.id, a.titulo, coalesce(t.nome, a.tipo),
    (coalesce(a.data_inicio,a.data_atividade) AT TIME ZONE 'America/Sao_Paulo')::date,
    to_char(coalesce(a.data_inicio,a.data_atividade) AT TIME ZONE 'America/Sao_Paulo','HH24:MI'),
    coalesce(o.nome_fantasia, o.nome),
    (coalesce(a.data_inicio,a.data_atividade) AT TIME ZONE 'America/Sao_Paulo')::date < fn_rota_hoje_brt()
  FROM atividades a LEFT JOIN tipos_atividade t ON t.id = a.tipo_id LEFT JOIN organizacoes o ON o.id = a.organizacao_id
  WHERE a.responsavel_id = v_alvo AND a.concluida = false AND a.situacao = 'aberta' AND NOT a.evento_automatico
    AND (coalesce(a.data_inicio,a.data_atividade) AT TIME ZONE 'America/Sao_Paulo')::date <= fn_rota_hoje_brt()
  ORDER BY coalesce(a.data_inicio,a.data_atividade) LIMIT least(greatest(p_limite,1),20);
END $function$;

-- ---------- Grants ----------
REVOKE ALL ON FUNCTION public.julia_registrar_recusa(text,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.julia_finalizar_recusa(uuid,text,text,integer,numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.julia_reservar_entrada(uuid,uuid,text,text,boolean,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_julia_responsavel(public.ligacoes_viagem,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_julia_avisar_atribuicao(public.ligacoes_viagem,uuid,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.julia_criar_compromisso(uuid,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.julia_registrar_contato(uuid,uuid,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.julia_listar_atividades(uuid,integer,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.julia_registrar_recusa(text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.julia_finalizar_recusa(uuid,text,text,integer,numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.julia_reservar_entrada(uuid,uuid,text,text,boolean,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_julia_responsavel(public.ligacoes_viagem,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_julia_avisar_atribuicao(public.ligacoes_viagem,uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.julia_criar_compromisso(uuid,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.julia_registrar_contato(uuid,uuid,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.julia_listar_atividades(uuid,integer,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.fn_julia_gasto_resumo() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_julia_gasto_resumo() TO authenticated, service_role;
