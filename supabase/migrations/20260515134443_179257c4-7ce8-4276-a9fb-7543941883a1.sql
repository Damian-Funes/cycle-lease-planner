
ALTER TABLE public.oportunidades DROP CONSTRAINT IF EXISTS oportunidades_responsavel_id_fkey;

UPDATE public.oportunidades
SET responsavel_id = '660c2932-4404-48ca-ad2d-c76862bb9d74'
WHERE responsavel_id IS NULL;
