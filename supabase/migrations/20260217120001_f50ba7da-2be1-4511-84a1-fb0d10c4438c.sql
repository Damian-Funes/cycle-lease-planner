
-- Tabela de catálogo de equipamentos
CREATE TABLE public.equipamentos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo text NOT NULL UNIQUE,
  descricao text NOT NULL,
  valor_custo numeric NOT NULL,
  ativo boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now()
);

-- RLS
ALTER TABLE public.equipamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to equipamentos"
ON public.equipamentos
FOR ALL
USING (true)
WITH CHECK (true);

-- Dados iniciais
INSERT INTO public.equipamentos (codigo, descricao, valor_custo) VALUES
  ('EQ-001', 'Máquina de Tratamento de Sementes TSI 500', 450000),
  ('EQ-002', 'Dosador Líquido DL-300', 85000),
  ('EQ-003', 'Esteira Transportadora ET-200', 62000),
  ('EQ-004', 'Silo Pulmão 15t', 120000),
  ('EQ-005', 'Painel de Automação PA-100', 95000),
  ('EQ-006', 'Sistema de Telemetria ST-PRO', 45000),
  ('EQ-007', 'Big Bag Station BBS-2000', 78000),
  ('EQ-008', 'Rosca Transportadora RT-150', 38000),
  ('EQ-009', 'Elevador de Canecas EC-300', 55000),
  ('EQ-010', 'Kit Instalação e Comissionamento', 180000);

-- Coluna itens_projeto na tabela propostas
ALTER TABLE public.propostas ADD COLUMN itens_projeto jsonb DEFAULT '[]';
