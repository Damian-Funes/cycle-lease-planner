import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { envioAberto, textoVia } from "@/lib/multinacional";

export type Multinacional = { id: string; nome: string };

/** Lista de multinacionais (só id e nome) — todo vendedor aprovado enxerga. */
export function useListaMultinacionais(enabled = true) {
  return useQuery({
    queryKey: ["multinacionais-lista"],
    enabled,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("fn_multinacionais");
      if (error) throw error;
      return (data ?? []) as Multinacional[];
    },
  });
}

type EnvioVia = { oportunidade_id: string | null; numero_base: string; situacao: string; multinacional_id: string; orcamentos: { organizacao_id: string | null } | null };

/** "via BASF, CTVA" por negócio e por número+cliente final (envios abertos). */
export function useViaMultinacional() {
  const lista = useListaMultinacionais();
  return useQuery({
    queryKey: ["multinacionais-via", lista.data?.length ?? 0],
    enabled: lista.isSuccess,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const nomes = new Map((lista.data ?? []).map(m => [m.id, m.nome]));
      const { data, error } = await supabase.from("orcamento_envios")
        .select("oportunidade_id, numero_base, situacao, multinacional_id, orcamentos(organizacao_id)")
        .in("situacao", ["enviado", "negociando"]);
      if (error) return { porNegocio: new Map<string, string>(), porOrcamento: new Map<string, string>() };
      const neg = new Map<string, string[]>(), orc = new Map<string, string[]>();
      for (const e of (data ?? []) as unknown as EnvioVia[]) {
        if (!envioAberto(e.situacao)) continue;
        const nome = nomes.get(e.multinacional_id) ?? "";
        if (e.oportunidade_id) neg.set(e.oportunidade_id, [...(neg.get(e.oportunidade_id) ?? []), nome]);
        const k = `${e.numero_base}|${e.orcamentos?.organizacao_id ?? ""}`;
        orc.set(k, [...(orc.get(k) ?? []), nome]);
      }
      const via = (m: Map<string, string[]>) => new Map([...m].map(([k, v]) => [k, textoVia(v)]));
      return { porNegocio: via(neg), porOrcamento: via(orc) };
    },
  });
}
