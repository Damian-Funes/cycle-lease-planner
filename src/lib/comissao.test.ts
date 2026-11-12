import { describe, it, expect } from "vitest";
import { alternarClienteAntigo, comissaoSobreCusto, resumoComissao, ultimasVersoes, type OrcamentoComissao } from "./comissao";
const agora = new Date("2026-11-12T12:00:00Z");
const o = (p: Partial<OrcamentoComissao>): OrcamentoComissao => ({ id: Math.random().toString(), numero: "ORC2026-001-V1", cliente: "X", venda: 100000, status: "enviado", atualizado_em: "2026-11-10T00:00:00Z", vendedor_id: "v", organizacao_id: "org", recorrente: false, seminovo: false, valor: 4000, ...p });

describe("comissão sobre o custo (regras do CEO)", () => {
  it("4% do custo por padrão", () => expect(comissaoSobreCusto(100000, { recorrente: false })).toBe(4000));
  it("cliente antigo ganha 5% do custo", () => expect(comissaoSobreCusto(100000, { recorrente: true })).toBe(5000));
  it("seminovo fica desligado: continua 4%", () => expect(comissaoSobreCusto(100000, { recorrente: false, seminovo: true })).toBe(4000));
  it("seminovo ligado no futuro paga 2%", () => expect(comissaoSobreCusto(100000, { recorrente: true, seminovo: true }, true)).toBe(2000));
  it("marcar/desmarcar cliente antigo preserva as outras tags", () => {
    expect(alternarClienteAntigo(["Parceiro"], true)).toEqual(["Parceiro", "cliente_antigo"]);
    expect(alternarClienteAntigo(["Parceiro", "cliente_antigo"], false)).toEqual(["Parceiro"]);
  });
  it("São Francisco: cada orçamento conta, somando as 5 comissões", () => {
    const sf = [["ORC2026-064-V7", 58294.51], ["ORC2026-065-V3", 84866.16], ["ORC2026-066", 2354.42], ["ORC2026-072", 73081.73], ["ORC2026-073", 63913.54]]
      .map(([numero, valor]) => o({ numero: numero as string, valor: valor as number, organizacao_id: "sf" }));
    const r = resumoComissao(sf, agora);
    expect(r.qtdAbertos).toBe(5);
    expect(Math.round(r.emJogo * 100) / 100).toBe(282510.36);
  });
  it("ORC2026-059 com 3 clientes gera 3 linhas: BASF=V7, CTVA=V5, Priori=V8", () => {
    const l = [1, 2, 3, 4, 6, 7].map(v => o({ numero: `ORC2026-059-V${v}`, organizacao_id: "basf", atualizado_em: `2026-09-${10 + v}T00:00:00Z` }))
      .concat(o({ numero: "ORC2026-059-V5", organizacao_id: "ctva", atualizado_em: "2026-09-21T00:00:00Z" }),
        o({ numero: "ORC2026-059-V8", organizacao_id: "priori", atualizado_em: "2026-10-09T00:00:00Z" }));
    expect(ultimasVersoes(l).map(x => x.numero).sort()).toEqual(["ORC2026-059-V5", "ORC2026-059-V7", "ORC2026-059-V8"]);
  });
  it("sem organização: mesmo número + nome + vendedor junta versões; vendedor diferente separa", () => {
    const l = [o({ numero: "ORC-9-V1", organizacao_id: null, cliente: "Agro Sul" }), o({ numero: "ORC-9-V2", organizacao_id: null, cliente: "agro  sul", atualizado_em: "2026-11-11T00:00:00Z" }),
      o({ numero: "ORC-9-V3", organizacao_id: null, cliente: "Agro Sul", vendedor_id: "outro" })];
    expect(ultimasVersoes(l).map(x => x.numero).sort()).toEqual(["ORC-9-V2", "ORC-9-V3"]);
  });
  it("itens avulsos/sem custo somam no aviso do admin", () =>
    expect(resumoComissao([o({ itens_sem_custo: 1 }), o({ numero: "ORC-2", itens_sem_custo: 2 })], agora).itensSemCusto).toBe(3));
  it("aberto parado há mais de 90 dias não entra no em jogo", () =>
    expect(resumoComissao([o({ atualizado_em: "2026-07-01T00:00:00Z" })], agora).emJogo).toBe(0));
  it("ganho do ano conta como garantido e não como em jogo", () => {
    const r = resumoComissao([o({ status: "aprovado" }), o({ status: "aprovado", numero: "ORC2025-9-V1", atualizado_em: "2025-12-01T00:00:00Z" })], agora);
    expect([r.garantidoAno, r.emJogo]).toEqual([4000, 0]);
  });
});

import { lerFiltro, resumoFiltrado, FILTRO_PADRAO } from "./comissao";
import { ehServico, itensSemCusto } from "./itensSemCusto";
const f = (p: Partial<typeof FILTRO_PADRAO>) => ({ ...FILTRO_PADRAO, ...p });
describe("filtros da página de comissões", () => {
  const l = [o({ numero: "ORC-1", cliente: "Sementes Aurora", valor: 1000 }), o({ numero: "ORC-2", cliente: "BASF", valor: 2000, vendedor_id: "m" }),
    o({ numero: "ORC-3", status: "aprovado", valor: 500, atualizado_em: "2026-03-01T00:00:00Z" }), o({ numero: "ORC-4", valor: 700, atualizado_em: "2025-05-01T00:00:00Z" })];
  it("busca por cliente sem acento muda o em jogo", () => expect(resumoFiltrado(l, f({ busca: "aurora" }), agora).emJogo).toBe(1000));
  it("busca por número", () => expect(resumoFiltrado(l, f({ busca: "orc-2" }), agora).linhas.map(x => x.numero)).toEqual(["ORC-2"]));
  it("vendedor filtra os totais", () => expect(resumoFiltrado(l, f({ vendedor: "m" }), agora).emJogo).toBe(2000));
  it("Ganhos zera o em jogo e este ano traz o ganho de março", () => {
    const r = resumoFiltrado(l, f({ status: "ganhos", periodo: "ano" }), agora);
    expect([r.emJogo, r.garantido]).toEqual([0, 500]);
  });
  it("90 dias corta o ganho de março; tudo traz o aberto de 2025", () => {
    expect(resumoFiltrado(l, f({ status: "todos" }), agora).garantido).toBe(0);
    expect(resumoFiltrado(l, f({ periodo: "tudo" }), agora).emJogo).toBe(3700);
  });
  it("filtro salvo inválido volta ao padrão", () => {
    expect(lerFiltro("{quebrado")).toEqual(FILTRO_PADRAO);
    expect(lerFiltro(JSON.stringify({ status: "x", periodo: "ano" })).periodo).toBe("ano");
  });
});
describe("itens sem custo", () => {
  it("palavras de serviço do CEO (com acento) viram Serviços/frete", () => {
    expect(["FRETE", "MÃO DE OBRA", "DESMONTAGEM", "MUNCK", "Locação de guindaste", "REVISÃO"].every(t => ehServico(t))).toBe(true);
    expect(ehServico("CAIXA DE RECEBIMENTO 1.6 TN-LSB130")).toBe(false);
  });
  it("avulso conta, item do cadastro não; agrupa e ordena por nº de orçamentos", () => {
    const cad = "11111111-1111-1111-1111-111111111111";
    const r = itensSemCusto([
      { id: "a", numero: "ORC2026-059-V4", itens: [{ equipamento_id: "avulso-1789604717466", descricao: "CAIXA DE RECEBIMENTO 1.6 TN-LSB130", codigo: "CAIXA - 1.6TN LSB130" }, { equipamento_id: cad, descricao: "X" }] },
      { id: "b", numero: "ORC-2", itens: [{ equipamento_id: "avulso-2", descricao: "MUNCK", codigo: "120398" }, { equipamento_id: "avulso-3", descricao: "MUNCK", codigo: "120398" }] },
      { id: "c", numero: "ORC-3", itens: [{ equipamento_id: "avulso-4", descricao: "MUNCK", codigo: "120398" }] },
    ], new Set([cad]));
    expect(r.map(i => [i.descricao, i.orcamentos.length, i.servico])).toEqual([["MUNCK", 2, true], ["CAIXA DE RECEBIMENTO 1.6 TN-LSB130", 1, false]]);
  });
});
