export interface ItemReformaCatalogo {
  id: string;
  codigo: string;
  descricao: string;
  categoria: string;
  valor: number;
  ordem: number;
  ativo: boolean;
}

export interface ItemReformaSelecionado {
  item_id: string;
  codigo: string;
  descricao: string;
  categoria: string;
  valor_unitario: number;
  quantidade: number;
}

export type DescontoTipo = "percentual" | "valor";

export interface ReformaParams {
  numeroOrcamento: string;
  clientName: string;
  contatoNome: string;
  clienteEndereco: string;
  clienteTelefone: string;
  clienteCnpj: string;
  clienteEmail: string;
  itens: ItemReformaSelecionado[];
  descontoTipo: DescontoTipo;
  descontoValor: number;
  frete: number;
  condicoesPagamento: string;
  prazoEntrega: string;
  validadeDias: number;
  localEntrega: string;
  observacoes: string;
  status: string;
}

export const DEFAULT_REFORMA: ReformaParams = {
  numeroOrcamento: "",
  clientName: "",
  contatoNome: "",
  clienteEndereco: "",
  clienteTelefone: "",
  clienteCnpj: "",
  clienteEmail: "",
  itens: [],
  descontoTipo: "percentual",
  descontoValor: 0,
  frete: 0,
  condicoesPagamento: "",
  prazoEntrega: "",
  validadeDias: 10,
  localEntrega: "",
  observacoes: "",
  status: "rascunho",
};

export function calcSubtotalReforma(itens: ItemReformaSelecionado[]): number {
  return itens.reduce((s, it) => s + it.valor_unitario * it.quantidade, 0);
}

export function calcDescontoReforma(subtotal: number, tipo: DescontoTipo, valor: number): number {
  if (tipo === "percentual") return subtotal * (valor / 100);
  return valor;
}

export function calcTotalReforma(p: Pick<ReformaParams, "itens" | "descontoTipo" | "descontoValor" | "frete">): number {
  const sub = calcSubtotalReforma(p.itens);
  const desc = calcDescontoReforma(sub, p.descontoTipo, p.descontoValor);
  return Math.max(0, sub - desc) + (Number(p.frete) || 0);
}
