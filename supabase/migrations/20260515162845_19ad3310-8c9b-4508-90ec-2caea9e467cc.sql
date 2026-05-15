
ALTER TABLE public.atividades DROP CONSTRAINT IF EXISTS atividades_responsavel_id_fkey;
ALTER TABLE public.atividades
  ADD CONSTRAINT atividades_responsavel_id_fkey
  FOREIGN KEY (responsavel_id) REFERENCES public.profiles(user_id) ON DELETE SET NULL;
