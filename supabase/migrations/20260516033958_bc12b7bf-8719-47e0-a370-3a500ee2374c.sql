
-- 1) View nova sem valor_estimado/probabilidade
CREATE OR REPLACE VIEW public.v_oportunidades_kanban_sem_valores AS
SELECT o.id, o.titulo, o.pipeline_id, o.etapa_id, o.organizacao_id, o.responsavel_id,
       o.status, o.motivo_perda, o.data_fechamento_prevista, o.data_fechamento_real,
       o.ordem_coluna, o.ultima_atividade_em, o.proxima_atividade_em,
       o.created_at, o.updated_at,
       org.nome AS organizacao_nome,
       prof.nome AS responsavel_nome,
       prof.email AS responsavel_email,
       ep.cor AS etapa_cor,
       ep.rotting_days AS etapa_rotting_days,
       fn_oportunidade_rotting(o.id) AS rotting_status,
       (GREATEST(0::numeric, (EXTRACT(epoch FROM (now() - COALESCE(o.ultima_atividade_em, o.created_at))) / 86400.0)))::integer AS dias_sem_atividade
FROM oportunidades o
LEFT JOIN organizacoes org ON org.id = o.organizacao_id
LEFT JOIN profiles prof ON prof.id = o.responsavel_id
LEFT JOIN etapas_pipeline ep ON ep.id = o.etapa_id;

GRANT SELECT ON public.v_oportunidades_kanban_sem_valores TO authenticated;

-- 2) Alterar as 4 views v_relatorio_* para bloquear marketing
CREATE OR REPLACE VIEW public.v_relatorio_forecast_mensal AS
SELECT (date_trunc('month', (o.data_fechamento_prevista)::timestamp with time zone))::date AS mes,
       o.pipeline_id, o.etapa_id, ep.nome AS etapa_nome, ep.cor AS etapa_cor, ep.ordem AS etapa_ordem,
       o.responsavel_id,
       (count(*))::integer AS qtd,
       sum(o.valor_estimado) AS valor_total,
       sum((o.valor_estimado * o.probabilidade::numeric) / 100.0) AS forecast_ponderado
FROM oportunidades o
LEFT JOIN etapas_pipeline ep ON ep.id = o.etapa_id
WHERE o.status = 'aberta'
  AND o.data_fechamento_prevista IS NOT NULL
  AND NOT public.has_role(auth.uid(), 'marketing'::app_role)
GROUP BY ((date_trunc('month', (o.data_fechamento_prevista)::timestamp with time zone))::date),
         o.pipeline_id, o.etapa_id, ep.nome, ep.cor, ep.ordem, o.responsavel_id;

CREATE OR REPLACE VIEW public.v_relatorio_motivos_perda AS
SELECT COALESCE(motivo_perda, 'sem_motivo') AS motivo,
       pipeline_id,
       (count(*))::integer AS qtd,
       sum(valor_estimado) AS valor_total
FROM oportunidades o
WHERE status = 'perdida'
  AND NOT public.has_role(auth.uid(), 'marketing'::app_role)
GROUP BY COALESCE(motivo_perda, 'sem_motivo'), pipeline_id;

CREATE OR REPLACE VIEW public.v_relatorio_performance_vendedor AS
WITH base AS (
  SELECT o.responsavel_id, o.status, o.valor_estimado,
         ((o.data_fechamento_real - (o.created_at)::date))::numeric AS ciclo_dias,
         o.pipeline_id
  FROM oportunidades o
  WHERE NOT public.has_role(auth.uid(), 'marketing'::app_role)
)
SELECT b.responsavel_id, p.nome AS vendedor_nome, p.email AS vendedor_email, b.pipeline_id,
       (count(*) FILTER (WHERE b.status = 'ganha'))::integer AS deals_ganhos,
       (count(*) FILTER (WHERE b.status = 'perdida'))::integer AS deals_perdidos,
       (count(*) FILTER (WHERE b.status = ANY (ARRAY['ganha','perdida'])))::integer AS deals_fechados,
       COALESCE(sum(b.valor_estimado) FILTER (WHERE b.status = 'ganha'), 0::numeric) AS valor_ganho,
       CASE WHEN (count(*) FILTER (WHERE b.status = ANY (ARRAY['ganha','perdida'])) > 0)
            THEN round(((100.0 * (count(*) FILTER (WHERE b.status = 'ganha'))::numeric) / (count(*) FILTER (WHERE b.status = ANY (ARRAY['ganha','perdida'])))::numeric), 1)
            ELSE 0::numeric END AS win_rate,
       COALESCE(round(avg(b.ciclo_dias) FILTER (WHERE b.status = 'ganha'), 1), 0::numeric) AS ciclo_medio_dias
FROM base b
LEFT JOIN profiles p ON p.user_id = b.responsavel_id
GROUP BY b.responsavel_id, p.nome, p.email, b.pipeline_id;

CREATE OR REPLACE VIEW public.v_relatorio_tempo_etapa AS
WITH mudancas AS (
  SELECT h.oportunidade_id, h.created_at,
         ((h.valor_novo #>> '{}'))::uuid AS etapa_para,
         lag(h.created_at) OVER (PARTITION BY h.oportunidade_id ORDER BY h.created_at) AS prev_at,
         lag(((h.valor_novo #>> '{}'))::uuid) OVER (PARTITION BY h.oportunidade_id ORDER BY h.created_at) AS prev_etapa
  FROM historico_oportunidade h
  WHERE h.tipo_mudanca = 'etapa'
    AND NOT public.has_role(auth.uid(), 'marketing'::app_role)
),
intervalos AS (
  SELECT prev_etapa AS etapa_id,
         (EXTRACT(epoch FROM (created_at - prev_at)) / 86400.0) AS dias
  FROM mudancas
  WHERE prev_at IS NOT NULL AND prev_etapa IS NOT NULL
)
SELECT ep.id AS etapa_id, ep.nome AS etapa_nome, ep.cor AS etapa_cor, ep.ordem AS etapa_ordem, ep.pipeline_id,
       COALESCE(round(avg(i.dias), 1), 0::numeric) AS tempo_medio_dias,
       (count(i.dias))::integer AS amostras
FROM etapas_pipeline ep
LEFT JOIN intervalos i ON i.etapa_id = ep.id
WHERE NOT public.has_role(auth.uid(), 'marketing'::app_role)
GROUP BY ep.id, ep.nome, ep.cor, ep.ordem, ep.pipeline_id;
