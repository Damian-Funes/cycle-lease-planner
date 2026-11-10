import { describe, expect, it } from "vitest";
import { montarPendencias, dataExtenso } from "../../supabase/functions/_shared/pendenciasDia";
import { contarTentativas, tituloFechou, tituloNaoFechou, pendenciasFechamento, textoFalta } from "../../supabase/functions/_shared/fechamentoDia";
import { diasAtrasados } from "../../supabase/functions/_shared/variaveisLigacao";

// Caso do Renan: viagem 08–13/11, só pernoite de 09/11, nenhuma visita no domingo.
const base = {
  id: "r1", data_inicio: "2026-11-08", data_fim: "2026-11-13", gastos: [],
  paradas: [{ id: "p1", visitada: true, dia: "2026-11-09", organizacao_id: "o1", organizacao: { nome: "Cocari" } }],
  pernoites: [{ id: "n9", noite: "2026-11-09", tipo: "sem_custo", gasto_id: null, cidade: "Cascavel" }],
};

describe("dias anteriores da viagem", () => {
  it("data em texto", () => expect(dataExtenso("2026-11-08")).toBe("domingo, 08/11"));
  it("cobra domingo (dia e noite) antes de hoje", () => {
    const p = montarPendencias({ ...base, dias_sem_visita: [] }, "2026-11-10");
    expect(p.map(x => `${x.tipo}:${x.id}`)).toEqual(["dia_sem_registro:2026-11-08", "pernoite_noite:2026-11-08", "pernoite_noite:2026-11-10"]);
  });
  it("dia marcado sem visita deixa de ser cobrado", () => {
    const p = montarPendencias({ ...base, dias_sem_visita: [{ dia: "2026-11-08" }] }, "2026-11-10");
    expect(p.map(x => x.tipo + ":" + x.id)).toEqual(["pernoite_noite:2026-11-08", "pernoite_noite:2026-11-10"]);
  });
  it("antes da migração (sem dias_sem_visita) só cobra hoje", () => {
    expect(montarPendencias(base, "2026-11-10").map(x => x.id)).toEqual(["2026-11-10"]);
  });
  it("no máximo 3 dias antigos por ligação", () => {
    const p = montarPendencias({ ...base, paradas: [], pernoites: [], dias_sem_visita: [] }, "2026-11-13");
    expect([...new Set(p.filter(x => x.id < "2026-11-13").map(x => x.id))]).toEqual(["2026-11-08", "2026-11-09", "2026-11-10"]);
  });
  it("variável dias_atrasados", () => {
    expect(diasAtrasados(montarPendencias({ ...base, dias_sem_visita: [] }, "2026-11-10"), "2026-11-10")).toBe("domingo, 08/11");
  });
});

describe("avisos de fechamento", () => {
  it("fechou o dia com visitas e pernoite", () => {
    const rota = { ...base, dias_sem_visita: [{ dia: "2026-11-08" }], pernoites: [...base.pernoites, { id: "n8", noite: "2026-11-08", tipo: "voltou_base", gasto_id: null }] };
    expect(pendenciasFechamento(rota, "2026-11-09")).toEqual([]);
    expect(tituloFechou("Renan", rota, "2026-11-09")).toBe("✓ Renan fechou o dia: 1 visita (Cocari), pernoite em Cascavel");
  });
  it("tentativas contam só ligações reais", () => {
    const t = contarTentativas([{ status: "nao_atendeu" }, { status: "interrompida" }, { status: "nao_atendeu" }, { status: "cancelada" }, { status: "concluida", teste: true }]);
    expect(t).toEqual({ total: 3, naoAtendidas: 2, caidas: 1 });
    const pend = montarPendencias({ ...base, dias_sem_visita: [] }, "2026-11-10");
    expect(tituloNaoFechou("Flávio", pend, t)).toBe(`✗ Flávio não fechou o dia, falta: ${textoFalta(pend)} · tentativas: 3 ligações, 2 não atendidas, 1 caídas`);
    expect(textoFalta(pend)).toBe("visitas de domingo, 08/11, onde dormiu (domingo, 08/11) e onde dormiu (terça, 10/11)");
  });
});
