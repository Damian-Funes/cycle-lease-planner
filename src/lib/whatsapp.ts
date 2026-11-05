export type MetaResposta = { ok: boolean; status?: number; body?: any };
export type Resultado = { ok: true; texto: string } | { ok: false; texto: string; codigo?: string };

const STATUS: Record<string, string> = { CONNECTED: "Conectado", DISCONNECTED: "Desconectado", PENDING: "Pendente", FLAGGED: "Sinalizado", RESTRICTED: "Restrito", BANNED: "Banido" };
const VERIF: Record<string, string> = { VERIFIED: "Verificado", NOT_VERIFIED: "Não verificado", EXPIRED: "Expirado" };

export const traduzStatus = (s?: string) => (s ? STATUS[s] ?? s : "—");
export const traduzVerificacao = (s?: string) => (s ? VERIF[s] ?? s : "—");

/** Extrai a mensagem de erro da Meta (error_user_title/msg, ou message) e o código. */
export function erroMeta(r: unknown): { texto: string; codigo?: string } {
  const body: any = (r as any)?.body ?? r;
  const e = body?.error;
  if (e && typeof e === "object") {
    const partes = [e.error_user_title, e.error_user_msg].filter(Boolean);
    const texto = partes.length ? partes.join(": ") : e.message || "Erro da Meta.";
    const codigo = [e.code, e.error_subcode].filter((x) => x != null).join("/") || undefined;
    return { texto, codigo };
  }
  if (typeof e === "string") return { texto: e };
  if (typeof body === "string" && body) return { texto: body };
  return { texto: "Erro desconhecido." };
}

/** Texto legível do health_status da Meta, se houver problemas. */
export function textoSaude(h: any): string | null {
  if (!h) return null;
  const linhas: string[] = [];
  if (h.can_send_message) linhas.push(`Pode enviar mensagens: ${h.can_send_message}`);
  for (const ent of h.entities ?? []) {
    for (const err of ent.errors ?? []) {
      linhas.push(`${ent.entity_type ?? ""}: ${err.error_description ?? ""}${err.possible_solution ? ` — ${err.possible_solution}` : ""}`.trim());
    }
  }
  return linhas.length ? linhas.join("\n") : null;
}
