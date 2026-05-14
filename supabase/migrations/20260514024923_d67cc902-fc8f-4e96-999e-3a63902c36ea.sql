ALTER TABLE public.layout_equipamentos
  ADD COLUMN IF NOT EXISTS pos_z_mm integer NOT NULL DEFAULT 0;

DROP VIEW IF EXISTS public.vw_layout_completo;

CREATE VIEW public.vw_layout_completo AS
SELECT
  le.id               AS item_id,
  le.layout_id,
  le.pos_x_mm,
  le.pos_y_mm,
  le.pos_z_mm,
  le.rotacao,
  le.ordem,
  le.rotulo_customizado,
  e.id                AS equipamento_id,
  e.codigo,
  e.descricao         AS nome,
  e.categoria,
  e.largura_mm,
  e.comprimento_mm,
  e.altura_mm,
  e.imagem_url,
  e.modelo_3d_url,
  e.glb_rotacao_x,
  e.glb_rotacao_z,
  e.cor_categoria
FROM public.layout_equipamentos le
JOIN public.equipamentos e ON e.id = le.equipamento_id
ORDER BY le.layout_id, le.ordem;

ALTER VIEW public.vw_layout_completo SET (security_invoker = true);