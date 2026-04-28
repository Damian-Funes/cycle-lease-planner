-- Catálogo de itens de reforma
CREATE TABLE public.itens_reforma (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo TEXT NOT NULL,
  descricao TEXT NOT NULL,
  categoria TEXT NOT NULL,
  valor NUMERIC NOT NULL DEFAULT 0,
  ordem INTEGER NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.itens_reforma ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage itens_reforma"
ON public.itens_reforma FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Approved users can view itens_reforma"
ON public.itens_reforma FOR SELECT TO authenticated
USING (is_approved(auth.uid()));

CREATE TRIGGER update_itens_reforma_updated_at
BEFORE UPDATE ON public.itens_reforma
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Orçamentos de Reforma
CREATE TABLE public.orcamentos_reforma (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
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
  local_entrega TEXT,
  validade_dias INTEGER DEFAULT 10,
  observacoes TEXT,
  status TEXT DEFAULT 'rascunho',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.orcamentos_reforma ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved users can view orcamentos_reforma"
ON public.orcamentos_reforma FOR SELECT TO authenticated
USING (is_approved(auth.uid()));

CREATE POLICY "Approved users can insert orcamentos_reforma"
ON public.orcamentos_reforma FOR INSERT TO authenticated
WITH CHECK (is_approved(auth.uid()));

CREATE POLICY "Approved users can update orcamentos_reforma"
ON public.orcamentos_reforma FOR UPDATE TO authenticated
USING (is_approved(auth.uid()));

CREATE POLICY "Approved users can delete orcamentos_reforma"
ON public.orcamentos_reforma FOR DELETE TO authenticated
USING (is_approved(auth.uid()));

CREATE TRIGGER update_orcamentos_reforma_updated_at
BEFORE UPDATE ON public.orcamentos_reforma
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Pré-cadastra itens
INSERT INTO public.itens_reforma (codigo, descricao, categoria, ordem) VALUES
('1.1.0', 'Usinagem de faixa de inox', 'Homogenizador', 101),
('1.2.0', 'Troca de camisa', 'Homogenizador', 102),
('1.2.1', 'Troca da descarga', 'Homogenizador', 103),
('1.2.3', 'Troca de paletas', 'Homogenizador', 104),
('1.2.4', 'Revestimento', 'Homogenizador', 105),
('1.3.0', 'Reparo redutor', 'Homogenizador', 106),
('1.4.0', 'Reparo Cilindros', 'Homogenizador', 107),
('1.5.0', 'Limpeza de ventilador', 'Homogenizador', 108),
('1.6.0', 'Rebobinar motor Aspersor', 'Homogenizador', 109),
('1.7.0', 'Reforma Chassis', 'Homogenizador', 110),
('1.8.0', 'Pintura', 'Homogenizador', 111),
('2.1.0', 'Reparo cilindros', 'Balança', 201),
('2.2.0', 'Troca de rolamentos', 'Balança', 202),
('2.3.0', 'Atuadores', 'Balança', 203),
('2.4.0', 'Válvula três vias', 'Balança', 204),
('2.5.0', 'Sensor giratório de líquido', 'Balança', 205),
('2.6.0', 'Fluxômetro', 'Balança', 206),
('2.7.0', 'Célula de carga', 'Balança', 207),
('2.8.0', 'Mangueiramento', 'Balança', 208),
('2.9.0', 'Pintura', 'Balança', 209),
('3.1.0', 'Reparo de rolamento', 'Líquidos', 301),
('3.2.0', 'Troca de mangote', 'Líquidos', 302),
('3.3.0', 'Reparo agitador', 'Líquidos', 303),
('3.4.0', 'Pintura', 'Líquidos', 304),
('4.1.0', 'Troca de rolamento', 'Pó', 401),
('5.1.0', 'Troca de corrente', 'Elevador', 501),
('5.2.0', 'Troca de Coroas', 'Elevador', 502),
('5.3.0', 'Troca de canecas', 'Elevador', 503),
('5.4.0', 'Reparo de Redutor', 'Elevador', 504),
('5.5.0', 'Pintura', 'Elevador', 505),
('6.1.0', 'Pintura', 'Caixa Recebimento', 601),
('7.1.0', 'Pintura', 'Caixa Ensaque', 701),
('8.1.0', 'Válvula nova', 'Válvula Y', 801),
('8.2.0', 'Pintura', 'Válvula Y', 802),
('9.1.0', 'Troca cartucho', 'Filtro', 901),
('9.2.0', 'Troca eletroválvula', 'Filtro', 902),
('9.3.0', 'Reparo válvula rotativa', 'Filtro', 903),
('9.4.0', 'Pintura', 'Filtro', 904),
('10.1.0', 'Eletrocalha', 'Montagem', 1001),
('10.2.0', 'Mangueiras', 'Montagem', 1002),
('10.3.0', 'Conexões', 'Montagem', 1003),
('11.1.0', 'Calibração por peso', 'Upgrade', 1101),
('11.2.0', 'Aumento de líquidos', 'Upgrade', 1102),
('11.3.0', 'Tablet', 'Upgrade', 1103),
('11.4.0', 'Atualização Balança', 'Upgrade', 1104);