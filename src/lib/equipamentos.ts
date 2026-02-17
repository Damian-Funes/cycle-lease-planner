export interface Equipamento {
  id: string;
  codigo: string;
  descricao: string;
  valor_custo: number;
  ativo: boolean;
}

export interface ItemProjeto {
  equipamento_id: string;
  codigo: string;
  descricao: string;
  valor_custo: number;
  quantidade: number;
  subtotal: number;
}

export function calcEntrada(itens: ItemProjeto[]): number {
  return itens.reduce((sum, item) => sum + item.subtotal, 0);
}
