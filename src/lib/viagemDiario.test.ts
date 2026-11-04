import { describe, expect, it } from "vitest";
import { comparativo, dimensoesReduzidas, emAndamento, haQuantoTempo, podeEscreverDiario, podeLancarGasto, resumoViagensMes } from "./viagemDiario";

const r = (o: Partial<{ status: string; data_inicio: string; data_fim: string; prestacao_concluida_em: string | null }> = {}) =>
  ({ status: "aprovada", data_rota: o.data_inicio ?? "2026-11-04", data_inicio: "2026-11-04", data_fim: "2026-11-06", prestacao_concluida_em: null, ...o });

describe("janelas da viagem", () => {
  it("diário: do início até fim + 1 dia, só aprovada", () => {
    expect(podeEscreverDiario(r(), "2026-11-03")).toBe(false);
    expect(podeEscreverDiario(r(), "2026-11-04")).toBe(true);
    expect(podeEscreverDiario(r(), "2026-11-07")).toBe(true);
    expect(podeEscreverDiario(r(), "2026-11-08")).toBe(false);
    expect(podeEscreverDiario(r({ status: "concluida" }), "2026-11-05")).toBe(false);
  });
  it("gastos: até concluir a prestação", () => {
    expect(podeLancarGasto(r())).toBe(true);
    expect(podeLancarGasto(r({ prestacao_concluida_em: "2026-11-07T10:00:00Z" }))).toBe(false);
  });
  it("em andamento: período inclui hoje", () => {
    expect(emAndamento(r(), "2026-11-06")).toBe(true);
    expect(emAndamento(r(), "2026-11-07")).toBe(false);
  });
});

describe("comparativo estimado x real", () => {
  const est = { combustivel: 500, pedagio: 120, hospedagem: 300, alimentacao: null, total: 920 };
  it("soma por categoria, hotel compara com hospedagem e total", () => {
    const c = comparativo(est, [
      { categoria: "combustivel", valor: 350.5 }, { categoria: "combustivel", valor: 200 },
      { categoria: "hotel", valor: 280 }, { categoria: "alimentacao", valor: 90 }, { categoria: "outros", valor: 15 },
    ]);
    const l = Object.fromEntries(c.linhas.map((x) => [x.categoria, x]));
    expect(l.combustivel).toMatchObject({ estimado: 500, real: 550.5, diferenca: 50.5 });
    expect(l.pedagio).toMatchObject({ estimado: 120, real: 0, diferenca: -120 });
    expect(l.hotel).toMatchObject({ estimado: 300, real: 280, diferenca: -20 });
    expect(l.alimentacao).toMatchObject({ estimado: null, real: 90, diferenca: null });
    expect(l.outros).toMatchObject({ estimado: null, real: 15 });
    expect(c.totalReal).toBe(935.5);
    expect(c.diferencaTotal).toBe(15.5);
  });
  it("sem estimativa e sem gastos", () => {
    const c = comparativo(null, []);
    expect(c.temGastos).toBe(false);
    expect(c.totalEstimado).toBeNull();
    expect(c.diferencaTotal).toBeNull();
  });
});

describe("resumo mensal por vendedor", () => {
  const base = { data_rota: "2026-11-04", prestacao_concluida_em: null };
  it("real quando há gastos, estimado sinalizado quando não; custo por visita; deals e orçamentos", () => {
    const [a] = resumoViagensMes({
      rotas: [
        { ...base, id: "r1", vendedor_id: "v1", status: "concluida", data_inicio: "2026-11-04", data_fim: "2026-11-06", custo_total_est: 1000,
          paradas: [{ tipo: "visita", visitada: true }, { tipo: "visita", visitada: false }, { tipo: "pernoite", visitada: null }] },
        { ...base, id: "r2", vendedor_id: "v1", status: "aprovada", data_inicio: "2026-11-06", data_fim: "2026-11-06", custo_total_est: 400,
          paradas: [{ tipo: "prospeccao", visitada: true }] },
        { ...base, id: "r3", vendedor_id: "v1", status: "cancelada", data_inicio: "2026-11-10", data_fim: "2026-11-10", custo_total_est: 999, paradas: [] },
      ],
      gastos: [{ rota_id: "r1", valor: 700 }, { rota_id: "r1", valor: 100 }],
      dealsAvancados: [{ usuario_id: "v1", oportunidade_id: "o1" }, { usuario_id: "v1", oportunidade_id: "o1" }, { usuario_id: "v1", oportunidade_id: "o2" }, { usuario_id: "x", oportunidade_id: "o3" }],
      orcamentos: [{ user_id: "v1" }, { user_id: "v1" }, { user_id: null }],
    });
    expect(a).toMatchObject({ vendedor_id: "v1", viagens: 2, dias: 3, visitasFeitas: 2, visitasPlanejadas: 3, investido: 1200, investidoEstimado: true, custoPorVisita: 600, dealsAvancados: 2, orcamentos: 2 });
  });
  it("sem visitas feitas não divide por zero", () => {
    const [a] = resumoViagensMes({ rotas: [{ ...base, id: "r", vendedor_id: "v", status: "aprovada", data_inicio: "2026-11-04", data_fim: "2026-11-04", custo_total_est: 100, paradas: [{ tipo: "visita", visitada: null }] }], gastos: [], dealsAvancados: [], orcamentos: [] });
    expect(a.custoPorVisita).toBeNull();
  });
});

describe("utilitários", () => {
  it("foto reduzida a 1600 px no lado maior, sem ampliar", () => {
    expect(dimensoesReduzidas(4000, 3000)).toEqual({ w: 1600, h: 1200 });
    expect(dimensoesReduzidas(3000, 4000)).toEqual({ w: 1200, h: 1600 });
    expect(dimensoesReduzidas(800, 600)).toEqual({ w: 800, h: 600 });
  });
  it("há quanto tempo", () => {
    const agora = new Date("2026-11-04T15:00:00Z");
    expect(haQuantoTempo("2026-11-04T14:45:00Z", agora)).toBe("há 15 min");
    expect(haQuantoTempo("2026-11-04T12:00:00Z", agora)).toBe("há 3 h");
    expect(haQuantoTempo("2026-11-03T15:00:00Z", agora)).toBe("há 1 dia");
  });
});
