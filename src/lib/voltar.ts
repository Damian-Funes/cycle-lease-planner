// Decide para onde o botão "voltar" do topo do celular deve levar.
// "voltar" = existe histórico do próprio app para trás.
// "inicio" = chegou direto na tela, então a seta leva para a Home.
//
// Ordem de confiança:
// 1) idx do react-router no state do histórico (autoritativo: replace não aumenta idx);
// 2) key da rota (react-router usa "default" na primeira entrada da aba);
// 3) tamanho do histórico do navegador.
export type AcaoVoltar = "voltar" | "inicio";

export interface OpcoesVoltar {
  key?: string;
  historyLength?: number;
}

export function acaoVoltar(state: unknown, opts: OpcoesVoltar = {}): AcaoVoltar {
  const idx = (state as { idx?: unknown } | null | undefined)?.idx;
  if (typeof idx === "number") return idx > 0 ? "voltar" : "inicio";
  if (opts.key && opts.key !== "default") return "voltar";
  const n = opts.historyLength ?? (typeof window !== "undefined" ? window.history.length : 0);
  return n > 1 ? "voltar" : "inicio";
}
