import { describe, expect, it } from "vitest";
import { agruparParados, cabecalhoEnvio, dataCobrancaPadrao, envioAberto, nomeCurto, textoVia, type LinhaParada } from "./multinacional";

const l = (p: Partial<LinhaParada>): LinhaParada => ({
  envio_id: "e", oportunidade_id: "op1", titulo: "Orçamento ORC2026-059", responsavel_id: "u", numero_base: "ORC2026-059",
  multinacional: "BASF AGRICULTURAL SOLUTIONS BRASIL LTDA", cliente_final: "Priori Sementes", situacao: "enviado",
  cobrar_em: null, multinacional_desde: null, dias_desde_envio: 0, dias_parado: 0, ...p,
});

describe("multinacionais", () => {
  it("cobrança padrão é +60 dias", () => {
    expect(dataCobrancaPadrao(new Date(2026, 10, 12))).toBe("2027-01-11");
  });
  it("só enviado e negociando contam como envio aberto", () => {
    expect(["enviado", "negociando", "venceu", "perdeu"].map(envioAberto)).toEqual([true, true, false, false]);
  });
  it("via mostra cada multinacional uma vez, com nome curto", () => {
    expect(nomeCurto("SYNGENTA PROTEÇÃO DE CULTIVOS LTDA")).toBe("Syngenta");
    expect(textoVia(["BASF AGRICULTURAL SOLUTIONS BRASIL LTDA", "CTVA PROTEÇÃO DE CULTIVOS LTDA", "BASF"])).toBe("via BASF, CTVA");
    expect(textoVia([])).toBe("");
  });
  it("PDF do envio é endereçado à multinacional citando o cliente final", () => {
    expect(cabecalhoEnvio("BASF Agricultural Solutions", "Sementes São Francisco", "Rio Verde", "GO").linha)
      .toBe("À BASF Agricultural Solutions — Projeto: Sementes São Francisco, Rio Verde/GO");
  });
  it("parados: um negócio por linha, com todas as multinacionais, do mais parado", () => {
    const g = agruparParados([
      l({ envio_id: "a", multinacional: "BASF", dias_parado: 40 }),
      l({ envio_id: "b", multinacional: "CTVA PROTEÇÃO", dias_parado: 10 }),
      l({ envio_id: "c", oportunidade_id: "op2", multinacional: "Syngenta", dias_parado: 25 }),
    ]);
    expect(g.map(x => [x.oportunidade_id, x.dias_parado, x.via])).toEqual([["op2", 25, "via Syngenta"], ["op1", 10, "via BASF, CTVA"]]);
    expect(g[1].envios.map(e => e.envio_id)).toEqual(["a", "b"]);
  });
});
