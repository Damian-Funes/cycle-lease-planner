import { describe, it, expect } from "vitest";
import lista from "@/data/municipios.json";
import { buscarMunicipios, indexarMunicipios, normalizarBusca } from "./municipios";

const idx = indexarMunicipios(lista);

describe("busca de municípios IBGE", () => {
  it("lista completa", () => expect(lista.length).toBeGreaterThan(5500));
  it("sem diferenciar maiúsculas", () => {
    expect(buscarMunicipios(idx, "FREDERICO")[0]).toEqual({ n: "Frederico Westphalen", uf: "RS" });
  });
  it("sem acento e com hífen", () => {
    expect(normalizarBusca("Não-Me-Toque")).toBe("nao me toque");
    expect(buscarMunicipios(idx, "nao me toque")[0]).toEqual({ n: "Não-Me-Toque", uf: "RS" });
    expect(buscarMunicipios(idx, "não-me")[0]).toEqual({ n: "Não-Me-Toque", uf: "RS" });
  });
  it("prefixo vem antes de contém", () => {
    const r = buscarMunicipios(idx, "maringa");
    expect(r[0]).toEqual({ n: "Maringá", uf: "PR" });
  });
  it("UF da última parada desempata", () => {
    // "Bom Jesus" existe em várias UFs
    expect(buscarMunicipios(idx, "bom jesus", "RS")[0]).toEqual({ n: "Bom Jesus", uf: "RS" });
    expect(buscarMunicipios(idx, "bom jesus", "PI")[0]).toEqual({ n: "Bom Jesus", uf: "PI" });
  });
  it("prefixo vence UF preferida", () => {
    const r = buscarMunicipios(idx, "toledo", "RS");
    expect(r[0].n).toBe("Toledo");
  });
  it("máximo 8 e mínimo 2 caracteres", () => {
    expect(buscarMunicipios(idx, "sa").length).toBe(8);
    expect(buscarMunicipios(idx, "s")).toEqual([]);
  });
});
