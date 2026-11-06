import { describe, expect, it } from "vitest";
import { resultadoValido, diasUteisEntre, empurrando, escalada, percentualNoPrazo, textoValido, vencidaAntesDeHoje } from "./atividadesAcoes";

describe("cobrança de atividades", () => {
  it("conta só segunda a sexta", () => {
    // sex 06/11/2026 -> qua 11/11/2026: seg, ter, qua
    expect(diasUteisEntre(new Date(2026, 10, 6), new Date(2026, 10, 11))).toBe(3);
  });
  it("escala para admin só com MAIS de 3 dias úteis", () => {
    expect(escalada(new Date(2026, 10, 6), new Date(2026, 10, 11))).toBe(false);
    expect(escalada(new Date(2026, 10, 6), new Date(2026, 10, 12))).toBe(true);
  });
  it("empurrando a partir de 3 reagendamentos", () => {
    expect(empurrando(2)).toBe(false);
    expect(empurrando(3)).toBe(true);
  });
  it("motivo/resultado obrigatório", () => {
    expect(textoValido("  ")).toBe(false);
    expect(textoValido("ok")).toBe(false);
    expect(textoValido("feito")).toBe(true);
  });
  it("aviso de abertura só a partir do dia seguinte ao vencimento", () => {
    const agora = new Date(2026, 10, 6, 15);
    expect(vencidaAntesDeHoje(new Date(2026, 10, 6, 9).toISOString(), agora)).toBe(false);
    expect(vencidaAntesDeHoje(new Date(2026, 10, 5, 18).toISOString(), agora)).toBe(true);
  });
  it("resultado do Feito exige 10 caracteres", () => {
    expect(resultadoValido("ok feito")).toBe(false);
    expect(resultadoValido("cliente pediu proposta")).toBe(true);
  });
  it("% no prazo", () => {
    expect(percentualNoPrazo(3, 4)).toBe(75);
    expect(percentualNoPrazo(0, 0)).toBeNull();
  });
});
