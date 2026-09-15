CREATE OR REPLACE FUNCTION public.fn_resolver_numero_orcamento_duplicado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix text;
  v_base text;
  v_seq integer;
  v_versao integer;
BEGIN
  -- Serializa apenas a escolha do número; o restante da gravação continua normal.
  PERFORM pg_advisory_xact_lock(hashtext('public.orcamentos.numero_orcamento'));

  IF NEW.numero_orcamento IS NULL OR btrim(NEW.numero_orcamento) = '' THEN
    v_prefix := 'ORC' || to_char(CURRENT_DATE, 'YYYY') || '-';
    SELECT COALESCE(MAX((regexp_match(numero_orcamento, '^' || v_prefix || '([0-9]+)(?:-V[0-9]+)?$'))[1]::integer), 0) + 1
      INTO v_seq
      FROM public.orcamentos
     WHERE numero_orcamento ~ ('^' || v_prefix || '[0-9]+(?:-V[0-9]+)?$');
    NEW.numero_orcamento := v_prefix || lpad(v_seq::text, 3, '0');
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.orcamentos
     WHERE numero_orcamento = NEW.numero_orcamento
       AND id IS DISTINCT FROM NEW.id
  ) THEN
    IF NEW.numero_orcamento ~* '-V[0-9]+$' THEN
      v_base := regexp_replace(NEW.numero_orcamento, '-V[0-9]+$', '', 'i');
      SELECT COALESCE(MAX((regexp_match(numero_orcamento, '-V([0-9]+)$', 'i'))[1]::integer), 1) + 1
        INTO v_versao
        FROM public.orcamentos
       WHERE numero_orcamento = v_base
          OR numero_orcamento ~* ('^' || replace(v_base, '-', '\-') || '-V[0-9]+$');
      NEW.numero_orcamento := v_base || '-V' || v_versao;
    ELSIF NEW.numero_orcamento ~ '^ORC[0-9]{4}-[0-9]+$' THEN
      v_prefix := substring(NEW.numero_orcamento from '^(ORC[0-9]{4}-)');
      SELECT COALESCE(MAX((regexp_match(numero_orcamento, '^' || v_prefix || '([0-9]+)(?:-V[0-9]+)?$'))[1]::integer), 0) + 1
        INTO v_seq
        FROM public.orcamentos
       WHERE numero_orcamento ~ ('^' || v_prefix || '[0-9]+(?:-V[0-9]+)?$');
      NEW.numero_orcamento := v_prefix || lpad(v_seq::text, 3, '0');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_resolver_numero_orcamento_duplicado ON public.orcamentos;
CREATE TRIGGER trg_resolver_numero_orcamento_duplicado
BEFORE INSERT OR UPDATE OF numero_orcamento ON public.orcamentos
FOR EACH ROW
EXECUTE FUNCTION public.fn_resolver_numero_orcamento_duplicado();