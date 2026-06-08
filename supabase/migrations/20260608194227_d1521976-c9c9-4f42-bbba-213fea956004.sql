
ALTER TABLE public.organizacoes ADD COLUMN IF NOT EXISTS latitude numeric;
ALTER TABLE public.organizacoes ADD COLUMN IF NOT EXISTS longitude numeric;

CREATE TABLE IF NOT EXISTS public.rotas (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  vendedor_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  data_rota date NOT NULL,
  status text NOT NULL DEFAULT 'planejada',
  observacoes text,
  km_total_estimado numeric
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rotas TO authenticated;
GRANT ALL ON public.rotas TO service_role;

ALTER TABLE public.rotas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rotas_select" ON public.rotas FOR SELECT TO authenticated
USING (vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "rotas_insert" ON public.rotas FOR INSERT TO authenticated
WITH CHECK (vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "rotas_update" ON public.rotas FOR UPDATE TO authenticated
USING (vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "rotas_delete" ON public.rotas FOR DELETE TO authenticated
USING (vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_rotas_updated_at BEFORE UPDATE ON public.rotas
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.rota_paradas (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  rota_id uuid NOT NULL REFERENCES public.rotas(id) ON DELETE CASCADE,
  ordem integer NOT NULL DEFAULT 0,
  organizacao_id uuid REFERENCES public.organizacoes(id) ON DELETE SET NULL,
  oportunidade_id uuid REFERENCES public.oportunidades(id) ON DELETE SET NULL,
  cidade text,
  estado text,
  latitude numeric,
  longitude numeric,
  tipo text NOT NULL DEFAULT 'visita',
  observacoes text,
  atividade_id uuid REFERENCES public.atividades(id) ON DELETE SET NULL,
  concluida boolean NOT NULL DEFAULT false
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rota_paradas TO authenticated;
GRANT ALL ON public.rota_paradas TO service_role;

ALTER TABLE public.rota_paradas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "paradas_select" ON public.rota_paradas FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.rotas r WHERE r.id = rota_id AND (r.vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))));

CREATE POLICY "paradas_insert" ON public.rota_paradas FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.rotas r WHERE r.id = rota_id AND (r.vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))));

CREATE POLICY "paradas_update" ON public.rota_paradas FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.rotas r WHERE r.id = rota_id AND (r.vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))))
WITH CHECK (EXISTS (SELECT 1 FROM public.rotas r WHERE r.id = rota_id AND (r.vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))));

CREATE POLICY "paradas_delete" ON public.rota_paradas FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.rotas r WHERE r.id = rota_id AND (r.vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))));

CREATE INDEX IF NOT EXISTS idx_rota_paradas_rota ON public.rota_paradas(rota_id, ordem);
CREATE INDEX IF NOT EXISTS idx_rotas_vendedor_data ON public.rotas(vendedor_id, data_rota DESC);
CREATE INDEX IF NOT EXISTS idx_organizacoes_coords ON public.organizacoes(latitude, longitude) WHERE latitude IS NOT NULL;
