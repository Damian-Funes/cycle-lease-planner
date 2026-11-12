// Card de comissão: regras fixas do CEO, sem penalidade. Base vem de fn_comissao_base (sem custo).
export type OrcamentoComissao = {
  id: string; numero: string; cliente: string | null; venda: number; status: string;
  atualizado_em: string; vendedor_id: string | null; vendedor_nome?: string | null;
  recorrente: boolean; seminovo: boolean;
};
export const TAXA = { novo: 0.04, recorrente: 0.05, seminovo: 0.02 } as const;
const ABERTOS = new Set(["rascunho", "enviado"]);
export const DIAS_EM_JOGO = 90;

export const taxa = (o: Pick<OrcamentoComissao, "recorrente" | "seminovo">) =>
  o.seminovo ? TAXA.seminovo : o.recorrente ? TAXA.recorrente : TAXA.novo;
export const comissao = (o: OrcamentoComissao) => Math.round(Math.max(0, Number(o.venda) || 0) * taxa(o) * 100) / 100;
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
