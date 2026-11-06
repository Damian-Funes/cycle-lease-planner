import { describe, it, expect } from "vitest";
import { filtrarOrganizacoes, pontuarOrganizacao } from "./buscaOrganizacao";

const orgs = [
  { nome: "Sementes São Francisco – Patos de Minas", cidade: "Patos de Minas", uf: "MG", cnpj: null },
  { nome: "Cotripal Agropecuária", cidade: "Panambi", uf: "RS", cnpj: "12.345.678/0001-90" },
  { nome: "Coopercampos", nome_fantasia: "Cooper", cidade: "Campos Novos", uf: "SC" },
  { nome: "Agro Semente Boa", cidade: "Rio Verde", uf: "GO" },
  { nome: "Fazenda XYZ", nome_fantasia: "Sementes Costa Beber", cidade: "Cruz Alta" },
];
const nomes = (t: string) => filtrarOrganizacoes(orgs, t).map((o) => o.nome);

describe("buscaOrganizacao", () => {
  it("'sementes' e 'semente' acham as Sementes (inclusive pelo nome fantasia)", () => {
    expect(nomes("sementes")).toEqual(expect.arrayContaining(["Sementes São Francisco – Patos de Minas", "Fazenda XYZ", "Agro Semente Boa"]));
    expect(nomes("semente")).toContain("Sementes São Francisco – Patos de Minas");
  });
  it("palavras em qualquer ordem, sem acento", () => {
    expect(nomes("sao francisco patos")[0]).toBe("Sementes São Francisco – Patos de Minas");
  });
  it("parcial via contém", () => expect(nomes("coper")).toContain("Coopercampos"));
  it("erros de digitação", () => {
    expect(nomes("cotrpal")).toEqual(["Cotripal Agropecuária"]);
    expect(nomes("semntes")).toContain("Sementes São Francisco – Patos de Minas");
  });
  it("CNPJ só por dígitos", () => {
    expect(nomes("12345678")).toEqual(["Cotripal Agropecuária"]);
    expect(nomes("12.345.678/0001-90")).toEqual(["Cotripal Agropecuária"]);
  });
  it("cidade e UF", () => expect(nomes("panambi rs")).toEqual(["Cotripal Agropecuária"]));
  it("toda palavra precisa casar", () => expect(nomes("cotripal minas")).toEqual([]));
  it("exato/prefixo vem antes de aproximado", () => {
    expect(pontuarOrganizacao(orgs[1], "cotripal")).toBeGreaterThan(pontuarOrganizacao(orgs[1], "cotrpal"));
  });
  it("palavra curta não aceita erro", () => expect(nomes("xyy")).toEqual([]));
});
