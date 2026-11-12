import { describe, it, expect } from "vitest";
import { comissao, resumoComissao, type OrcamentoComissao } from "./comissao";
const agora = new Date("2026-11-12T12:00:00Z");
const o = (p: Partial<OrcamentoComissao>): OrcamentoComissao => ({ id: Math.random().toString(), numero: "ORC2026-001-V1", cliente: "X", venda: 100000, status: "enviado", atualizado_em: "2026-11-10T00:00:00Z", vendedor_id: "v", recorrente: false, seminovo: false, ...p });

describe("comissão (regras do CEO)", () => {
  it("cliente novo ganha 4%", () => expect(comissao(o({}))).toBe(4000));
  it("cliente recorrente ganha 5%", () => expect(comissao(o({ recorrente: true }))).toBe(5000));
  it("seminovo ganha 2%, mesmo para recorrente", () => expect(comissao(o({ seminovo: true, recorrente: true }))).toBe(2000));
  it("só a última versão de cada orçamento entra no em jogo", () => {
    const r = resumoComissao([o({ numero: "ORC2026-082-V3", atualizado_em: "2026-11-01T00:00:00Z" }), o({ numero: "ORC2026-082-V4", venda: 200000 })], agora);
    expect(r.emJogo).toBe(8000);
  });
  it("aberto parado há mais de 90 dias não entra no em jogo", () =>
    expect(resumoComissao([o({ atualizado_em: "2026-07-01T00:00:00Z" })], agora).emJogo).toBe(0));
  it("ganho do ano conta como garantido e não como em jogo", () => {
    const r = resumoComissao([o({ status: "aprovado" }), o({ status: "aprovado", numero: "ORC2025-9-V1", atualizado_em: "2025-12-01T00:00:00Z" })], agora);
    expect([r.garantidoAno, r.emJogo]).toEqual([4000, 0]);
  });
});
