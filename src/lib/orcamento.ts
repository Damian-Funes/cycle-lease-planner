export interface ItemOrcamento {
  equipamento_id: string;
  codigo: string;
  descricao: string;
  valor_unitario: number;
  quantidade: number;
}

export type DescontoTipo = "percentual" | "valor";

export interface OrcamentoParams {
  numeroOrcamento: string;
  clientName: string;
  contatoNome: string;
  clienteEndereco: string;
  clienteTelefone: string;
  clienteCnpj: string;
  clienteEmail: string;
  itens: ItemOrcamento[];
  descontoTipo: DescontoTipo;
  descontoValor: number;
  frete: number;
  condicoesPagamento: string;
  prazoEntrega: string;
  validadeDias: number;
  localEntrega: string;
  observacoes: string;
  status: string;
  organizacao_id?: string | null;
  pessoa_contato_id?: string | null;
  oportunidade_id?: string | null;
  dados_congelados?: boolean;
}

export const DEFAULT_ORCAMENTO: OrcamentoParams = {
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
  organizacao_id: null,
  pessoa_contato_id: null,
  oportunidade_id: null,
  dados_congelados: false,
};

export function calcSubtotal(itens: ItemOrcamento[]): number {
  return itens.reduce((s, it) => s + it.valor_unitario * it.quantidade, 0);
}

export function calcDescontoAplicado(subtotal: number, tipo: DescontoTipo, valor: number): number {
  if (tipo === "percentual") return subtotal * (valor / 100);
  return valor;
}

export function calcTotal(p: Pick<OrcamentoParams, "itens" | "descontoTipo" | "descontoValor" | "frete">): number {
  const sub = calcSubtotal(p.itens);
  const desc = calcDescontoAplicado(sub, p.descontoTipo, p.descontoValor);
  return Math.max(0, sub - desc) + (Number(p.frete) || 0);
}
