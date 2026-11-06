import { supabase } from "@/integrations/supabase/client";

export const MOTIVOS_DESCARTE = [
  { value: "fechou", label: "Fechou" },
  { value: "nao_trata_semente", label: "Não trata semente" },
  { value: "duplicada", label: "Duplicada" },
  { value: "outro", label: "Outro" },
] as const;
export type MotivoDescarte = (typeof MOTIVOS_DESCARTE)[number]["value"];

export const rotuloDescarte = (m?: string | null) => MOTIVOS_DESCARTE.find((x) => x.value === m)?.label ?? m ?? "";

/** "Outro" exige explicação; os demais aceitam observação opcional. */
export function descarteValido(motivo: string | null | undefined, obs?: string | null) {
  if (!MOTIVOS_DESCARTE.some((m) => m.value === motivo)) return false;
  return motivo !== "outro" || (obs ?? "").trim().length >= 3;
}

const amigavel = (e: any) => {
  const msg = String(e?.message ?? "");
  return /does not exist|Could not find the function/i.test(msg)
    ? new Error("Recurso ainda não ativado no banco (aguardando aprovação da migração).")
    : new Error(msg || "Não foi possível salvar.");
};

export async function descartarOrganizacao(id: string, motivo: MotivoDescarte, obs?: string) {
  if (!descarteValido(motivo, obs)) throw new Error(motivo === "outro" ? "Explique o motivo." : "Escolha o motivo.");
  const { data, error } = await (supabase as any).rpc("fn_organizacao_descartar", { p_org: id, p_motivo: motivo, p_obs: obs?.trim() || null });
  if (error) throw amigavel(error);
  return data;
}

export async function reabrirOrganizacao(id: string) {
  const { error } = await (supabase as any).rpc("fn_organizacao_reabrir", { p_org: id });
  if (error) throw amigavel(error);
}
