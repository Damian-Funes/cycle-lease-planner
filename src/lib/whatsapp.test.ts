import { describe, it, expect } from "vitest";
import { erroMeta, traduzStatus, traduzVerificacao } from "./whatsapp";

describe("whatsapp", () => {
  it("traduz status e verificação", () => {
    expect(traduzStatus("DISCONNECTED")).toBe("Desconectado");
    expect(traduzStatus("CONNECTED")).toBe("Conectado");
    expect(traduzVerificacao("NOT_VERIFIED")).toBe("Não verificado");
    expect(traduzVerificacao("VERIFIED")).toBe("Verificado");
  });
  it("usa error_user_title + error_user_msg e código", () => {
    const r = { ok: false, body: { error: { message: "x", code: 136024, error_subcode: 2388091, error_user_title: "Título", error_user_msg: "Detalhe" } } };
    expect(erroMeta(r)).toEqual({ texto: "Título: Detalhe", codigo: "136024/2388091" });
  });
  it("cai para message", () => {
    expect(erroMeta({ body: { error: { message: "Invalid", code: 100 } } })).toEqual({ texto: "Invalid", codigo: "100" });
  });
});
