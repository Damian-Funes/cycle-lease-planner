-- Backfill: força recálculo do trigger recalc_montagem_total em orçamentos
-- cujo preço de montagem está zerado mas têm dias/colaboradores preenchidos.
UPDATE public.orcamentos
SET updated_at = now()
WHERE COALESCE(montagem_preco_total, 0) = 0
  AND COALESCE(montagem_dias, 0) > 0
  AND COALESCE(montagem_numero_colaboradores, 0) > 0;