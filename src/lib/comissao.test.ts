import { describe, it, expect } from "vitest";
import { alternarClienteAntigo, comissao, paraComissao, resumoComissao, vendaDe, type OrcamentoComissao } from "./comissao";
const agora = new Date("2026-11-12T12:00:00Z");
const o = (p: Partial<OrcamentoComissao>): OrcamentoComissao => ({ id: Math.random().toString(), numero: "ORC2026-001-V1", cliente: "X", venda: 100000, status: "enviado", atualizado_em: "2026-11-10T00:00:00Z", vendedor_id: "v", recorrente: false, seminovo: false, ...p });
const linha = { id: "1", numero_orcamento: "ORC2026-001-V1", nome_cliente: "X", subtotal: 100000, desconto_tipo: "percentual", desconto_valor: 0, status: "enviado", updated_at: "2026-11-10T00:00:00Z", responsavel_id: "v", organizacao_id: "org" };

describe("comissão (regras do CEO)", () => {
  it("todo mundo ganha 4% por padrão", () => expect(comissao(paraComissao(linha, null))).toBe(4000));
  it("cliente marcado como antigo ganha 5%", () => expect(comissao(paraComissao(linha, ["Parceiro", "cliente_antigo"]))).toBe(5000));
  it("seminovo fica desligado: continua 4%", () => expect(comissao(o({ seminovo: true }))).toBe(4000));
  it("seminovo ligado no futuro paga 2%", () => expect(comissao(o({ seminovo: true, recorrente: true }), true)).toBe(2000));
  it("venda é subtotal menos desconto percentual", () => expect(vendaDe({ subtotal: 100000, desconto_tipo: "percentual", desconto_valor: 2 })).toBe(98000));
  it("venda é subtotal menos desconto em valor", () => expect(vendaDe({ subtotal: 100000, desconto_tipo: "valor", desconto_valor: 5000 })).toBe(95000));
  it("marcar/desmarcar cliente antigo preserva as outras tags", () => {
    expect(alternarClienteAntigo(["Parceiro"], true)).toEqual(["Parceiro", "cliente_antigo"]);
    expect(alternarClienteAntigo(["Parceiro", "cliente_antigo"], false)).toEqual(["Parceiro"]);
    expect(alternarClienteAntigo(["cliente_antigo"], true)).toEqual(["cliente_antigo"]);
  });
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
