import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { LigacaoJulia } from "@/lib/julia";

export function useLigacoesJulia(scope?: { orcamentoId?: string; oportunidadeId?: string }) {
  return useQuery({
    queryKey: ["ligacoes-julia", scope?.orcamentoId ?? null, scope?.oportunidadeId ?? null],
    queryFn: async () => {
      // Page through all readable rows so Supabase's default limit never truncates the report.
      const rows: LigacaoJulia[] = [];
      for (let offset = 0; ; offset += 500) {
        let query = supabase.from("ligacoes_bot").select("*").order("created_at", { ascending: false }).order("id", { ascending: false });
        if (scope?.orcamentoId) query = query.eq("orcamento_id", scope.orcamentoId);
        if (scope?.oportunidadeId) query = query.eq("oportunidade_id", scope.oportunidadeId);
        const { data, error } = await query.range(offset, offset + 499);
        if (error) throw error;
        rows.push(...data);
        if (data.length < 500) break;
      }
      return rows;
    },
    retry: false,
    refetchInterval: (query) => query.state.data?.some((r) => r.status === "discando") ? 10_000 : false,
  });
}