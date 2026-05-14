CREATE TABLE IF NOT EXISTS public.layout_conexoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  layout_id uuid NOT NULL REFERENCES public.layouts(id) ON DELETE CASCADE,
  item_origem_id uuid NOT NULL REFERENCES public.layout_equipamentos(id) ON DELETE CASCADE,
  item_destino_id uuid NOT NULL REFERENCES public.layout_equipamentos(id) ON DELETE CASCADE,
  ponto_origem_x_mm integer NOT NULL DEFAULT 0,
  ponto_origem_y_mm integer NOT NULL DEFAULT 0,
  ponto_origem_z_mm integer NOT NULL DEFAULT 0,
  ponto_destino_x_mm integer NOT NULL DEFAULT 0,
  ponto_destino_y_mm integer NOT NULL DEFAULT 0,
  ponto_destino_z_mm integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT distinct_endpoints CHECK (item_origem_id <> item_destino_id)
);

CREATE INDEX IF NOT EXISTS idx_layout_conexoes_layout ON public.layout_conexoes(layout_id);

ALTER TABLE public.layout_conexoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view layout_conexoes"
ON public.layout_conexoes FOR SELECT
TO authenticated USING (true);

CREATE POLICY "Authenticated can insert layout_conexoes"
ON public.layout_conexoes FOR INSERT
TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can delete layout_conexoes"
ON public.layout_conexoes FOR DELETE
TO authenticated USING (true);

CREATE POLICY "Authenticated can update layout_conexoes"
ON public.layout_conexoes FOR UPDATE
TO authenticated USING (true);