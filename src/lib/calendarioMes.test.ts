import { describe, expect, it } from "vitest";
import { format } from "date-fns";
import { corCalendario, gradeMes, limparTitulo, pilulasVisiveis, rotuloPilula } from "./calendarioMes";

describe("gradeMes", () => {
  it("novembro/2026: 42 dias, começa no domingo 01/11 e termina 12/12", () => {
    const g = gradeMes(new Date(2026, 10, 15));
    expect(g).toHaveLength(42);
    expect(format(g[0], "yyyy-MM-dd")).toBe("2026-11-01");
    expect(g[0].getDay()).toBe(0);
    expect(format(g[41], "yyyy-MM-dd")).toBe("2026-12-12");
  });
  it("dezembro/2026 começa no domingo 29/11", () => {
    expect(format(gradeMes(new Date(2026, 11, 1))[0], "yyyy-MM-dd")).toBe("2026-11-29");
  });
});

describe("texto da pílula", () => {
  it("usa a empresa quando existe", () => {
    expect(rotuloPilula("WhatsApp para o Rennan da Morena Sementes", "Morena Sementes")).toBe("Morena Sementes");
  });
  it("sem empresa, tira prefixos genéricos do começo", () => {
    expect(limparTitulo("Próximo passo: Ligação - retomar proposta")).toBe("retomar proposta");
    expect(limparTitulo("Próxima ação: confirmar data")).toBe("confirmar data");
    expect(limparTitulo("WhatsApp - enviar catálogo")).toBe("enviar catálogo");
    expect(limparTitulo("Reunião - apresentação diretoria")).toBe("apresentação diretoria");
    expect(limparTitulo("Ligação para o Flávio")).toBe("Flávio");
  });
  it("não mexe em títulos sem separador nem esvazia o texto", () => {
    expect(limparTitulo("Visita técnica")).toBe("Visita técnica");
    expect(limparTitulo("Reunião final")).toBe("Reunião final");
    expect(limparTitulo("Ligação -")).toBe("Ligação -");
  });
});

describe("cores no calendário do celular", () => {
  it("vermelho e rosa não se confundem com atrasada", () => {
    expect(corCalendario("#ef4444")).toBe("#f97316");
    expect(corCalendario("#ec4899")).toBe("#8b5cf6");
  });
  it("demais cores ficam iguais", () => {
    expect(corCalendario("#22c55e")).toBe("#22c55e");
    expect(corCalendario("#3b82f6")).toBe("#3b82f6");
    expect(corCalendario(null)).toBe("#64748b");
  });
});

describe("pílulas por dia", () => {
  it("até 4 pílulas antes do +N numa célula alta", () => {
    expect(pilulasVisiveis(122, 9)).toEqual({ visiveis: 4, extra: 5 });
    expect(pilulasVisiveis(122, 4)).toEqual({ visiveis: 4, extra: 0 });
  });
  it("célula baixa mostra menos", () => {
    expect(pilulasVisiveis(80, 5)).toEqual({ visiveis: 2, extra: 3 });
  });
  it("antes de medir mostra 3", () => {
    expect(pilulasVisiveis(0, 5)).toEqual({ visiveis: 3, extra: 2 });
  });
});
