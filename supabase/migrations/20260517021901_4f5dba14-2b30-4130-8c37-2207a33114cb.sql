CREATE OR REPLACE FUNCTION public.tipicos_impedir_mudanca_tipo()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.tipo IS DISTINCT FROM OLD.tipo THEN
    RAISE EXCEPTION 'tipo do típico é imutável após criação (id: %)', OLD.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tipicos_tipo_imutavel ON public.tipicos;
CREATE TRIGGER trg_tipicos_tipo_imutavel
  BEFORE UPDATE ON public.tipicos
  FOR EACH ROW EXECUTE FUNCTION public.tipicos_impedir_mudanca_tipo();