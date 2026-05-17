import { supabase } from "@/integrations/supabase/client";

export interface ContidoRow {
  equipamento_pai_id: string;
  equipamento_filho_id: string;
}

/** Carrega todos os pares pai→filho. */
export async function listContidos(): Promise<ContidoRow[]> {
  const { data, error } = await supabase
    .from("equipamento_contidos")
    .select("equipamento_pai_id, equipamento_filho_id");
  if (error) throw error;
  return (data ?? []) as ContidoRow[];
}

/** Mapa pai → filhos. */
export function buildPaiParaFilhos(pares: ContidoRow[]): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  for (const p of pares) {
    if (!m.has(p.equipamento_pai_id)) m.set(p.equipamento_pai_id, new Set());
    m.get(p.equipamento_pai_id)!.add(p.equipamento_filho_id);
  }
  return m;
}

/** Mapa filho → pais (para mensagens "está contido em…"). */
export function buildFilhoParaPais(pares: ContidoRow[]): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  for (const p of pares) {
    if (!m.has(p.equipamento_filho_id)) m.set(p.equipamento_filho_id, new Set());
    m.get(p.equipamento_filho_id)!.add(p.equipamento_pai_id);
  }
  return m;
}

/**
 * Dado o conjunto de equipamento_ids presentes no layout e os pares pai→filho,
 * retorna o conjunto de equipamento_ids que devem ser ocultados (filhos cujos pais
 * estão presentes).
 */
export function calcularOcultos(
  presentes: Iterable<string>,
  paiParaFilhos: Map<string, Set<string>>,
): Set<string> {
  const ocultos = new Set<string>();
  const presentesSet = new Set(presentes);
  for (const pai of presentesSet) {
    const filhos = paiParaFilhos.get(pai);
    if (!filhos) continue;
    for (const f of filhos) ocultos.add(f);
  }
  return ocultos;
}
