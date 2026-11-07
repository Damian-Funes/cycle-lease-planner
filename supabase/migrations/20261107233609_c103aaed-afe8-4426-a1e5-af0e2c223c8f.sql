CREATE OR REPLACE FUNCTION public.julia_criar_compromisso(p_ligacao uuid, p_dados jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE l public.ligacoes_viagem; o public.organizacoes; v_org uuid := fn_uuid_seguro(p_dados->>'organizacao_id');
  v_tipo text := p_dados->>'tipo'; v_tit text := nullif(btrim(p_dados->>'titulo'),''); v_data date := fn_data_segura(p_dados->>'data');
  v_hora time; quando timestamptz; v_id uuid; v_opp uuid; v_resp uuid; v_pessoa uuid; v_rc jsonb;
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
    IF nullif(btrim(p_dados->>'contato_nome'),'') IS NOT NULL THEN
      v_rc := fn_resolver_contato_org(v_org, p_dados->>'contato_nome', NULL, false, v_resp,
                coalesce(p_dados->>'contato_novo_confirmado','') = 'true', 'contato');
      v_pessoa := fn_uuid_seguro(v_rc->>'pessoa_id');
    END IF;
  END IF;
  INSERT INTO atividades (tipo, tipo_id, titulo, descricao, data_atividade, data_inicio, responsavel_id, organizacao_id, oportunidade_id, pessoa_id, concluida, evento_automatico)
  VALUES (lower(v_tipo), (SELECT id FROM tipos_atividade WHERE nome = v_tipo LIMIT 1), v_tit,
    concat_ws(E'\n', nullif(btrim(p_dados->>'descricao'),''),
      CASE WHEN v_resp <> l.vendedor_id THEN 'Marcado por '||coalesce((SELECT nome FROM profiles WHERE user_id = l.vendedor_id),'admin')||' via Júlia' ELSE 'Criado pela Júlia' END),
    quando, quando, v_resp, v_org, v_opp, v_pessoa, false, false)
  RETURNING id INTO v_id;
  PERFORM fn_julia_avisar_atribuicao(l, v_resp, v_id, v_tit||' — '||to_char(quando AT TIME ZONE 'America/Sao_Paulo','DD/MM HH24:MI')||coalesce(' · '||coalesce(o.nome_fantasia,o.nome),''));
  RETURN jsonb_build_object('atividade_id', v_id, 'quando', quando, 'empresa', coalesce(o.nome_fantasia, o.nome), 'responsavel_id', v_resp,
    'responsavel_nome', (SELECT nome FROM profiles WHERE user_id = v_resp), 'pessoa_id', v_pessoa,
    'contatos_resolvidos', CASE WHEN v_rc IS NULL THEN NULL ELSE jsonb_build_array(v_rc) END);
END $function$;

UPDATE atividades a SET pessoa_id = c.pessoa_id
FROM fn_casar_pessoa_org_detalhe('637139d1-dc65-4b3c-bd4f-d9f13c92d1d6','Rennan') c
WHERE a.id = 'bf01fac0-588f-4e99-b7e8-ee1e6f03342a' AND a.pessoa_id IS NULL
  AND NOT c.ambigua AND c.tipo = 'exata' AND c.pessoa_id = 'a4454e87-2800-4b6a-9c37-9887b23ae4b0';