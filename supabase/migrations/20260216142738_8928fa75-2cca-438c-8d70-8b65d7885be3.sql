
-- Create propostas table
CREATE TABLE public.propostas (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  nome_cliente text NOT NULL,
  valor_projeto numeric NOT NULL,
  entrada numeric NOT NULL,
  divida numeric NOT NULL,
  tarifa_f1 numeric NOT NULL,
  tarifa_f2 numeric NOT NULL,
  tarifa_excedente numeric NOT NULL,
  reajuste_anual numeric NOT NULL,
  peso_saco integer NOT NULL DEFAULT 40,
  vol_min_f2_pct integer NOT NULL DEFAULT 50,
  volume_minimo_calculado integer NOT NULL,
  mensalidade_f1 numeric NOT NULL,
  mensalidade_f2 numeric NOT NULL,
  total_10_anos numeric NOT NULL,
  status text DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'enviada', 'aprovada', 'recusada')),
  observacoes text
);

-- Enable RLS
ALTER TABLE public.propostas ENABLE ROW LEVEL SECURITY;

-- Since there's no auth yet, allow all operations for anon users (commercial tool)
CREATE POLICY "Allow all access to propostas"
  ON public.propostas
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_propostas_updated_at
  BEFORE UPDATE ON public.propostas
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
