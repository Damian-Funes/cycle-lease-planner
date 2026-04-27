export type EquipamentoCategoria =
  | "recebimento"
  | "elevacao"
  | "armazenagem"
  | "tratamento"
  | "ensaque"
  | "liquidos"
  | "po"
  | "filtragem"
  | "transporte"
  | "outro";

export const CATEGORIAS: { value: EquipamentoCategoria; label: string; cor: string }[] = [
  { value: "recebimento", label: "Recebimento", cor: "#0F6E56" },
  { value: "elevacao", label: "Elevação", cor: "#534AB7" },
  { value: "armazenagem", label: "Armazenagem", cor: "#185FA5" },
  { value: "tratamento", label: "Tratamento", cor: "#854F0B" },
  { value: "ensaque", label: "Ensaque", cor: "#993556" },
  { value: "liquidos", label: "Líquidos", cor: "#993C1D" },
  { value: "po", label: "Pó", cor: "#5F5E5A" },
  { value: "filtragem", label: "Filtragem", cor: "#888780" },
  { value: "transporte", label: "Transporte", cor: "#1D9E75" },
  { value: "outro", label: "Outro", cor: "#888780" },
];

export interface Equipamento {
  id: string;
  codigo: string;
  descricao: string;
  valor_custo: number;
  valor_venda?: number | null;
  imagem_url?: string | null;
  categoria?: EquipamentoCategoria | null;
  largura_mm?: number | null;
  comprimento_mm?: number | null;
  altura_mm?: number | null;
  cor_categoria?: string | null;
  ativo: boolean;
}

export interface ItemProjeto {
  equipamento_id: string;
  codigo: string;
  descricao: string;
  valor_custo: number;
  valor_venda?: number | null;
  quantidade: number;
  subtotal: number;
}

export function calcEntrada(itens: ItemProjeto[]): number {
  return itens.reduce((sum, item) => sum + item.subtotal, 0);
}

export function calcValorVendaSugerido(itens: ItemProjeto[]): number {
  return itens.reduce(
    (sum, item) => sum + (Number(item.valor_venda) || 0) * item.quantidade,
    0
  );
}
