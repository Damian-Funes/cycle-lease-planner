// Decide para onde o botão "voltar" do topo do celular deve levar.
// "voltar" = existe histórico do próprio app (react-router guarda idx no state do histórico).
// "inicio" = chegou direto na tela, então a seta leva para a Home.
export type AcaoVoltar = "voltar" | "inicio";

export function acaoVoltar(state: unknown): AcaoVoltar {
  const idx = (state as { idx?: unknown } | null | undefined)?.idx;
  return typeof idx === "number" && idx > 0 ? "voltar" : "inicio";
}
