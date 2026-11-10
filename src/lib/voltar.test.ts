import { describe, expect, it } from "vitest";
import { acaoVoltar } from "./voltar";

describe("acaoVoltar", () => {
  it("volta para a página anterior quando há histórico do app", () => {
    expect(acaoVoltar({ idx: 1, usr: "x" })).toBe("voltar");
    expect(acaoVoltar({ idx: 7 })).toBe("voltar");
  });

  it("vai para o início quando a tela foi aberta direto", () => {
    expect(acaoVoltar({ idx: 0 })).toBe("inicio");
    expect(acaoVoltar(null)).toBe("inicio");
    expect(acaoVoltar(undefined)).toBe("inicio");
    expect(acaoVoltar({})).toBe("inicio");
    expect(acaoVoltar({ idx: "2" })).toBe("inicio");
    expect(acaoVoltar({ idx: -1 })).toBe("inicio");
  });
});
