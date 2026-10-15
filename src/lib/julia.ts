import type { Database, Json } from "@/integrations/supabase/types";

export type LigacaoJulia = Database["public"]["Tables"]["ligacoes_bot"]["Row"];
export const MOTIVOS_JULIA: Record<string, string> = {
  preco: "Preço", condicao_pagamento: "Condição de pagamento",
  concorrente: "Fechou com concorrente", timing_safra: "Timing / safra",
  orcamento_interno: "Orçamento interno", escopo_tecnico: "Escopo técnico",
  decisao_interna: "Decisão interna", nao_recebeu: "Não recebeu",
  desistiu_projeto: "Desistiu do projeto", outro: "Outro",
};
export const motivoJulia = (value: string | null) => value ? MOTIVOS_JULIA[value] ?? value.replace(/_/g, " ") : "Não informado";
export const statusJulia = (value: string) => ({ discando: "Discando", concluida: "Concluída", falhou: "Falhou" }[value] ?? value);
export const chanceJulia = (value: string | null) => ({ alta: "Alta", media: "Média", baixa: "Baixa", nenhuma: "Nenhuma" }[value ?? ""] ?? "Não informada");
// The existing database stores atendeu as text, not a boolean.
export function foiAtendida(value: string | boolean | null) {
  return value === true || (typeof value === "string" && ["sim", "true", "atendeu", "atendida"].includes(value.trim().toLowerCase()));
}
export function transcricaoJulia(value: Json | null) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item) || typeof item.texto !== "string") return [];
    const quem = typeof item.quem === "string" ? item.quem.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : "";
    return [{ texto: item.texto, cliente: ["cliente", "user", "humano", "customer"].includes(quem), seg: typeof item.seg === "number" ? item.seg : null }];
  });
}
export async function mensagemErroJulia(error: unknown): Promise<string> {
  const fallback = "Não foi possível iniciar a ligação. Tente novamente.";
  if (error && typeof error === "object" && "context" in error && error.context instanceof Response) {
    try {
      const body = await error.context.clone().json();
      if (typeof body.error === "string") return body.error;
      if (typeof body.message === "string") return body.message;
    } catch { /* Response may not contain JSON. */ }
  }
  return error instanceof Error ? error.message : fallback;
}
export function indicadoresJulia(rows: LigacaoJulia[]) {
  return {
    total: rows.length,
    atendidas: rows.length ? rows.filter((r) => foiAtendida(r.atendeu)).length / rows.length * 100 : 0,
    chances: rows.filter((r) => r.chance_reabrir === "alta" || r.chance_reabrir === "media").length,
  };
}