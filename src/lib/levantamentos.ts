import { supabase } from "@/integrations/supabase/client";

export type CampoAtual = { valor: string | number | null; data: string; autor_id: string | null; motivo?: string | null };
export type SituacaoAtual = {
  organizacao_id: string;
  sacos_safra: CampoAtual | null;
  equipamento_atual: CampoAtual | null;
  decisores: CampoAtual | null;
  interesse: CampoAtual | null;
  concorrente: CampoAtual | null;
  problema_principal: CampoAtual | null;
  ultima_visita: { data: string; autor_id: string | null; rota_id: string | null } | null;
};
export type Levantamento = {
  id: string; origem: string; rota_id: string | null; autor_id: string | null; data_visita: string;
  resultado: string | null; contato_nome: string | null; contato_cargo: string | null; decisores: string | null;
  sacos_safra: number | null; equipamento_atual: string | null; problema_principal: string | null;
  interesse: string | null; motivo_interesse: string | null; objecoes: string[] | null; concorrente: string | null;
  proximo_passo: string | null; proximo_passo_data: string | null; created_at: string;
};

// New objects may not be in generated types yet.
const db = supabase as unknown as { from: (t: string) => any };

/** "2026-11-05" → "05/11" */
export function dataCurta(iso: string | null | undefined): string {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}` : "";
}

export function informadoPor(campo: { data: string; autor_id: string | null } | null, nomes: Record<string, string>): string {
  if (!campo) return "";
  const autor = campo.autor_id ? nomes[campo.autor_id] ?? "vendedor" : "sistema";
  return `informado por ${autor} em ${dataCurta(campo.data)}`;
}

export async function situacaoAtual(organizacaoId: string): Promise<SituacaoAtual | null> {
  const { data, error } = await db.from("organizacao_situacao_atual").select("*").eq("organizacao_id", organizacaoId).maybeSingle();
  if (error) throw error;
  return data as SituacaoAtual | null;
}

export async function historicoLevantamentos(organizacaoId: string): Promise<Levantamento[]> {
  const { data, error } = await db.from("organizacao_levantamentos").select("*")
    .eq("organizacao_id", organizacaoId)
    .order("data_visita", { ascending: false }).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Levantamento[];
}

export async function nomesAutores(ids: string[]): Promise<Record<string, string>> {
  const unicos = [...new Set(ids.filter(Boolean))];
  if (!unicos.length) return {};
  const { data } = await supabase.from("profiles").select("user_id,nome").in("user_id", unicos);
  return Object.fromEntries((data ?? []).map((p: { user_id: string; nome: string | null }) => [p.user_id, p.nome ?? "vendedor"]));
}
