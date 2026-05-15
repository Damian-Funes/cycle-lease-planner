DO $$
DECLARE
  v_pipe uuid;
  v_etapa uuid;
  v_prob int;
  r record;
  v_opp uuid;
BEGIN
  SELECT id INTO v_pipe FROM pipelines WHERE nome='Orçamentos' AND ativo=true LIMIT 1;
  SELECT id, probabilidade_default INTO v_etapa, v_prob FROM etapas_pipeline WHERE pipeline_id=v_pipe ORDER BY ordem LIMIT 1;

  FOR r IN SELECT id, numero_orcamento, organizacao_id, total FROM orcamentos
           WHERE oportunidade_id IS NULL AND organizacao_id IS NOT NULL LOOP
    INSERT INTO oportunidades (titulo, organizacao_id, pipeline_id, etapa_id, valor_estimado, probabilidade, status)
    VALUES ('Orçamento ' || r.numero_orcamento, r.organizacao_id, v_pipe, v_etapa, COALESCE(r.total,0), COALESCE(v_prob,50), 'aberta')
    RETURNING id INTO v_opp;
    UPDATE orcamentos SET oportunidade_id = v_opp WHERE id = r.id;
  END LOOP;
END $$;