
CREATE TABLE public.organizacoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  nome TEXT NOT NULL,
  nome_fantasia TEXT,
  cnpj TEXT UNIQUE,
  segmento TEXT,
  porte TEXT CHECK (porte IN ('pequeno', 'medio', 'grande')),
  regiao TEXT,
  endereco TEXT,
  cidade TEXT,
  estado TEXT,
  site TEXT,
  telefone_principal TEXT,
  email_principal TEXT,
  status TEXT NOT NULL DEFAULT 'lead' CHECK (status IN ('lead', 'prospect', 'ativo', 'inativo', 'perdido')),
  responsavel_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  observacoes TEXT
);

ALTER TABLE public.organizacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permissive access on organizacoes" ON public.organizacoes FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_organizacoes_status ON public.organizacoes(status);
CREATE INDEX idx_organizacoes_responsavel ON public.organizacoes(responsavel_id);

CREATE TRIGGER update_organizacoes_updated_at
BEFORE UPDATE ON public.organizacoes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.pessoas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  nome TEXT NOT NULL,
  organizacao_id UUID REFERENCES public.organizacoes(id) ON DELETE SET NULL,
  cargo TEXT,
  email TEXT,
  telefone TEXT,
  celular TEXT,
  linkedin TEXT,
  e_decisor BOOLEAN NOT NULL DEFAULT false,
  responsavel_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  observacoes TEXT
);

ALTER TABLE public.pessoas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permissive access on pessoas" ON public.pessoas FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_pessoas_organizacao ON public.pessoas(organizacao_id);
CREATE INDEX idx_pessoas_email ON public.pessoas(email);

CREATE TRIGGER update_pessoas_updated_at
BEFORE UPDATE ON public.pessoas
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
