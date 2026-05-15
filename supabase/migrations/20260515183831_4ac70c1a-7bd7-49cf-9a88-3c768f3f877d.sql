UPDATE public.propostas
SET organizacao_id = 'e36ac7af-a99a-461f-b682-66dcaa84d5e7',
    oportunidade_id = '014882f9-fc70-4159-96ef-c58e8ed5da95'
WHERE id IN ('a6630332-f2fa-4baf-a60a-8401a0c50c8d','f7123f04-1eee-4b19-84f7-8e3d1ea20738');

UPDATE public.oportunidades
SET valor_estimado = (
  SELECT COALESCE(SUM(total_10_anos),0)
  FROM public.propostas
  WHERE oportunidade_id = '014882f9-fc70-4159-96ef-c58e8ed5da95'
)
WHERE id = '014882f9-fc70-4159-96ef-c58e8ed5da95';