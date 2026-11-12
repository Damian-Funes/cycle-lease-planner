// Comissão: regras fixas do CEO, sem penalidade. Base = custo dos equipamentos (calculado no banco por
// fn_comissao_orcamentos, que devolve só a comissão pronta); desconto não altera.
export type OrcamentoComissao = {
  id: string; numero: string; cliente: string | null; venda: number; status: string;
  atualizado_em: string; vendedor_id: string | null; vendedor_nome?: string | null;
  organizacao_id?: string | null; recorrente: boolean; seminovo?: boolean;
  /** Comissão já calculada no banco. */
  valor: number; itens_sem_custo?: number;
};
/** Linha de `fn_comissao_orcamentos`. */
export type LinhaComissao = {
  orcamento_id: string; numero_orcamento: string | null; nome_cliente: string | null; organizacao_id: string | null;
  responsavel_id: string | null; status: string | null; updated_at: string; venda: number | null;
  cliente_antigo: boolean | null; comissao: number | null; itens_sem_custo: number | null;
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

export const paraComissao = (l: LinhaComissao, vendedorNome?: string | null): OrcamentoComissao => ({
  id: l.orcamento_id, numero: l.numero_orcamento ?? l.orcamento_id, cliente: l.nome_cliente, venda: Number(l.venda) || 0,
  status: l.status ?? "", atualizado_em: l.updated_at, vendedor_id: l.responsavel_id, vendedor_nome: vendedorNome ?? null,
  organizacao_id: l.organizacao_id, recorrente: !!l.cliente_antigo, seminovo: false,
  valor: Number(l.comissao) || 0, itens_sem_custo: Number(l.itens_sem_custo) || 0,
});

export const taxa = (o: Pick<OrcamentoComissao, "recorrente" | "seminovo">, seminovoAtivo = SEMINOVO_ATIVO) =>
  seminovoAtivo && o.seminovo ? TAXA.seminovo : o.recorrente ? TAXA.recorrente : TAXA.novo;
/** Regra pura (espelha o SQL): custo × taxa. */
export const comissaoSobreCusto = (custo: number, o: Pick<OrcamentoComissao, "recorrente" | "seminovo">, seminovoAtivo = SEMINOVO_ATIVO) =>
  Math.round(Math.max(0, Number(custo) || 0) * taxa(o, seminovoAtivo) * 100) / 100;
export const comissao = (o: Pick<OrcamentoComissao, "valor">) => Math.max(0, Number(o.valor) || 0);
const normalizar = (t: string | null | undefined) =>
  (t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
/** Mesmo número pode ter versões de clientes diferentes: chave = número base + organização
 *  (sem organização: número base + nome normalizado + responsável). */
export const chaveVersao = (o: OrcamentoComissao) => o.organizacao_id
  ? `${numeroBase(o.numero ?? o.id)}|org:${o.organizacao_id}`
  : `${numeroBase(o.numero ?? o.id)}|nome:${normalizar(o.cliente)}|${o.vendedor_id ?? ""}`;
export const numeroBase = (n: string) => n.replace(/-V\d+$/i, "");

/** Só a versão mais recente de cada número + cliente. */
export function ultimasVersoes(lista: OrcamentoComissao[]) {
  const m = new Map<string, OrcamentoComissao>();
  for (const o of lista) {
    const k = chaveVersao(o); const a = m.get(k);
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
    itensSemCusto: [...abertos, ...ganhos].reduce((s, o) => s + (o.itens_sem_custo ?? 0), 0),
  };
}

export function porVendedor(lista: OrcamentoComissao[], agora = new Date()) {
  const g = new Map<string, OrcamentoComissao[]>();
  for (const o of lista) { const k = o.vendedor_id ?? "—"; g.set(k, [...(g.get(k) ?? []), o]); }
  return [...g.entries()].map(([id, l]) => ({ id, nome: l[0].vendedor_nome ?? "Sem responsável", ...resumoComissao(l, agora) }))
    .sort((a, b) => b.emJogo - a.emJogo);
}
