
ALTER TABLE public.oportunidades ADD COLUMN IF NOT EXISTS organizacao_id UUID REFERENCES public.organizacoes(id) ON DELETE SET NULL;
ALTER TABLE public.atividades ADD COLUMN IF NOT EXISTS organizacao_id UUID REFERENCES public.organizacoes(id) ON DELETE SET NULL;
ALTER TABLE public.atividades ADD COLUMN IF NOT EXISTS pessoa_id UUID REFERENCES public.pessoas(id) ON DELETE SET NULL;
ALTER TABLE public.propostas ADD COLUMN IF NOT EXISTS organizacao_id UUID REFERENCES public.organizacoes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_oportunidades_organizacao ON public.oportunidades(organizacao_id);
CREATE INDEX IF NOT EXISTS idx_atividades_organizacao ON public.atividades(organizacao_id);
CREATE INDEX IF NOT EXISTS idx_atividades_pessoa ON public.atividades(pessoa_id);
CREATE INDEX IF NOT EXISTS idx_propostas_organizacao ON public.propostas(organizacao_id);
