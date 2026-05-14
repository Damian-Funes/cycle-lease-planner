
-- Limpa estruturas antigas
DROP TABLE IF EXISTS public.oportunidades CASCADE;
DROP TABLE IF EXISTS public.etapas_pipeline CASCADE;

-- ============== PIPELINES ==============
CREATE TABLE public.pipelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  nome TEXT NOT NULL,
  descricao TEXT,
  ordem INT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  cor TEXT NOT NULL DEFAULT '#3b82f6'
);
ALTER TABLE public.pipelines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permissive access on pipelines" ON public.pipelines FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER update_pipelines_updated_at BEFORE UPDATE ON public.pipelines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============== ETAPAS_PIPELINE ==============
CREATE TABLE public.etapas_pipeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  pipeline_id UUID NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  ordem INT NOT NULL,
  cor TEXT,
  probabilidade_default INT NOT NULL DEFAULT 50 CHECK (probabilidade_default BETWEEN 0 AND 100),
  rotting_days INT NOT NULL DEFAULT 14,
  e_final BOOLEAN NOT NULL DEFAULT false,
  e_ganho BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (pipeline_id, ordem)
);
ALTER TABLE public.etapas_pipeline ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permissive access on etapas_pipeline" ON public.etapas_pipeline FOR ALL USING (true) WITH CHECK (true);

-- ============== OPORTUNIDADES ==============
CREATE TABLE public.oportunidades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  titulo TEXT NOT NULL,
  organizacao_id UUID NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  pipeline_id UUID NOT NULL REFERENCES public.pipelines(id),
  etapa_id UUID NOT NULL REFERENCES public.etapas_pipeline(id),
  valor_estimado NUMERIC NOT NULL DEFAULT 0,
  probabilidade INT NOT NULL DEFAULT 50 CHECK (probabilidade BETWEEN 0 AND 100),
  data_fechamento_prevista DATE,
  data_fechamento_real DATE,
  responsavel_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  proposta_id UUID REFERENCES public.propostas(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'ganha', 'perdida')),
  motivo_perda TEXT,
  concorrente_vencedor TEXT,
  observacoes TEXT,
  ordem_coluna INT,
  ultima_atividade_em TIMESTAMPTZ,
  proxima_atividade_em TIMESTAMPTZ
);
ALTER TABLE public.oportunidades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permissive access on oportunidades" ON public.oportunidades FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER update_oportunidades_updated_at BEFORE UPDATE ON public.oportunidades
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_oport_pipeline_etapa ON public.oportunidades(pipeline_id, etapa_id);
CREATE INDEX idx_oport_organizacao ON public.oportunidades(organizacao_id);
CREATE INDEX idx_oport_resp_status ON public.oportunidades(responsavel_id, status);

-- ============== OPORTUNIDADE_PESSOAS ==============
CREATE TABLE public.oportunidade_pessoas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  oportunidade_id UUID NOT NULL REFERENCES public.oportunidades(id) ON DELETE CASCADE,
  pessoa_id UUID NOT NULL REFERENCES public.pessoas(id) ON DELETE CASCADE,
  papel TEXT,
  UNIQUE (oportunidade_id, pessoa_id)
);
ALTER TABLE public.oportunidade_pessoas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permissive access on oportunidade_pessoas" ON public.oportunidade_pessoas FOR ALL USING (true) WITH CHECK (true);

-- ============== HISTORICO_OPORTUNIDADE ==============
CREATE TABLE public.historico_oportunidade (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  oportunidade_id UUID NOT NULL REFERENCES public.oportunidades(id) ON DELETE CASCADE,
  usuario_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  tipo_mudanca TEXT NOT NULL,
  valor_anterior JSONB,
  valor_novo JSONB
);
ALTER TABLE public.historico_oportunidade ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permissive read on historico_oportunidade" ON public.historico_oportunidade FOR SELECT USING (true);
CREATE POLICY "Permissive insert on historico_oportunidade" ON public.historico_oportunidade FOR INSERT WITH CHECK (true);

CREATE INDEX idx_historico_oport ON public.historico_oportunidade(oportunidade_id, created_at DESC);

-- ============== TRIGGERS DE HISTÓRICO ==============
CREATE OR REPLACE FUNCTION public.log_oportunidade_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
BEGIN
  IF NEW.etapa_id IS DISTINCT FROM OLD.etapa_id THEN
    INSERT INTO public.historico_oportunidade (oportunidade_id, usuario_id, tipo_mudanca, valor_anterior, valor_novo)
    VALUES (NEW.id, uid, 'etapa', to_jsonb(OLD.etapa_id), to_jsonb(NEW.etapa_id));
  END IF;
  IF NEW.valor_estimado IS DISTINCT FROM OLD.valor_estimado THEN
    INSERT INTO public.historico_oportunidade (oportunidade_id, usuario_id, tipo_mudanca, valor_anterior, valor_novo)
    VALUES (NEW.id, uid, 'valor', to_jsonb(OLD.valor_estimado), to_jsonb(NEW.valor_estimado));
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.historico_oportunidade (oportunidade_id, usuario_id, tipo_mudanca, valor_anterior, valor_novo)
    VALUES (NEW.id, uid, 'status', to_jsonb(OLD.status), to_jsonb(NEW.status));
  END IF;
  IF NEW.motivo_perda IS DISTINCT FROM OLD.motivo_perda THEN
    INSERT INTO public.historico_oportunidade (oportunidade_id, usuario_id, tipo_mudanca, valor_anterior, valor_novo)
    VALUES (NEW.id, uid, 'motivo_perda', to_jsonb(OLD.motivo_perda), to_jsonb(NEW.motivo_perda));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_oportunidade_changes
BEFORE UPDATE ON public.oportunidades
FOR EACH ROW EXECUTE FUNCTION public.log_oportunidade_changes();

CREATE OR REPLACE FUNCTION public.log_oportunidade_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.historico_oportunidade (oportunidade_id, usuario_id, tipo_mudanca, valor_novo)
  VALUES (NEW.id, auth.uid(), 'criada', to_jsonb(NEW));
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_oportunidade_created
AFTER INSERT ON public.oportunidades
FOR EACH ROW EXECUTE FUNCTION public.log_oportunidade_created();

-- ============== SEEDS ==============
DO $$
DECLARE
  pipe_sc UUID;
  pipe_rf UUID;
BEGIN
  INSERT INTO public.pipelines (nome, descricao, ordem, cor)
  VALUES ('SmartCycle', 'Funil principal de aluguel SmartCycle', 1, '#059669')
  RETURNING id INTO pipe_sc;

  INSERT INTO public.etapas_pipeline (pipeline_id, nome, ordem, cor, probabilidade_default, rotting_days, e_final, e_ganho) VALUES
    (pipe_sc, 'Lead', 1, '#94a3b8', 15, 7, false, false),
    (pipe_sc, 'Diagnóstico Técnico', 2, '#8b5cf6', 35, 14, false, false),
    (pipe_sc, 'Visita Realizada', 3, '#3b82f6', 50, 14, false, false),
    (pipe_sc, 'Proposta Enviada', 4, '#f59e0b', 70, 10, false, false),
    (pipe_sc, 'Negociação', 5, '#f97316', 85, 7, false, false),
    (pipe_sc, 'Fechado-Ganho', 6, '#10b981', 100, 14, true, true),
    (pipe_sc, 'Fechado-Perdido', 7, '#ef4444', 0, 14, true, false);

  INSERT INTO public.pipelines (nome, descricao, ordem, cor)
  VALUES ('Reforma', 'Funil de projetos de reforma', 2, '#f97316')
  RETURNING id INTO pipe_rf;

  INSERT INTO public.etapas_pipeline (pipeline_id, nome, ordem, cor, probabilidade_default, rotting_days, e_final, e_ganho) VALUES
    (pipe_rf, 'Lead', 1, '#94a3b8', 15, 7, false, false),
    (pipe_rf, 'Levantamento', 2, '#8b5cf6', 35, 14, false, false),
    (pipe_rf, 'Orçamento', 3, '#f59e0b', 60, 10, false, false),
    (pipe_rf, 'Negociação', 4, '#f97316', 80, 7, false, false),
    (pipe_rf, 'Ganho', 5, '#10b981', 100, 14, true, true),
    (pipe_rf, 'Perdido', 6, '#ef4444', 0, 14, true, false);
END $$;
