// Card de comissão: regras fixas do CEO, sem penalidade. Dados vêm só de orçamentos (sem custo) + tag da organização.
export type OrcamentoComissao = {
  id: string; numero: string; cliente: string | null; venda: number; status: string;
  atualizado_em: string; vendedor_id: string | null; vendedor_nome?: string | null;
  organizacao_id?: string | null; recorrente: boolean; seminovo?: boolean;
};
/** Linha crua de `orcamentos` (somente colunas de venda; nunca custo). */
export type LinhaOrcamento = {
  id: string; numero_orcamento: string | null; nome_cliente: string | null; subtotal: number | null;
  desconto_tipo: string | null; desconto_valor: number | null; status: string | null; updated_at: string;
  responsavel_id: string | null; organizacao_id: string | null;
};

export const TAXA = { novo: 0.04, recorrente: 0.05, seminovo: 0.02 } as const;
/** Seminovo (2%) fica pronto no cálculo, desligado até existir onde marcar. */
export const SEMINOVO_ATIVO = false;
export const TAG_CLIENTE_ANTIGO = "cliente_antigo";
const ABERTOS = new Set(["rascunho", "enviado"]);
export const DIAS_EM_JOGO = 90;

export const clienteAntigo = (tags: string[] | null | undefined) => (tags ?? []).includes(TAG_CLIENTE_ANTIGO);
/** Marca/desmarca "cliente antigo" preservando as demais tags. */
export const alternarClienteAntigo = (tags: string[] | null | undefined, marcar: boolean) => {
  const sem = (tags ?? []).filter(t => t !== TAG_CLIENTE_ANTIGO);
  return marcar ? [...sem, TAG_CLIENTE_ANTIGO] : sem;
};

/** Venda = subtotal − desconto (sem frete e sem montagem). */
export function vendaDe(l: Pick<LinhaOrcamento, "subtotal" | "desconto_tipo" | "desconto_valor">) {
  const sub = Number(l.subtotal) || 0, d = Number(l.desconto_valor) || 0;
  return Math.max(0, sub - (l.desconto_tipo === "valor" ? d : sub * d / 100));
}

export const paraComissao = (l: LinhaOrcamento, tags: string[] | null | undefined, vendedorNome?: string | null): OrcamentoComissao => ({
  id: l.id, numero: l.numero_orcamento ?? l.id, cliente: l.nome_cliente, venda: vendaDe(l), status: l.status ?? "",
  atualizado_em: l.updated_at, vendedor_id: l.responsavel_id, vendedor_nome: vendedorNome ?? null,
  organizacao_id: l.organizacao_id, recorrente: clienteAntigo(tags), seminovo: false,
});

export const taxa = (o: Pick<OrcamentoComissao, "recorrente" | "seminovo">, seminovoAtivo = SEMINOVO_ATIVO) =>
  seminovoAtivo && o.seminovo ? TAXA.seminovo : o.recorrente ? TAXA.recorrente : TAXA.novo;
export const comissao = (o: OrcamentoComissao, seminovoAtivo = SEMINOVO_ATIVO) =>
  Math.round(Math.max(0, Number(o.venda) || 0) * taxa(o, seminovoAtivo) * 100) / 100;
export const numeroBase = (n: string) => n.replace(/-V\d+$/i, "");

/** Só a versão mais recente de cada número de orçamento. */
export function ultimasVersoes(lista: OrcamentoComissao[]) {
  const m = new Map<string, OrcamentoComissao>();
  for (const o of lista) {
    const k = numeroBase(o.numero ?? o.id); const a = m.get(k);
    if (!a || o.atualizado_em > a.atualizado_em) m.set(k, o);
  }
  return [...m.values()];
}

export function resumoComissao(lista: OrcamentoComissao[], agora = new Date()) {
  const ultimas = ultimasVersoes(lista);
  const limite = new Date(agora.getTime() - DIAS_EM_JOGO * 86400000).toISOString();
  const ano = String(agora.getFullYear());
  const abertos = ultimas.filter(o => ABERTOS.has(o.status) && o.atualizado_em >= limite)
    .map(o => ({ ...o, ganha: comissao(o) })).sort((a, b) => b.ganha - a.ganha);
  const ganhos = ultimas.filter(o => o.status === "aprovado" && o.atualizado_em.slice(0, 4) === ano);
  return {
    emJogo: abertos.reduce((s, o) => s + o.ganha, 0),
    qtdAbertos: abertos.length,
    abertos,
    top3: abertos.slice(0, 3),
    garantidoAno: ganhos.reduce((s, o) => s + comissao(o), 0),
    qtdGanhos: ganhos.length,
  };
}

export function porVendedor(lista: OrcamentoComissao[], agora = new Date()) {
  const g = new Map<string, OrcamentoComissao[]>();
  for (const o of lista) { const k = o.vendedor_id ?? "—"; g.set(k, [...(g.get(k) ?? []), o]); }
  return [...g.entries()].map(([id, l]) => ({ id, nome: l[0].vendedor_nome ?? "Sem responsável", ...resumoComissao(l, agora) }))
    .sort((a, b) => b.emJogo - a.emJogo);
}
