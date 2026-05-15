
CREATE OR REPLACE VIEW public.v_relatorio_forecast_mensal AS
SELECT
  date_trunc('month', o.data_fechamento_prevista)::date AS mes,
  o.pipeline_id,
  o.etapa_id,
  ep.nome AS etapa_nome,
  ep.cor  AS etapa_cor,
  ep.ordem AS etapa_ordem,
  o.responsavel_id,
  count(*)::int AS qtd,
  sum(o.valor_estimado)::numeric AS valor_total,
  sum(o.valor_estimado * o.probabilidade / 100.0)::numeric AS forecast_ponderado
FROM public.oportunidades o
LEFT JOIN public.etapas_pipeline ep ON ep.id = o.etapa_id
WHERE o.status = 'aberta' AND o.data_fechamento_prevista IS NOT NULL
GROUP BY 1, 2, 3, 4, 5, 6, 7;

CREATE OR REPLACE VIEW public.v_relatorio_performance_vendedor AS
WITH base AS (
  SELECT
    o.responsavel_id,
    o.status,
    o.valor_estimado,
    (o.data_fechamento_real - o.created_at::date)::numeric AS ciclo_dias,
    o.pipeline_id
  FROM public.oportunidades o
)
SELECT
  b.responsavel_id,
  p.nome AS vendedor_nome,
  p.email AS vendedor_email,
  b.pipeline_id,
  count(*) FILTER (WHERE b.status = 'ganha')::int AS deals_ganhos,
  count(*) FILTER (WHERE b.status = 'perdida')::int AS deals_perdidos,
  count(*) FILTER (WHERE b.status IN ('ganha','perdida'))::int AS deals_fechados,
  coalesce(sum(b.valor_estimado) FILTER (WHERE b.status = 'ganha'), 0)::numeric AS valor_ganho,
  CASE WHEN count(*) FILTER (WHERE b.status IN ('ganha','perdida')) > 0
    THEN round(100.0 * count(*) FILTER (WHERE b.status = 'ganha')::numeric
               / count(*) FILTER (WHERE b.status IN ('ganha','perdida'))::numeric, 1)
    ELSE 0 END AS win_rate,
  coalesce(round(avg(b.ciclo_dias) FILTER (WHERE b.status = 'ganha')::numeric, 1), 0) AS ciclo_medio_dias
FROM base b
LEFT JOIN public.profiles p ON p.user_id = b.responsavel_id
GROUP BY b.responsavel_id, p.nome, p.email, b.pipeline_id;

CREATE OR REPLACE VIEW public.v_relatorio_motivos_perda AS
SELECT
  coalesce(o.motivo_perda, 'sem_motivo') AS motivo,
  o.pipeline_id,
  count(*)::int AS qtd,
  sum(o.valor_estimado)::numeric AS valor_total
FROM public.oportunidades o
WHERE o.status = 'perdida'
GROUP BY 1, 2;

CREATE OR REPLACE VIEW public.v_relatorio_tempo_etapa AS
WITH mudancas AS (
  SELECT
    h.oportunidade_id,
    h.created_at,
    (h.valor_novo #>> '{}')::uuid AS etapa_para,
    lag(h.created_at) OVER (PARTITION BY h.oportunidade_id ORDER BY h.created_at) AS prev_at,
    lag((h.valor_novo #>> '{}')::uuid) OVER (PARTITION BY h.oportunidade_id ORDER BY h.created_at) AS prev_etapa
  FROM public.historico_oportunidade h
  WHERE h.tipo_mudanca = 'etapa'
),
intervalos AS (
  SELECT
    prev_etapa AS etapa_id,
    EXTRACT(EPOCH FROM (created_at - prev_at)) / 86400.0 AS dias
  FROM mudancas
  WHERE prev_at IS NOT NULL AND prev_etapa IS NOT NULL
)
SELECT
  ep.id AS etapa_id,
  ep.nome AS etapa_nome,
  ep.cor AS etapa_cor,
  ep.ordem AS etapa_ordem,
  ep.pipeline_id,
  coalesce(round(avg(i.dias)::numeric, 1), 0) AS tempo_medio_dias,
  count(i.dias)::int AS amostras
FROM public.etapas_pipeline ep
LEFT JOIN intervalos i ON i.etapa_id = ep.id
GROUP BY ep.id, ep.nome, ep.cor, ep.ordem, ep.pipeline_id;
