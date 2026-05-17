import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tipico, TipicoInput, TipicoTipo } from "@/lib/tipicos";

interface ListOpts {
  tipo?: TipicoTipo | "todos";
  incluirArquivados?: boolean;
  busca?: string;
}

export function useTipicos(opts: ListOpts = {}) {
  return useQuery({
    queryKey: ["tipicos", opts],
    queryFn: async () => {
      let q = supabase.from("tipicos").select("*").order("destacado", { ascending: false }).order("nome");
      if (!opts.incluirArquivados) q = q.eq("arquivado", false);
      if (opts.tipo && opts.tipo !== "todos") q = q.eq("tipo", opts.tipo);
      const { data, error } = await q;
      if (error) throw error;
      let rows = (data ?? []).map((r: any) => ({
        ...r,
        itens: Array.isArray(r.itens) ? r.itens : [],
      })) as Tipico[];
      if (opts.busca) {
        const b = opts.busca.toLowerCase();
        rows = rows.filter(
          (t) =>
            t.nome.toLowerCase().includes(b) ||
            t.descricao?.toLowerCase().includes(b) ||
            t.itens.some((i) => i.codigo.toLowerCase().includes(b))
        );
      }
      return rows;
    },
  });
}

export function useTipico(id: string | null) {
  return useQuery({
    queryKey: ["tipico", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("tipicos").select("*").eq("id", id!).maybeSingle();
      if (error) throw error;
      return data as Tipico | null;
    },
  });
}

export function useCreateTipico() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: TipicoInput) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("tipicos")
        .insert({ ...input, created_by: user?.id ?? null })
        .select()
        .single();
      if (error) throw error;
      return data as Tipico;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tipicos"] }),
  });
}

export function useUpdateTipico() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<TipicoInput> & { arquivado?: boolean } }) => {
      // Whitelist de campos editáveis. Qualquer outro (tipo, id, created_by, created_at, updated_at) é descartado.
      const allowed = ["nome", "descricao", "itens", "capacidade_sacos_ano", "valor_referencia", "destacado", "arquivado"] as const;
      const clean: Record<string, any> = {};
      for (const k of allowed) {
        if (k in patch) clean[k] = (patch as any)[k];
      }
      const { data, error } = await supabase.from("tipicos").update(clean).eq("id", id).select().single();
      if (error) throw error;
      return data as Tipico;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["tipicos"] });
      qc.invalidateQueries({ queryKey: ["tipico", vars.id] });
    },
  });
}
