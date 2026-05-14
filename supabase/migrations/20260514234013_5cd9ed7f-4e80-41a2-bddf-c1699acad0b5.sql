
-- 1) Catálogo de tipos
CREATE TABLE IF NOT EXISTS public.tipos_atividade (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  icone text,
  cor text,
  ordem int DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tipos_atividade ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permissive access on tipos_atividade"
ON public.tipos_atividade FOR ALL TO public
USING (true) WITH CHECK (true);

INSERT INTO public.tipos_atividade (nome, icone, cor, ordem) VALUES
  ('Ligação',  'Phone',          '#3b82f6', 1),
  ('Reunião',  'Calendar',       '#8b5cf6', 2),
  ('Email',    'Mail',           '#10b981', 3),
  ('Visita',   'MapPin',         '#f59e0b', 4),
  ('Nota',     'FileText',       '#6b7280', 5),
  ('Tarefa',   'CheckSquare',    '#ef4444', 6),
  ('WhatsApp', 'MessageSquare',  '#22c55e', 7),
  ('Almoço',   'Coffee',         '#a855f7', 8)
ON CONFLICT DO NOTHING;

-- 2) Estender tabela atividades (mantém colunas antigas pra compat)
ALTER TABLE public.atividades
  ADD COLUMN IF NOT EXISTS tipo_id uuid REFERENCES public.tipos_atividade(id),
  ADD COLUMN IF NOT EXISTS descricao text,
  ADD COLUMN IF NOT EXISTS data_inicio timestamptz,
  ADD COLUMN IF NOT EXISTS duracao_minutos int DEFAULT 30,
  ADD COLUMN IF NOT EXISTS data_conclusao timestamptz,
  ADD COLUMN IF NOT EXISTS resultado text,
  ADD COLUMN IF NOT EXISTS organizacao_id uuid,
  ADD COLUMN IF NOT EXISTS pessoa_id uuid,
  ADD COLUMN IF NOT EXISTS evento_automatico boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- backfill data_inicio a partir de data_atividade (legado)
UPDATE public.atividades SET data_inicio = data_atividade WHERE data_inicio IS NULL;

ALTER TABLE public.atividades ALTER COLUMN cliente_id DROP NOT NULL;

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_atividades_updated_at ON public.atividades;
CREATE TRIGGER trg_atividades_updated_at
BEFORE UPDATE ON public.atividades
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Função: recalcula última/próxima atividade na oportunidade
CREATE OR REPLACE FUNCTION public.fn_sync_oportunidade_atividades()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_opp uuid;
  v_ultima timestamptz;
  v_proxima timestamptz;
BEGIN
  v_opp := COALESCE(NEW.oportunidade_id, OLD.oportunidade_id);
  IF v_opp IS NULL THEN RETURN NEW; END IF;

  SELECT max(data_inicio) INTO v_ultima
    FROM public.atividades
    WHERE oportunidade_id = v_opp AND concluida = true;

  SELECT min(data_inicio) INTO v_proxima
    FROM public.atividades
    WHERE oportunidade_id = v_opp AND concluida = false AND data_inicio > now();

  UPDATE public.oportunidades
  SET ultima_atividade_em = v_ultima,
      proxima_atividade_em = v_proxima
  WHERE id = v_opp;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_atividades_sync_opp ON public.atividades;
CREATE TRIGGER trg_atividades_sync_opp
AFTER INSERT OR UPDATE OR DELETE ON public.atividades
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_oportunidade_atividades();

-- 4) Função: log automático de mudança de etapa/status na oportunidade
CREATE OR REPLACE FUNCTION public.fn_log_oportunidade_evento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
                                   cliente_id, tipo, data_atividade)
    VALUES (v_tipo_id, v_titulo, v_desc, now(), true, now(),
            NEW.id, NEW.organizacao_id, COALESCE(NEW.responsavel_id, auth.uid()), true,
            COALESCE(NEW.organizacao_id, NEW.id), 'evento', now());
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_titulo := 'Mudança de status';
    v_desc := format('De "%s" para "%s"', OLD.status, NEW.status);

    INSERT INTO public.atividades (tipo_id, titulo, descricao, data_inicio, concluida, data_conclusao,
                                   oportunidade_id, organizacao_id, responsavel_id, evento_automatico,
                                   cliente_id, tipo, data_atividade)
    VALUES (v_tipo_id, v_titulo, v_desc, now(), true, now(),
            NEW.id, NEW.organizacao_id, COALESCE(NEW.responsavel_id, auth.uid()), true,
            COALESCE(NEW.organizacao_id, NEW.id), 'evento', now());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_oportunidade_log_evento ON public.oportunidades;
CREATE TRIGGER trg_oportunidade_log_evento
AFTER UPDATE ON public.oportunidades
FOR EACH ROW EXECUTE FUNCTION public.fn_log_oportunidade_evento();

-- 5) Índices
CREATE INDEX IF NOT EXISTS idx_atividades_resp_concl_data
  ON public.atividades (responsavel_id, concluida, data_inicio);
CREATE INDEX IF NOT EXISTS idx_atividades_oportunidade
  ON public.atividades (oportunidade_id);
CREATE INDEX IF NOT EXISTS idx_atividades_organizacao
  ON public.atividades (organizacao_id);
