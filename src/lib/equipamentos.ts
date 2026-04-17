export interface Equipamento {
  id: string;
  codigo: string;
  descricao: string;
  valor_custo: number;
  valor_venda?: number | null;
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
