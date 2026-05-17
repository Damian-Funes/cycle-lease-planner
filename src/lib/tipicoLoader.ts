import { supabase } from "@/integrations/supabase/client";
import { Tipico, TipicoTipo } from "@/lib/tipicos";
import { Equipamento, ItemProjeto } from "@/lib/equipamentos";
import { ItemOrcamento } from "@/lib/orcamento";

interface Resolved {
  tipico: Tipico;
  encontrados: Equipamento[];
  naoEncontrados: string[];
}

export async function carregarTipico(
  id: string,
  tipoEsperado: TipicoTipo
): Promise<Resolved | { error: string }> {
  const { data: t, error } = await supabase.from("tipicos").select("*").eq("id", id).maybeSingle();
  if (error) return { error: error.message };
  if (!t) return { error: "Típico não encontrado" };
  const tipico = t as Tipico;
  if (tipico.tipo !== tipoEsperado) {
    return { error: `Este típico é de ${tipico.tipo}, não pode ser usado aqui` };
  }
  if (tipico.codigos.length === 0) {
    return { tipico, encontrados: [], naoEncontrados: [] };
  }
  const { data: eqs, error: e2 } = await supabase
    .from("equipamentos")
    .select("*")
    .in("codigo", tipico.codigos)
    .eq("ativo", true);
  if (e2) return { error: e2.message };
  const encontrados = (eqs ?? []) as Equipamento[];
  const setCods = new Set(encontrados.map((e) => e.codigo));
  const naoEncontrados = tipico.codigos.filter((c) => !setCods.has(c));
  return { tipico, encontrados, naoEncontrados };
}

export function tipicoParaItensProjeto(eqs: Equipamento[]): ItemProjeto[] {
  return eqs.map((eq) => ({
    equipamento_id: eq.id,
    codigo: eq.codigo,
    descricao: eq.descricao,
    valor_custo: eq.valor_custo,
    valor_venda: eq.valor_venda ?? null,
    quantidade: 1,
    subtotal: eq.valor_custo,
  }));
}

export function tipicoParaItensOrcamento(eqs: Equipamento[]): ItemOrcamento[] {
  return eqs.map((eq) => ({
    equipamento_id: eq.id,
    codigo: eq.codigo,
    descricao: eq.descricao,
    valor_unitario: Number(eq.valor_venda ?? eq.valor_custo ?? 0),
    quantidade: 1,
  }));
}
