
CREATE OR REPLACE FUNCTION public.fn_atualizar_atividade_assumir_orgs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tipo_id uuid := '18a81316-9ca6-4e3f-980c-c771b821a730';
  v_pendentes int;
  v_ativ_id uuid;
  v_inicio timestamptz := date_trunc('day', now());
  v_fim timestamptz := date_trunc('day', now()) + interval '1 day';
BEGIN
  IF NEW.responsavel_id IS NULL OR OLD.responsavel_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_pendentes FROM public.organizacoes WHERE responsavel_id IS NULL;

  SELECT id INTO v_ativ_id
  FROM public.atividades
  WHERE tipo_id = v_tipo_id
    AND responsavel_id = NEW.responsavel_id
    AND concluida = false
    AND data_atividade >= v_inicio
    AND data_atividade < v_fim
  ORDER BY data_atividade DESC
  LIMIT 1;

  IF v_ativ_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_pendentes <= 0 THEN
    UPDATE public.atividades
    SET concluida = true,
        data_conclusao = now(),
        titulo = 'Assumir organizações do dia (concluído)'
    WHERE id = v_ativ_id;
  ELSE
    UPDATE public.atividades
    SET titulo = 'Assumir organizações do dia (' || v_pendentes || ' pendentes)'
    WHERE id = v_ativ_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_atualizar_atividade_assumir_orgs ON public.organizacoes;
CREATE TRIGGER trg_atualizar_atividade_assumir_orgs
AFTER UPDATE OF responsavel_id ON public.organizacoes
FOR EACH ROW
EXECUTE FUNCTION public.fn_atualizar_atividade_assumir_orgs();
