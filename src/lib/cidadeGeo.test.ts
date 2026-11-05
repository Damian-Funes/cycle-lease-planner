import { describe, it, expect } from "vitest";
import { extrairCidadeUf, cidadeDeResultados, separarCidadeUfTexto, normalizarUf, siglaDoTexto } from "./cidadeGeo";

const comp = (long: string, short: string, ...types: string[]) => ({ long_name: long, short_name: short, types });

describe("extração de cidade/UF", () => {
  it("geocoder: locality + UF short_name", () => {
    expect(extrairCidadeUf([
      comp("Avenida Brasil", "Av. Brasil", "route"),
      comp("Maringá", "Maringá", "locality", "political"),
      comp("Paraná", "PR", "administrative_area_level_1", "political"),
    ])).toEqual({ cidade: "Maringá", uf: "PR" });
  });
  it("cidade com hífen não é cortada", () => {
    expect(extrairCidadeUf([
      comp("Não-Me-Toque", "Não-Me-Toque", "administrative_area_level_2", "political"),
      comp("Rio Grande do Sul", "RS", "administrative_area_level_1"),
    ])).toEqual({ cidade: "Não-Me-Toque", uf: "RS" });
  });
  it("Places New (longText/shortText)", () => {
    expect(extrairCidadeUf([
      { longText: "Formosa", shortText: "Formosa", types: ["locality"] },
      { longText: "Goiás", shortText: "GO", types: ["administrative_area_level_1"] },
    ])).toEqual({ cidade: "Formosa", uf: "GO" });
  });
  it("sem cidade → null; UF inválida vira vazia", () => {
    expect(extrairCidadeUf([comp("Brasil", "BR", "country")])).toBeNull();
    expect(extrairCidadeUf([comp("X", "X", "locality"), comp("Estado", "Estado", "administrative_area_level_1")])).toEqual({ cidade: "X", uf: "" });
  });
  it("pega o primeiro resultado com cidade", () => {
    expect(cidadeDeResultados([{ address_components: [comp("Brasil", "BR", "country")] },
      { address_components: [comp("Passo Fundo", "Passo Fundo", "locality"), comp("Rio Grande do Sul", "RS", "administrative_area_level_1")] }]))
      .toEqual({ cidade: "Passo Fundo", uf: "RS" });
  });
});

describe("texto cidade/UF", () => {
  it("Não-Me-Toque - RS", () => expect(separarCidadeUfTexto("Não-Me-Toque - RS")).toEqual({ cidade: "Não-Me-Toque", uf: "RS" }));
  it("Não-Me-Toque, RS", () => expect(separarCidadeUfTexto("Não-Me-Toque, RS")).toEqual({ cidade: "Não-Me-Toque", uf: "RS" }));
  it("sem UF mantém hífen", () => expect(separarCidadeUfTexto("Não-Me-Toque")).toEqual({ cidade: "Não-Me-Toque", uf: "" }));
  it("UF normalizada", () => { expect(normalizarUf("r s1")).toBe("RS"); expect(normalizarUf("paraná")).toBe("PA"); expect(normalizarUf(null)).toBe(""); });
  it("sigla do secundário", () => expect(siglaDoTexto("RS, Brasil")).toBe("RS"));
});
