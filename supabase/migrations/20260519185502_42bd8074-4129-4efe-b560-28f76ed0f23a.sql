
UPDATE public.orcamentos o
SET nome_cliente = org.nome
FROM public.organizacoes org
WHERE o.organizacao_id = org.id
  AND (o.nome_cliente IS NULL OR btrim(o.nome_cliente) IN ('', '—', '-'));

UPDATE public.propostas p
SET nome_cliente = org.nome
FROM public.organizacoes org
WHERE p.organizacao_id = org.id
  AND (p.nome_cliente IS NULL OR btrim(p.nome_cliente) IN ('', '—', '-'));
