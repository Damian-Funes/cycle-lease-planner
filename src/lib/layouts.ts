import { supabase } from "@/integrations/supabase/client";

export interface LayoutRow {
  id: string;
  origem_tipo: "proposta" | "orcamento";
  origem_id: string;
  cliente: string | null;
  cidade: string | null;
  unidade: string | null;
  piso_largura_mm: number;
  piso_comprimento_mm: number;
  piso_imagem_url: string | null;
  piso_imagem_opacidade: number;
  revisao: string;
  status: "rascunho" | "aprovado" | "arquivado";
  observacoes: string | null;
  created_at: string;
  updated_at: string;
}

export interface LayoutItemRow {
  item_id: string;
  layout_id: string;
  pos_x_mm: number;
  pos_y_mm: number;
  pos_z_mm?: number;
  rotacao: 0 | 90 | 180 | 270;
  ordem: number;
  rotulo_customizado: string | null;
  equipamento_id: string;
  codigo: string;
  nome: string;
  categoria: string | null;
  largura_mm: number | null;
  comprimento_mm: number | null;
  altura_mm: number | null;
  imagem_url: string | null;
  cor_categoria: string | null;
  modelo_3d_url?: string | null;
  glb_rotacao_x?: number | null;
  glb_rotacao_z?: number | null;
}

export const PISO_MIN_MM = 5000;
export const PISO_MAX_MM = 50000;
export const SNAP_MM = 100;

/** Snap a value to the nearest multiple of `step`. */
export function snap(value: number, step = SNAP_MM): number {
  return Math.round(value / step) * step;
}

/** Clamp position so the equipment stays inside the floor (centered coords). */
export function clampPos(
  x: number,
  y: number,
  w: number,
  h: number,
  pisoW: number,
  pisoH: number,
  rotacao: number,
): { x: number; y: number } {
  // When rotated 90/270 the bbox swaps width/height
  const rot = rotacao % 180 !== 0;
  const bw = rot ? h : w;
  const bh = rot ? w : h;
  return {
    x: Math.max(bw / 2, Math.min(pisoW - bw / 2, x)),
    y: Math.max(bh / 2, Math.min(pisoH - bh / 2, y)),
  };
}

/** Load list of layouts with thumbnails (just the meta for now). */
export async function listLayouts(): Promise<LayoutRow[]> {
  const { data, error } = await supabase
    .from("layouts")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as LayoutRow[];
}

/** Load all items of a given layout via the RPC-friendly view. */
export async function listLayoutItems(layoutId: string): Promise<LayoutItemRow[]> {
  const { data, error } = await supabase
    .from("vw_layout_completo")
    .select("*")
    .eq("layout_id", layoutId)
    .order("ordem");
  if (error) throw error;
  return (data ?? []) as LayoutItemRow[];
}
