-- Fase 6: Drop legado clientes/contatos e colunas cliente_id

-- 1) Atualizar fn_log_oportunidade_evento para não gravar mais cliente_id em atividades
CREATE OR REPLACE FUNCTION public.fn_log_oportunidade_evento()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tipo_id uuid;
  v_titulo text;
  v_desc text;
  v_etapa_old text;
  v_etapa_new text;
BEGIN
  SELECT id INTO v_tipo_id FROM public.tipos_atividade WHERE nome = 'Nota' LIMIT 1;

  IF NEW.etapa_id IS DISTINCT FROM OLD.etapa_id THEN
    SELECT nome INTO v_etapa_old FROM public.etapas_pipeline WHERE id = OLD.etapa_id;
    SELECT nome INTO v_etapa_new FROM public.etapas_pipeline WHERE id = NEW.etapa_id;
    v_titulo := 'Mudança de etapa';
    v_desc := format('De "%s" para "%s"', COALESCE(v_etapa_old, '—'), COALESCE(v_etapa_new, '—'));

    INSERT INTO public.atividades (tipo_id, titulo, descricao, data_inicio, concluida, data_conclusao,
                                   oportunidade_id, organizacao_id, responsavel_id, evento_automatico,
                                   tipo, data_atividade)
    VALUES (v_tipo_id, v_titulo, v_desc, now(), true, now(),
            NEW.id, NEW.organizacao_id, COALESCE(NEW.responsavel_id, auth.uid()), true,
            'evento', now());
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_titulo := 'Mudança de status';
    v_desc := format('De "%s" para "%s"', OLD.status, NEW.status);

    INSERT INTO public.atividades (tipo_id, titulo, descricao, data_inicio, concluida, data_conclusao,
                                   oportunidade_id, organizacao_id, responsavel_id, evento_automatico,
                                   tipo, data_atividade)
    VALUES (v_tipo_id, v_titulo, v_desc, now(), true, now(),
            NEW.id, NEW.organizacao_id, COALESCE(NEW.responsavel_id, auth.uid()), true,
            'evento', now());
  END IF;

  RETURN NEW;
END;
$function$;

-- 2) Remover colunas cliente_id legadas
ALTER TABLE public.atividades DROP COLUMN IF EXISTS cliente_id;
ALTER TABLE public.propostas DROP COLUMN IF EXISTS cliente_id;

-- 3) Drop tabelas legadas (contatos primeiro pois referencia clientes semanticamente)
DROP TABLE IF EXISTS public.contatos;
DROP TABLE IF EXISTS public.clientes;