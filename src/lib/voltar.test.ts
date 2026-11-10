import { describe, expect, it } from "vitest";
import { acaoVoltar } from "./voltar";

describe("acaoVoltar", () => {
  it("volta para a página anterior quando há histórico do app", () => {
    expect(acaoVoltar({ idx: 1, usr: "x" })).toBe("voltar");
    expect(acaoVoltar({ idx: 7 })).toBe("voltar");
  });

  it("vai para o início quando a tela foi aberta direto", () => {
    expect(acaoVoltar({ idx: 0 })).toBe("inicio");
    expect(acaoVoltar({ idx: 0 }, { key: "abc", historyLength: 5 })).toBe("inicio");
  });

  it("usa a key da rota quando o histórico não traz idx", () => {
    expect(acaoVoltar(null, { key: "k1" })).toBe("voltar");
    expect(acaoVoltar(null, { key: "default", historyLength: 1 })).toBe("inicio");
  });

  it("cai no tamanho do histórico quando não há idx nem key útil", () => {
    expect(acaoVoltar(undefined, { key: "default", historyLength: 3 })).toBe("voltar");
    expect(acaoVoltar({}, { historyLength: 1 })).toBe("inicio");
    expect(acaoVoltar({ idx: "2" }, { key: "default", historyLength: 1 })).toBe("inicio");
  });
});
