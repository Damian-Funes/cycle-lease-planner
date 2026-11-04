import { describe, expect, it } from "vitest";
import { assinaturaTrajeto, custoViagem, diasDaViagem, planoPorDia } from "./viagem";

const base = { lat: -23.4253, lng: -51.9386 };
const p = (id: string, dia: string, ordem: number, lat: number, lng: number, tipo = "visita", valor_diaria_est: number | null = null) =>
  ({ id, dia, ordem, tipo, latitude: lat, longitude: lng, valor_diaria_est });

describe("viagem de vários dias", () => {
  it("lista os dias do período", () => {
    expect(diasDaViagem("2026-11-10", "2026-11-12")).toEqual(["2026-11-10", "2026-11-11", "2026-11-12"]);
    expect(diasDaViagem("2026-11-10", null)).toEqual(["2026-11-10"]);
  });

  it("viagem de 1 dia: base → paradas → base", () => {
    const pl = planoPorDia(base, [p("a", "2026-11-10", 0, -24, -52), p("b", "2026-11-10", 1, -25, -53)], "2026-11-10", "2026-11-10");
    expect(pl).toHaveLength(1);
    expect(pl[0].waypoints.map((w) => w.id)).toEqual(["a", "b"]);
    expect(pl[0].destinoId).toBeNull();
  });

  it("pernoite fecha o dia e é a partida do dia seguinte", () => {
    const pl = planoPorDia(base, [
      p("a", "2026-11-10", 0, -24, -52),
      p("h", "2026-11-10", 5, -24.5, -52.5, "pernoite", 250),
      p("b", "2026-11-11", 0, -25, -53),
    ], "2026-11-10", "2026-11-11");
    expect(pl).toHaveLength(2);
    expect(pl[0].destinoId).toBe("h");
    expect(pl[0].waypoints.map((w) => w.id)).toEqual(["a"]);
    expect(pl[1].origemId).toBe("h");
    expect(pl[1].origem).toEqual({ lat: -24.5, lng: -52.5 });
    expect(pl[1].destinoId).toBeNull();
  });

  it("pernoite cadastrado antes das visitas continua sendo o fim do dia", () => {
    const pl = planoPorDia(base, [p("h", "2026-11-10", 0, -24.5, -52.5, "pernoite", 200), p("a", "2026-11-10", 1, -24, -52)], "2026-11-10", "2026-11-11");
    expect(pl[0].waypoints.map((w) => w.id)).toEqual(["a"]);
    expect(pl[0].destinoId).toBe("h");
  });

  it("custo: combustível S10 diesel, hospedagem e alimentação opcional", () => {
    const c = custoViagem({ km: 1150, consumoKmL: 11.5, precoLitro: 6.2, pedagio: 87.4, diarias: [250, 180], alimentacaoDia: null, dias: 3 });
    expect(c.litros).toBe(100);
    expect(c.combustivel).toBe(620);
    expect(c.hospedagem).toBe(430);
    expect(c.alimentacao).toBeNull();
    expect(c.total).toBe(1137.4);
    const com = custoViagem({ km: 1000, consumoKmL: 10, precoLitro: 6.3, pedagio: null, diarias: [], alimentacaoDia: 80, dias: 3 });
    expect(com.combustivel).toBe(630);
    expect(com.alimentacao).toBe(240);
    expect(com.total).toBe(870);
  });

  it("assinatura só muda quando o trajeto muda", () => {
    const a = [p("a", "2026-11-10", 0, -24, -52), p("b", "2026-11-10", 1, -25, -53)];
    const s1 = assinaturaTrajeto(base, a, "2026-11-10");
    expect(assinaturaTrajeto(base, a.map((x) => ({ ...x, valor_diaria_est: 99 })), "2026-11-10")).toBe(s1);
    expect(assinaturaTrajeto(base, [a[1], { ...a[0], ordem: 2 }], "2026-11-10")).not.toBe(s1);
  });
});

import { parseValorBR } from "./viagem";
describe("valor digitado", () => {
  it("aceita formato brasileiro", () => {
    expect(parseValorBR("1.250,50")).toBe(1250.5);
    expect(parseValorBR("250")).toBe(250);
    expect(Number.isNaN(parseValorBR(""))).toBe(true);
  });
});
