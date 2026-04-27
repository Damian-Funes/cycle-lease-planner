-- ============================================================
-- 1. Estende a tabela equipamentos com dados para o editor 2D
-- ============================================================
ALTER TABLE public.equipamentos
  ADD COLUMN IF NOT EXISTS categoria text,
  ADD COLUMN IF NOT EXISTS largura_mm integer,
  ADD COLUMN IF NOT EXISTS comprimento_mm integer,
  ADD COLUMN IF NOT EXISTS altura_mm integer,
  ADD COLUMN IF NOT EXISTS cor_categoria text DEFAULT '#888780';

-- Restringe categoria aos valores válidos (permite NULL para registros antigos)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'equipamentos_categoria_check'
  ) THEN
    ALTER TABLE public.equipamentos
      ADD CONSTRAINT equipamentos_categoria_check
      CHECK (categoria IS NULL OR categoria IN (
        'recebimento','elevacao','armazenagem','tratamento',
        'ensaque','liquidos','po','filtragem','transporte','outro'
      ));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_equip_categoria ON public.equipamentos(categoria);

-- ============================================================
-- 2. Tabela layouts (origem polimórfica: proposta OU orçamento)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.layouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origem_tipo text NOT NULL CHECK (origem_tipo IN ('proposta','orcamento')),
  origem_id uuid NOT NULL,
  cliente text,
  cidade text,
  unidade text,
  piso_largura_mm integer NOT NULL DEFAULT 20000,
  piso_comprimento_mm integer NOT NULL DEFAULT 15000,
  piso_imagem_url text,
  piso_imagem_opacidade numeric NOT NULL DEFAULT 0.5,
  revisao text NOT NULL DEFAULT 'R00',
  status text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','aprovado','arquivado')),
  observacoes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_layouts_origem ON public.layouts(origem_tipo, origem_id);
CREATE INDEX IF NOT EXISTS idx_layouts_status ON public.layouts(status);

-- Trigger updated_at (a função public.update_updated_at_column já existe)
DROP TRIGGER IF EXISTS trg_layouts_updated_at ON public.layouts;
CREATE TRIGGER trg_layouts_updated_at
  BEFORE UPDATE ON public.layouts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.layouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved users can view layouts"
  ON public.layouts FOR SELECT TO authenticated
  USING (public.is_approved(auth.uid()));

CREATE POLICY "Approved users can insert layouts"
  ON public.layouts FOR INSERT TO authenticated
  WITH CHECK (public.is_approved(auth.uid()));

CREATE POLICY "Approved users can update layouts"
  ON public.layouts FOR UPDATE TO authenticated
  USING (public.is_approved(auth.uid()));

CREATE POLICY "Approved users can delete layouts"
  ON public.layouts FOR DELETE TO authenticated
  USING (public.is_approved(auth.uid()));

-- ============================================================
-- 3. Tabela layout_equipamentos
-- ============================================================
CREATE TABLE IF NOT EXISTS public.layout_equipamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  layout_id uuid NOT NULL REFERENCES public.layouts(id) ON DELETE CASCADE,
  equipamento_id uuid NOT NULL REFERENCES public.equipamentos(id) ON DELETE RESTRICT,
  pos_x_mm integer NOT NULL DEFAULT 0,
  pos_y_mm integer NOT NULL DEFAULT 0,
  rotacao integer NOT NULL DEFAULT 0 CHECK (rotacao IN (0,90,180,270)),
  ordem integer NOT NULL DEFAULT 0,
  rotulo_customizado text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_layout_eq_layout ON public.layout_equipamentos(layout_id);

ALTER TABLE public.layout_equipamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved users can view layout items"
  ON public.layout_equipamentos FOR SELECT TO authenticated
  USING (public.is_approved(auth.uid()));

CREATE POLICY "Approved users can insert layout items"
  ON public.layout_equipamentos FOR INSERT TO authenticated
  WITH CHECK (public.is_approved(auth.uid()));

CREATE POLICY "Approved users can update layout items"
  ON public.layout_equipamentos FOR UPDATE TO authenticated
  USING (public.is_approved(auth.uid()));

CREATE POLICY "Approved users can delete layout items"
  ON public.layout_equipamentos FOR DELETE TO authenticated
  USING (public.is_approved(auth.uid()));

-- ============================================================
-- 4. View para o front consumir tudo num select
-- ============================================================
CREATE OR REPLACE VIEW public.vw_layout_completo AS
SELECT
  le.id           AS item_id,
  le.layout_id,
  le.pos_x_mm,
  le.pos_y_mm,
  le.rotacao,
  le.ordem,
  le.rotulo_customizado,
  e.id            AS equipamento_id,
  e.codigo,
  e.descricao     AS nome,
  e.categoria,
  e.largura_mm,
  e.comprimento_mm,
  e.altura_mm,
  e.imagem_url,
  e.cor_categoria
FROM public.layout_equipamentos le
JOIN public.equipamentos e ON e.id = le.equipamento_id
ORDER BY le.layout_id, le.ordem;

-- A view herda RLS das tabelas base.

-- ============================================================
-- 5. Bucket público "plantas-cliente"
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('plantas-cliente','plantas-cliente', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public can view plantas-cliente"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'plantas-cliente');

CREATE POLICY "Approved users can upload plantas-cliente"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'plantas-cliente'
    AND public.is_approved(auth.uid())
  );

CREATE POLICY "Approved users can update plantas-cliente"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'plantas-cliente'
    AND public.is_approved(auth.uid())
  );

CREATE POLICY "Approved users can delete plantas-cliente"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'plantas-cliente'
    AND public.is_approved(auth.uid())
  );