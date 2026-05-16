BEGIN;

-- 1) Ajustar FKs: profiles(id) -> profiles(user_id)
ALTER TABLE public.organizacoes DROP CONSTRAINT IF EXISTS organizacoes_responsavel_id_fkey;
ALTER TABLE public.pessoas DROP CONSTRAINT IF EXISTS pessoas_responsavel_id_fkey;

-- 2) Normalizar dados (profile.id -> user_id) onde aplicável
UPDATE public.organizacoes o
SET responsavel_id = p.user_id
FROM public.profiles p
WHERE o.responsavel_id = p.id
  AND o.responsavel_id NOT IN (SELECT user_id FROM public.profiles WHERE user_id IS NOT NULL);

UPDATE public.pessoas pe
SET responsavel_id = p.user_id
FROM public.profiles p
WHERE pe.responsavel_id = p.id
  AND pe.responsavel_id NOT IN (SELECT user_id FROM public.profiles WHERE user_id IS NOT NULL);

UPDATE public.oportunidades x SET responsavel_id = p.user_id
FROM public.profiles p
WHERE x.responsavel_id = p.id
  AND x.responsavel_id NOT IN (SELECT user_id FROM public.profiles WHERE user_id IS NOT NULL);

UPDATE public.atividades x SET responsavel_id = p.user_id
FROM public.profiles p
WHERE x.responsavel_id = p.id
  AND x.responsavel_id NOT IN (SELECT user_id FROM public.profiles WHERE user_id IS NOT NULL);

UPDATE public.propostas x SET responsavel_id = p.user_id
FROM public.profiles p
WHERE x.responsavel_id = p.id
  AND x.responsavel_id NOT IN (SELECT user_id FROM public.profiles WHERE user_id IS NOT NULL);

UPDATE public.orcamentos x SET responsavel_id = p.user_id
FROM public.profiles p
WHERE x.responsavel_id = p.id
  AND x.responsavel_id NOT IN (SELECT user_id FROM public.profiles WHERE user_id IS NOT NULL);

UPDATE public.orcamentos_reforma x SET responsavel_id = p.user_id
FROM public.profiles p
WHERE x.responsavel_id = p.id
  AND x.responsavel_id NOT IN (SELECT user_id FROM public.profiles WHERE user_id IS NOT NULL);

-- 3) Recriar FKs apontando pra profiles(user_id)
ALTER TABLE public.organizacoes
  ADD CONSTRAINT organizacoes_responsavel_id_fkey
  FOREIGN KEY (responsavel_id) REFERENCES public.profiles(user_id) ON DELETE SET NULL;

ALTER TABLE public.pessoas
  ADD CONSTRAINT pessoas_responsavel_id_fkey
  FOREIGN KEY (responsavel_id) REFERENCES public.profiles(user_id) ON DELETE SET NULL;

-- 4) Atribuir orgs de teste
UPDATE public.organizacoes SET responsavel_id = '0e957f13-b471-47b2-a8b3-e9d156203b71' WHERE nome ILIKE 'ORG TESTE PR';
UPDATE public.organizacoes SET responsavel_id = '0e957f13-b471-47b2-a8b3-e9d156203b71' WHERE nome ILIKE 'ORG TESTE SC';
UPDATE public.organizacoes SET responsavel_id = '660c2932-4404-48ca-ad2d-c76862bb9d74' WHERE nome ILIKE 'ORG TESTE MG';

COMMIT;