export interface ItemOrcamento {
  equipamento_id: string;
  codigo: string;
  descricao: string;
  valor_unitario: number;
  quantidade: number;
  sem_preco_venda?: boolean;
  avulso?: boolean;
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
  // Montagem (todos opcionais — só usados pelo orçamento comercial)
  montagemNumeroColaboradores?: number;
  montagemDias?: number;
  montagemKmOrigemDestino?: number;
  montagemNumeroVeiculos?: number;
  montagemEhFazenda?: boolean;
  montagemKmHotelLocal?: number;
  montagemObservacoes?: string;
  montagemCustoTotal?: number;
  montagemPrecoTotal?: number;
  montagemMargemAplicada?: number;
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
  montagemNumeroColaboradores: 0,
  montagemDias: 0,
  montagemKmOrigemDestino: 0,
  montagemNumeroVeiculos: 1,
  montagemEhFazenda: false,
  montagemKmHotelLocal: 0,
  montagemObservacoes: "",
  montagemValorTotal: 0,
};

export function calcSubtotal(itens: ItemOrcamento[]): number {
  return itens.reduce((s, it) => s + it.valor_unitario * it.quantidade, 0);
}

export function calcDescontoAplicado(subtotal: number, tipo: DescontoTipo, valor: number): number {
  if (tipo === "percentual") return subtotal * (valor / 100);
  return valor;
}

export function calcTotal(p: Pick<OrcamentoParams, "itens" | "descontoTipo" | "descontoValor" | "frete" | "montagemValorTotal">): number {
  const sub = calcSubtotal(p.itens);
  const desc = calcDescontoAplicado(sub, p.descontoTipo, p.descontoValor);
  const montagem = Number(p.montagemValorTotal) || 0;
  return Math.max(0, sub - desc) + (Number(p.frete) || 0) + montagem;
}
