ALTER TABLE public.tipicos
  ADD COLUMN IF NOT EXISTS itens jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.tipicos
SET itens = CASE
  WHEN jsonb_typeof(itens) = 'array' AND jsonb_array_length(itens) > 0 THEN itens
  ELSE COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object('codigo', codigo, 'quantidade', 1)
        ORDER BY ord
      )
      FROM unnest(COALESCE(codigos, '{}'::text[])) WITH ORDINALITY AS t(codigo, ord)
    ),
    '[]'::jsonb
  )
END;

CREATE OR REPLACE FUNCTION public.tipicos_impedir_mudanca_tipo()
RETURNS trigger
LANGUAGE plpgsql
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