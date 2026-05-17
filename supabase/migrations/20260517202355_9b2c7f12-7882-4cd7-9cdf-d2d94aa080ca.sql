CREATE TABLE public.equipamento_contidos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipamento_pai_id uuid NOT NULL REFERENCES public.equipamentos(id) ON DELETE CASCADE,
  equipamento_filho_id uuid NOT NULL REFERENCES public.equipamentos(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (equipamento_pai_id, equipamento_filho_id),
  CHECK (equipamento_pai_id <> equipamento_filho_id)
);

CREATE INDEX idx_equip_contidos_pai ON public.equipamento_contidos(equipamento_pai_id);
CREATE INDEX idx_equip_contidos_filho ON public.equipamento_contidos(equipamento_filho_id);

ALTER TABLE public.equipamento_contidos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin gerencia equipamento_contidos"
ON public.equipamento_contidos FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Approved users veem equipamento_contidos"
ON public.equipamento_contidos FOR SELECT
TO authenticated
USING (is_approved(auth.uid()));

-- Semente: 0506 inclui 1101
INSERT INTO public.equipamento_contidos (equipamento_pai_id, equipamento_filho_id)
SELECT p.id, f.id
FROM public.equipamentos p, public.equipamentos f
WHERE p.codigo = '0506' AND f.codigo = '1101'
ON CONFLICT DO NOTHING;