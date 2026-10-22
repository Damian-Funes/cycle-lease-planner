import { describe, it, expect } from "vitest";
import { dataAtalho, tituloAutomatico } from "./atividadeRapida";

// Quinta, 22/10/2026 14:37 local
const agora = new Date(2026, 9, 22, 14, 37);

describe("atalhos de data", () => {
  it("Daqui 1h = próxima hora cheia", () => {
    expect(dataAtalho("1h", agora)).toEqual(new Date(2026, 9, 22, 15, 0));
  });
  it("Amanhã 9h", () => {
    expect(dataAtalho("amanha", agora)).toEqual(new Date(2026, 9, 23, 9, 0));
  });
  it("Em 3 dias às 9h", () => {
    expect(dataAtalho("3dias", agora)).toEqual(new Date(2026, 9, 25, 9, 0));
  });
  it("Próx. segunda às 9h", () => {
    expect(dataAtalho("segunda", agora)).toEqual(new Date(2026, 9, 26, 9, 0));
  });
  it("Em 1 semana às 9h", () => {
    expect(dataAtalho("semana", agora)).toEqual(new Date(2026, 9, 29, 9, 0));
  });
});

describe("título automático", () => {
  it("prioriza organização", () => {
    expect(tituloAutomatico("Ligação", { org: "Coop X", deal: "Deal Y", pessoa: "Ana" })).toBe("Ligação — Coop X");
  });
  it("usa deal, depois pessoa", () => {
    expect(tituloAutomatico("Ligação", { deal: "Deal Y", pessoa: "Ana" })).toBe("Ligação — Deal Y");
    expect(tituloAutomatico("Ligação", { pessoa: "Ana" })).toBe("Ligação — Ana");
  });
  it("só o tipo sem vínculo", () => {
    expect(tituloAutomatico("Nota", {})).toBe("Nota");
  });
});
