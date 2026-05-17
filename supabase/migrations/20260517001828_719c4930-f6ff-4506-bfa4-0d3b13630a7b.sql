-- Enum para tipo do típico
CREATE TYPE public.tipico_tipo AS ENUM ('orcamento', 'aluguel');

-- Tabela de típicos
CREATE TABLE public.tipicos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  descricao text,
  tipo public.tipico_tipo NOT NULL,
  codigos text[] NOT NULL DEFAULT '{}',
  capacidade_sacos_ano integer NOT NULL CHECK (capacidade_sacos_ano > 0),
  valor_referencia numeric(12,2) NOT NULL CHECK (valor_referencia > 0),
  destacado boolean NOT NULL DEFAULT false,
  arquivado boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tipicos_tipo ON public.tipicos(tipo) WHERE arquivado = false;
CREATE INDEX idx_tipicos_arquivado ON public.tipicos(arquivado);

CREATE TRIGGER trg_tipicos_updated_at
  BEFORE UPDATE ON public.tipicos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.tipicos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ver tipicos"
  ON public.tipicos
  FOR SELECT
  TO authenticated
  USING (
    public.is_approved(auth.uid())
    AND (arquivado = false OR public.has_role(auth.uid(), 'admin'::app_role))
  );

CREATE POLICY "Admin gerencia tipicos"
  ON public.tipicos
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));