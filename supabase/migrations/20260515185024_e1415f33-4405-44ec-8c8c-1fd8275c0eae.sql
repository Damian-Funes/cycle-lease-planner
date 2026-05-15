-- Trigger function: set responsavel_id = auth.uid() on insert if null
CREATE OR REPLACE FUNCTION public.fn_set_responsavel_creator()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.responsavel_id IS NULL THEN
    NEW.responsavel_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_responsavel_propostas ON public.propostas;
CREATE TRIGGER trg_set_responsavel_propostas
BEFORE INSERT ON public.propostas
FOR EACH ROW EXECUTE FUNCTION public.fn_set_responsavel_creator();

DROP TRIGGER IF EXISTS trg_set_responsavel_orcamentos ON public.orcamentos;
CREATE TRIGGER trg_set_responsavel_orcamentos
BEFORE INSERT ON public.orcamentos
FOR EACH ROW EXECUTE FUNCTION public.fn_set_responsavel_creator();

DROP TRIGGER IF EXISTS trg_set_responsavel_orcamentos_reforma ON public.orcamentos_reforma;
CREATE TRIGGER trg_set_responsavel_orcamentos_reforma
BEFORE INSERT ON public.orcamentos_reforma
FOR EACH ROW EXECUTE FUNCTION public.fn_set_responsavel_creator();