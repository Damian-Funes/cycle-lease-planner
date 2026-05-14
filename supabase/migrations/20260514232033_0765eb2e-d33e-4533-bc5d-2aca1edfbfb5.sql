-- Função de cálculo de rotting estilo Pipedrive
CREATE OR REPLACE FUNCTION public.fn_oportunidade_rotting(opp_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rotting_days int;
  v_ultima timestamptz;
  v_proxima timestamptz;
  v_created timestamptz;
  v_dias numeric;
BEGIN
  SELECT ep.rotting_days, o.ultima_atividade_em, o.proxima_atividade_em, o.created_at
    INTO v_rotting_days, v_ultima, v_proxima, v_created
  FROM public.oportunidades o
  JOIN public.etapas_pipeline ep ON ep.id = o.etapa_id
  WHERE o.id = opp_id;

  IF v_rotting_days IS NULL THEN
    RETURN 'fresh';
  END IF;

  -- Atividade futura agendada → fresh
  IF v_proxima IS NOT NULL AND v_proxima > now() THEN
    RETURN 'fresh';
  END IF;

  v_dias := EXTRACT(EPOCH FROM (now() - COALESCE(v_ultima, v_created))) / 86400.0;

  -- Sem nenhuma atividade futura agendada e sem interação recente
  IF v_proxima IS NULL AND v_dias > 3 THEN
    -- escala normal de rotting tem prioridade sobre no_activity quando já passou do limite
    IF v_dias >= v_rotting_days THEN RETURN 'rotting'; END IF;
    IF v_dias >= v_rotting_days / 2.0 THEN RETURN 'aging'; END IF;
    RETURN 'no_activity';
  END IF;

  IF v_dias >= v_rotting_days THEN RETURN 'rotting';
  ELSIF v_dias >= v_rotting_days / 2.0 THEN RETURN 'aging';
  ELSE RETURN 'fresh';
  END IF;
END;
$$;

-- View do kanban com joins e rotting calculado
CREATE OR REPLACE VIEW public.v_oportunidades_kanban AS
SELECT
  o.id,
  o.titulo,
  o.pipeline_id,
  o.etapa_id,
  o.organizacao_id,
  o.responsavel_id,
  o.valor_estimado,
  o.probabilidade,
  o.status,
  o.motivo_perda,
  o.data_fechamento_prevista,
  o.data_fechamento_real,
  o.ordem_coluna,
  o.ultima_atividade_em,
  o.proxima_atividade_em,
  o.created_at,
  o.updated_at,
  org.nome           AS organizacao_nome,
  prof.nome          AS responsavel_nome,
  prof.email         AS responsavel_email,
  ep.cor             AS etapa_cor,
  ep.rotting_days    AS etapa_rotting_days,
  public.fn_oportunidade_rotting(o.id) AS rotting_status,
  GREATEST(0, EXTRACT(EPOCH FROM (now() - COALESCE(o.ultima_atividade_em, o.created_at))) / 86400.0)::int AS dias_sem_atividade
FROM public.oportunidades o
LEFT JOIN public.organizacoes  org  ON org.id  = o.organizacao_id
LEFT JOIN public.profiles      prof ON prof.id = o.responsavel_id
LEFT JOIN public.etapas_pipeline ep ON ep.id   = o.etapa_id;

GRANT SELECT ON public.v_oportunidades_kanban TO anon, authenticated;