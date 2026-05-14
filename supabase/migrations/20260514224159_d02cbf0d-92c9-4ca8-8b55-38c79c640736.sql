-- =============================================
-- clientes
-- =============================================
CREATE TABLE public.clientes (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    razao_social TEXT NOT NULL,
    nome_fantasia TEXT,
    cnpj TEXT UNIQUE,
    segmento TEXT,
    porte TEXT,
    regiao TEXT,
    status TEXT NOT NULL DEFAULT 'lead' CHECK (status IN ('lead','prospect','ativo','inativo')),
    responsavel_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    observacoes TEXT
);
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permissive access on clientes" ON public.clientes FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER update_clientes_updated_at BEFORE UPDATE ON public.clientes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_clientes_status ON public.clientes(status);

-- =============================================
-- contatos
-- =============================================
CREATE TABLE public.contatos (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    cargo TEXT,
    email TEXT,
    telefone TEXT,
    e_decisor BOOLEAN NOT NULL DEFAULT false,
    observacoes TEXT
);
ALTER TABLE public.contatos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permissive access on contatos" ON public.contatos FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER update_contatos_updated_at BEFORE UPDATE ON public.contatos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_contatos_cliente_id ON public.contatos(cliente_id);

-- =============================================
-- propostas: vínculo com clientes
-- =============================================
ALTER TABLE public.propostas ADD COLUMN IF NOT EXISTS cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL;

-- =============================================
-- etapas_pipeline
-- =============================================
CREATE TABLE public.etapas_pipeline (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    nome TEXT NOT NULL,
    ordem INTEGER NOT NULL,
    cor TEXT,
    e_final BOOLEAN NOT NULL DEFAULT false,
    e_ganho BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.etapas_pipeline ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permissive access on etapas_pipeline" ON public.etapas_pipeline FOR ALL USING (true) WITH CHECK (true);

INSERT INTO public.etapas_pipeline (nome, ordem, cor, e_final, e_ganho) VALUES
    ('Lead', 1, '#94a3b8', false, false),
    ('Qualificado', 2, '#3b82f6', false, false),
    ('Diagnóstico Técnico', 3, '#8b5cf6', false, false),
    ('Proposta Enviada', 4, '#f59e0b', false, false),
    ('Negociação', 5, '#f97316', false, false),
    ('Fechado-Ganho', 6, '#10b981', true, true),
    ('Fechado-Perdido', 7, '#ef4444', true, false);

-- =============================================
-- oportunidades
-- =============================================
CREATE TABLE public.oportunidades (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
    titulo TEXT NOT NULL,
    etapa_id UUID NOT NULL REFERENCES public.etapas_pipeline(id),
    valor_estimado NUMERIC,
    probabilidade INTEGER NOT NULL DEFAULT 50 CHECK (probabilidade BETWEEN 0 AND 100),
    data_fechamento_prevista DATE,
    responsavel_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    proposta_id UUID REFERENCES public.propostas(id) ON DELETE SET NULL,
    motivo_perda TEXT,
    observacoes TEXT
);
ALTER TABLE public.oportunidades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permissive access on oportunidades" ON public.oportunidades FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER update_oportunidades_updated_at BEFORE UPDATE ON public.oportunidades FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_oportunidades_cliente_id ON public.oportunidades(cliente_id);
CREATE INDEX idx_oportunidades_etapa_id ON public.oportunidades(etapa_id);

-- =============================================
-- atividades
-- =============================================
CREATE TABLE public.atividades (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
    oportunidade_id UUID REFERENCES public.oportunidades(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL CHECK (tipo IN ('ligacao','reuniao','email','nota','visita','tarefa','evento_automatico')),
    titulo TEXT NOT NULL,
    conteudo TEXT,
    data_atividade TIMESTAMPTZ NOT NULL DEFAULT now(),
    responsavel_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    concluida BOOLEAN NOT NULL DEFAULT true
);
ALTER TABLE public.atividades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permissive access on atividades" ON public.atividades FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX idx_atividades_cliente_id ON public.atividades(cliente_id);
CREATE INDEX idx_atividades_oportunidade_id ON public.atividades(oportunidade_id);