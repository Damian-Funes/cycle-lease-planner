import { supabase } from "@/integrations/supabase/client";
import { Tipico, TipicoItem, TipicoTipo } from "@/lib/tipicos";
import { Equipamento, ItemProjeto } from "@/lib/equipamentos";
import { ItemOrcamento } from "@/lib/orcamento";

export interface ResolvedItem {
  codigo: string;
  quantidade: number;
  equipamento: Equipamento | null;
}

interface Resolved {
  tipico: Tipico;
  resolvidos: ResolvedItem[];
  naoEncontrados: string[];
}

export async function carregarTipico(
  id: string,
  tipoEsperado: TipicoTipo
): Promise<Resolved | { error: string }> {
  const { data: t, error } = await supabase.from("tipicos").select("*").eq("id", id).maybeSingle();
  if (error) return { error: error.message };
  if (!t) return { error: "Típico não encontrado" };

  // Compat: itens pode vir como jsonb (array) ou ausente
  const rawItens = Array.isArray((t as any).itens) ? ((t as any).itens as TipicoItem[]) : [];
  const tipico: Tipico = { ...(t as any), itens: rawItens } as Tipico;

  if (tipico.tipo !== tipoEsperado) {
    return { error: `Este típico é de ${tipico.tipo}, não pode ser usado aqui` };
  }
  if (rawItens.length === 0) {
    return { tipico, resolvidos: [], naoEncontrados: [] };
  }

  const codigos = Array.from(new Set(rawItens.map((i) => i.codigo)));
  const { data: eqs, error: e2 } = await supabase
    .from("equipamentos")
    .select("*")
    .in("codigo", codigos)
    .eq("ativo", true);
  if (e2) return { error: e2.message };

  const mapaEq = new Map<string, Equipamento>();
  (eqs ?? []).forEach((eq) => mapaEq.set((eq as Equipamento).codigo, eq as Equipamento));

  const resolvidos: ResolvedItem[] = rawItens.map((it) => ({
    codigo: it.codigo,
    quantidade: it.quantidade,
    equipamento: mapaEq.get(it.codigo) ?? null,
  }));

  const naoEncontrados = resolvidos.filter((r) => !r.equipamento).map((r) => r.codigo);

  return { tipico, resolvidos, naoEncontrados };
}

export function tipicoParaItensProjeto(resolvidos: ResolvedItem[]): ItemProjeto[] {
  return resolvidos
    .filter((r) => r.equipamento)
    .map((r) => {
      const eq = r.equipamento!;
      return {
        equipamento_id: eq.id,
        codigo: eq.codigo,
        descricao: eq.descricao,
        valor_custo: eq.valor_custo,
        valor_venda: eq.valor_venda ?? null,
        quantidade: r.quantidade,
        subtotal: r.quantidade * Number(eq.valor_custo ?? 0),
      };
    });
}

export function tipicoParaItensOrcamento(resolvidos: ResolvedItem[]): ItemOrcamento[] {
  return resolvidos
    .filter((r) => r.equipamento)
    .map((r) => {
      const eq = r.equipamento!;
      return {
        equipamento_id: eq.id,
        codigo: eq.codigo,
        descricao: eq.descricao,
        valor_unitario: Number(eq.valor_venda ?? eq.valor_custo ?? 0),
        quantidade: r.quantidade,
      };
    });
}
