-- PROPOSTA (não aplicar sem aprovação): "próximo passo em aberto" na situação atual da organização.
-- Acrescenta a coluna proximo_passo no FIM da view organizacao_situacao_atual (as demais ficam idênticas).
-- Em aberto = último levantamento com próximo passo cuja atividade ainda está aberta
--   (concluida = false e situacao 'aberta'), ou, sem atividade, com data de hoje em diante (BRT).
-- Só leitura: nenhum dado é alterado. A Júlia já lê a coluna se ela existir (sem ela, o campo é omitido).

CREATE OR REPLACE VIEW public.organizacao_situacao_atual WITH (security_invoker = true) AS
SELECT o.id AS organizacao_id,
  (SELECT jsonb_build_object('valor', l.sacos_safra, 'data', l.data_visita, 'autor_id', l.autor_id) FROM public.organizacao_levantamentos l WHERE l.organizacao_id=o.id AND l.sacos_safra IS NOT NULL ORDER BY l.data_visita DESC, l.created_at DESC LIMIT 1) AS sacos_safra,
  (SELECT jsonb_build_object('valor', l.equipamento_atual, 'data', l.data_visita, 'autor_id', l.autor_id) FROM public.organizacao_levantamentos l WHERE l.organizacao_id=o.id AND l.equipamento_atual IS NOT NULL ORDER BY l.data_visita DESC, l.created_at DESC LIMIT 1) AS equipamento_atual,
  (SELECT jsonb_build_object('valor', l.decisores, 'data', l.data_visita, 'autor_id', l.autor_id) FROM public.organizacao_levantamentos l WHERE l.organizacao_id=o.id AND l.decisores IS NOT NULL ORDER BY l.data_visita DESC, l.created_at DESC LIMIT 1) AS decisores,
  (SELECT jsonb_build_object('valor', l.interesse, 'motivo', l.motivo_interesse, 'data', l.data_visita, 'autor_id', l.autor_id) FROM public.organizacao_levantamentos l WHERE l.organizacao_id=o.id AND l.interesse IS NOT NULL ORDER BY l.data_visita DESC, l.created_at DESC LIMIT 1) AS interesse,
  (SELECT jsonb_build_object('valor', l.concorrente, 'data', l.data_visita, 'autor_id', l.autor_id) FROM public.organizacao_levantamentos l WHERE l.organizacao_id=o.id AND l.concorrente IS NOT NULL ORDER BY l.data_visita DESC, l.created_at DESC LIMIT 1) AS concorrente,
  (SELECT jsonb_build_object('valor', l.problema_principal, 'data', l.data_visita, 'autor_id', l.autor_id) FROM public.organizacao_levantamentos l WHERE l.organizacao_id=o.id AND l.problema_principal IS NOT NULL ORDER BY l.data_visita DESC, l.created_at DESC LIMIT 1) AS problema_principal,
  (SELECT jsonb_build_object('data', l.data_visita, 'autor_id', l.autor_id, 'rota_id', l.rota_id) FROM public.organizacao_levantamentos l WHERE l.organizacao_id=o.id ORDER BY l.data_visita DESC, l.created_at DESC LIMIT 1) AS ultima_visita,
  -- NOVA
  (SELECT jsonb_build_object('valor', l.proximo_passo, 'data', l.proximo_passo_data, 'atividade_id', l.atividade_id, 'levantamento_em', l.data_visita, 'autor_id', l.autor_id)
     FROM public.organizacao_levantamentos l
     LEFT JOIN public.atividades a ON a.id = l.atividade_id
    WHERE l.organizacao_id = o.id
      AND NULLIF(btrim(l.proximo_passo), '') IS NOT NULL
      AND CASE WHEN l.atividade_id IS NOT NULL
               THEN a.id IS NOT NULL AND a.concluida IS NOT TRUE AND COALESCE(a.situacao, 'aberta') = 'aberta'
               ELSE l.proximo_passo_data IS NOT NULL AND l.proximo_passo_data >= public.fn_rota_hoje_brt() END
    ORDER BY l.data_visita DESC, l.created_at DESC LIMIT 1) AS proximo_passo
FROM public.organizacoes o
WHERE EXISTS (SELECT 1 FROM public.organizacao_levantamentos l WHERE l.organizacao_id = o.id);

GRANT SELECT ON public.organizacao_situacao_atual TO authenticated;
GRANT SELECT ON public.organizacao_situacao_atual TO service_role;

-- Conferência (Cocari deve trazer "Cliente visitar a Coamo para ver a LSB 300", 2026-11-13):
-- SELECT proximo_passo FROM public.organizacao_situacao_atual WHERE organizacao_id = 'a209f1d7-f01c-46e5-b8e3-7651820ea8b2';
