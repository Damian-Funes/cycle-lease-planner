import { describe, it, expect } from "vitest";
import { normalizarHora, validarConfigJulia } from "./juliaConfigValidacao";

const perfis = [
  { user_id: "a", nome: "Flávio", celular: "+5544991498825" },
  { user_id: "b", nome: "Renan", celular: "+5544998600660" },
];

describe("config da Júlia", () => {
  it("normaliza hora do iPhone com segundos", () => expect(normalizarHora("16:00:00")).toBe("16:00"));
  it("aceita 15:50 e 21:59", () => {
    expect(validarConfigJulia("15:50", perfis, {}).erros).toEqual([]);
    expect(validarConfigJulia("21:59", perfis, {}).erros).toEqual([]);
  });
  it("recusa 15:49 e 22:00", () => {
    expect(validarConfigJulia("15:49", perfis, {}).erros.length).toBe(1);
    expect(validarConfigJulia("22:00", perfis, {}).erros.length).toBe(1);
  });
  it("nomeia o vendedor com celular inválido", () => {
    expect(validarConfigJulia("16:00", perfis, { b: "123" }).erros).toEqual(["Celular inválido: Renan."]);
  });
  it("só grava celulares alterados", () => {
    const r = validarConfigJulia("16:00", perfis, { a: "+5544991498825", b: "(44) 99999-0000" });
    expect(r.celularesAlterados).toEqual([{ user_id: "b", celular: "+5544999990000" }]);
  });
});
