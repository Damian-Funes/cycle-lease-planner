// Funções puras da Etapa 2/3 das viagens: janela do diário, comparativo estimado x real, resumo mensal.

export type CategoriaGasto = "combustivel" | "pedagio" | "hotel" | "alimentacao" | "outros";
export const CATEGORIAS_GASTO: { id: CategoriaGasto; nome: string }[] = [
  { id: "combustivel", nome: "Combustível" },
  { id: "pedagio", nome: "Pedágio" },
  { id: "hotel", nome: "Hotel" },
  { id: "alimentacao", nome: "Alimentação" },
  { id: "outros", nome: "Outros" },
];

const addDia = (d: string, n: number) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

type RotaPeriodo = { status: string; data_rota: string; data_inicio?: string | null; data_fim?: string | null; prestacao_concluida_em?: string | null };
const ini = (r: RotaPeriodo) => r.data_inicio ?? r.data_rota;
const fim = (r: RotaPeriodo) => r.data_fim ?? r.data_rota;

/** Espelha fn_pode_escrever_diario (sem o teste de dono): aprovada, de início até fim + 1 dia. */
export function podeEscreverDiario(r: RotaPeriodo, hoje: string) {
  return r.status === "aprovada" && hoje >= ini(r) && hoje <= addDia(fim(r), 1);
}
/** Espelha fn_pode_lancar_gasto: aprovada e prestação não concluída. */
export function podeLancarGasto(r: RotaPeriodo) {
  return r.status === "aprovada" && !r.prestacao_concluida_em;
}
/** Viagem em andamento: aprovada e o período inclui hoje. */
export function emAndamento(r: RotaPeriodo, hoje: string) {
  return r.status === "aprovada" && hoje >= ini(r) && hoje <= fim(r);
}

export type Estimado = { combustivel: number | null; pedagio: number | null; hospedagem: number | null; alimentacao: number | null; total: number | null };
export type LinhaComparativo = { categoria: CategoriaGasto; nome: string; estimado: number | null; real: number; diferenca: number | null };

/** Estimado x real por categoria. Hotel e "Outros" só têm valor real (não há diária estimada). */
export function comparativo(est: Estimado | null, gastos: { categoria: CategoriaGasto; valor: number }[]) {
  const real = (c: CategoriaGasto) => round2(gastos.filter((g) => g.categoria === c).reduce((s, g) => s + Number(g.valor), 0));
  const estDe: Record<CategoriaGasto, number | null> = {
    combustivel: est?.combustivel ?? null, pedagio: est?.pedagio ?? null, hotel: est?.hospedagem ? est.hospedagem : null,
    alimentacao: est?.alimentacao ?? null, outros: null,
  };
  const linhas: LinhaComparativo[] = CATEGORIAS_GASTO.map(({ id, nome }) => {
    const r = real(id); const e = estDe[id];
    return { categoria: id, nome, estimado: e, real: r, diferenca: e == null ? null : round2(r - e) };
  });
  const totalReal = round2(linhas.reduce((s, l) => s + l.real, 0));
  const totalEst = est?.total ?? null;
  return { linhas, totalEstimado: totalEst, totalReal, diferencaTotal: totalEst == null ? null : round2(totalReal - totalEst), temGastos: gastos.length > 0 };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Dimensões para comprimir foto (lado maior ≤ max, mantendo proporção, nunca amplia). */
export function dimensoesReduzidas(w: number, h: number, max = 1600) {
  const maior = Math.max(w, h);
  if (maior <= max) return { w, h };
  const k = max / maior;
  return { w: Math.round(w * k), h: Math.round(h * k) };
}

export type RotaResumo = RotaPeriodo & {
  id: string; vendedor_id: string; custo_total_est: number | null;
  paradas: { tipo: string; visitada: boolean | null }[];
};
export type ResumoVendedor = {
  vendedor_id: string; viagens: number; dias: number; visitasFeitas: number; visitasPlanejadas: number;
  investido: number; investidoEstimado: boolean; custoPorVisita: number | null; dealsAvancados: number; orcamentos: number;
};

/**
 * Resumo do mês por vendedor. Investido usa o real da viagem quando ela tem gastos;
 * senão o estimado (e a linha fica sinalizada como estimada).
 */
export function resumoViagensMes(i: {
  rotas: RotaResumo[];
  gastos: { rota_id: string; valor: number }[];
  dealsAvancados: { usuario_id: string | null; oportunidade_id: string }[];
  orcamentos: { user_id: string | null }[];
}): ResumoVendedor[] {
  const realPorRota = new Map<string, number>();
  for (const g of i.gastos) realPorRota.set(g.rota_id, (realPorRota.get(g.rota_id) ?? 0) + Number(g.valor));
  const m = new Map<string, ResumoVendedor & { _dias: Set<string>; _deals: Set<string> }>();
  const get = (v: string) => {
    let g = m.get(v);
    if (!g) { g = { vendedor_id: v, viagens: 0, dias: 0, visitasFeitas: 0, visitasPlanejadas: 0, investido: 0, investidoEstimado: false, custoPorVisita: null, dealsAvancados: 0, orcamentos: 0, _dias: new Set(), _deals: new Set() }; m.set(v, g); }
    return g;
  };
  for (const r of i.rotas) {
    if (r.status === "cancelada" || r.status === "reprovada" || r.status === "rascunho") continue;
    const g = get(r.vendedor_id);
    g.viagens++;
    for (let d = ini(r); d <= fim(r); d = addDia(d, 1)) g._dias.add(d);
    const visitas = r.paradas.filter((p) => p.tipo !== "pernoite");
    g.visitasPlanejadas += visitas.length;
    g.visitasFeitas += visitas.filter((p) => p.visitada === true).length;
    const real = realPorRota.get(r.id);
    if (real != null) g.investido += real;
    else { g.investido += Number(r.custo_total_est ?? 0); if (r.custo_total_est != null) g.investidoEstimado = true; }
  }
  for (const h of i.dealsAvancados) if (h.usuario_id && m.has(h.usuario_id)) m.get(h.usuario_id)!._deals.add(h.oportunidade_id);
  for (const o of i.orcamentos) if (o.user_id && m.has(o.user_id)) m.get(o.user_id)!.orcamentos++;
  return [...m.values()].map(({ _dias, _deals, ...g }) => ({
    ...g, dias: _dias.size, dealsAvancados: _deals.size, investido: round2(g.investido),
    custoPorVisita: g.visitasFeitas ? round2(g.investido / g.visitasFeitas) : null,
  }));
}

/** "há 2 h", "há 15 min", "há 3 dias". */
export function haQuantoTempo(iso: string, agora = new Date()) {
  const min = Math.max(0, Math.round((agora.getTime() - new Date(iso).getTime()) / 60000));
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return `há ${d} ${d === 1 ? "dia" : "dias"}`;
}
