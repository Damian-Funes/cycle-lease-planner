import { describe, expect, it } from "vitest";
import { avaliarIncompletude, temAlgumProblema, telefoneValido } from "@/hooks/useOrganizacoesIncompletas";
import { descarteValido } from "@/lib/organizacaoDescarte";
import { montarPendencias, pendenciasNotificaveis } from "@/lib/pendenciasDia";

const base = { cidade: "Ijuí", estado: "RS", estado_id: "x", responsavel_id: "u", email_principal: null, telefone_principal: "5533331111" };

describe("regra única de organização completa", () => {
  it("e-mail não conta e telefone da empresa sem pessoa não completa", () => {
    expect(temAlgumProblema(avaliarIncompletude(base, 0))).toBe(true);
    expect(temAlgumProblema(avaliarIncompletude(base, 1))).toBe(false);
  });
  it("exige cidade + UF e responsável", () => {
    expect(avaliarIncompletude({ ...base, estado: null, estado_id: null }, 1).semCidadeEstado).toBe(true);
    expect(avaliarIncompletude({ ...base, responsavel_id: null }, 1).semResponsavel).toBe(true);
  });
  it("telefone precisa de DDD", () => {
    expect(telefoneValido("9999-1111")).toBe(false);
    expect(telefoneValido("(55) 99999-1111")).toBe(true);
  });
});

describe("descarte", () => {
  it("motivo obrigatório; 'outro' exige explicação", () => {
    expect(descarteValido("", "")).toBe(false);
    expect(descarteValido("fechou")).toBe(true);
    expect(descarteValido("outro", "")).toBe(false);
    expect(descarteValido("outro", "virou revenda de adubo")).toBe(true);
  });
});

describe("pendência opcional de organização incompleta", () => {
  const ctx = { id: "r", data_inicio: "2026-11-05", data_fim: "2026-11-07", paradas: [], pernoites: [{ id: "p", noite: "2026-11-06", tipo: "sem_custo", gasto_id: null }], gastos: [] };
  const oi = { organizacao_id: "o1", nome: "Coopatrigo", falta: ["contato"], motivo: "mesma cidade da parada X" };
  it("aparece só quando informada e não vira notificação", () => {
    const itens = montarPendencias(ctx, "2026-11-06", { completo: true, organizacaoIncompleta: oi });
    expect(itens.filter((i) => i.tipo === "organizacao_incompleta")).toHaveLength(1);
    expect(pendenciasNotificaveis(ctx, "2026-11-06").some((i) => i.tipo === "organizacao_incompleta")).toBe(false);
  });
  it("não aparece no fechamento do dia (não bloqueia)", () => {
    expect(montarPendencias(ctx, "2026-11-06", { organizacaoIncompleta: oi })).toHaveLength(0);
  });
});
