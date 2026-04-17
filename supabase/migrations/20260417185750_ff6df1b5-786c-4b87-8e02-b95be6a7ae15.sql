-- Tabela de orçamentos
CREATE TABLE public.orcamentos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  numero_orcamento TEXT,
  nome_cliente TEXT NOT NULL,
  contato_nome TEXT,
  cliente_endereco TEXT,
  cliente_telefone TEXT,
  cliente_cnpj TEXT,
  cliente_email TEXT,
  itens JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  desconto_tipo TEXT NOT NULL DEFAULT 'percentual',
  desconto_valor NUMERIC NOT NULL DEFAULT 0,
  frete NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  condicoes_pagamento TEXT,
  prazo_entrega TEXT,
  validade_dias INTEGER DEFAULT 10,
  local_entrega TEXT,
  observacoes TEXT,
  status TEXT DEFAULT 'rascunho'
);

-- RLS
ALTER TABLE public.orcamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to orcamentos"
ON public.orcamentos
FOR ALL
USING (true)
WITH CHECK (true);

-- Trigger updated_at
CREATE TRIGGER update_orcamentos_updated_at
BEFORE UPDATE ON public.orcamentos
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Index para busca por número
CREATE INDEX idx_orcamentos_numero ON public.orcamentos(numero_orcamento);