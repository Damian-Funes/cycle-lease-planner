import { describe, expect, it } from "vitest";
import { chanceJulia, foiAtendida, indicadoresJulia, mensagemErroJulia, motivoJulia, transcricaoJulia, type LigacaoJulia } from "./julia";

describe("Júlia frontend contract", () => {
  it("renders readable reason and chance labels", () => {
    expect(motivoJulia("condicao_pagamento")).toBe("Condição de pagamento");
    expect(motivoJulia(null)).toBe("Não informado");
    expect(chanceJulia("media")).toBe("Média");
  });
  it("does not count the text 'nao' as answered", () => {
    expect(foiAtendida("nao")).toBe(false);
    expect(foiAtendida("false")).toBe(false);
    expect(foiAtendida(null)).toBe(false);
    expect(foiAtendida("sim")).toBe(true);
    expect(foiAtendida(true)).toBe(true);
  });
  it("parses JSON transcript and preserves client side and timestamps", () => {
    expect(transcricaoJulia([{ quem: "Júlia", texto: "Olá", seg: 1 }, { quem: "Cliente", texto: "Oi", seg: 3 }, null, { quem: "cliente" }])).toEqual([
      { cliente: false, texto: "Olá", seg: 1 }, { cliente: true, texto: "Oi", seg: 3 },
    ]);
    expect(transcricaoJulia({})).toEqual([]);
  });
  it("shows the Portuguese edge-function error for 4xx responses", async () => {
    const error = Object.assign(new Error("Edge Function returned a non-2xx status code"), { context: new Response(JSON.stringify({ error: "Este contato não autoriza ligações." }), { status: 403 }) });
    expect(await mensagemErroJulia(error)).toBe("Este contato não autoriza ligações.");
  });
  it("handles error payloads, transport failures and empty stats", async () => {
    expect(await mensagemErroJulia(new Error("Telefone inválido"))).toBe("Telefone inválido");
    expect(indicadoresJulia([])).toEqual({ total: 0, atendidas: 0, chances: 0 });
    const rows = [{ atendeu: "sim", chance_reabrir: "alta" }, { atendeu: "nao", chance_reabrir: "media" }] as LigacaoJulia[];
    expect(indicadoresJulia(rows)).toEqual({ total: 2, atendidas: 50, chances: 2 });
  });
});