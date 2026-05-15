import { supabase } from "@/integrations/supabase/client";

/**
 * Cria uma oportunidade automaticamente no funil informado, na primeira etapa,
 * vinculada à organização. Retorna o id da oportunidade criada (ou null em erro).
 */
export async function criarOportunidadeAuto(opts: {
  pipelineNome: "SmartCycle" | "Reforma" | "Orçamentos";
  organizacaoId: string;
  titulo: string;
  valor: number;
}): Promise<string | null> {
  // 1) pipeline
  const { data: pipe } = await supabase
    .from("pipelines")
    .select("id")
    .eq("nome", opts.pipelineNome)
    .eq("ativo", true)
    .order("ordem", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!pipe?.id) return null;

  // 2) primeira etapa
  const { data: etapa } = await supabase
    .from("etapas_pipeline")
    .select("id, probabilidade_default")
    .eq("pipeline_id", pipe.id)
    .order("ordem", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!etapa?.id) return null;

  // 3) cria oportunidade
  const { data: opp, error } = await supabase
    .from("oportunidades")
    .insert({
      titulo: opts.titulo,
      organizacao_id: opts.organizacaoId,
      pipeline_id: pipe.id,
      etapa_id: etapa.id,
      valor_estimado: opts.valor || 0,
      probabilidade: etapa.probabilidade_default ?? 50,
      status: "aberta",
    } as any)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[criarOportunidadeAuto] erro:", error);
    return null;
  }
  return opp?.id ?? null;
}
