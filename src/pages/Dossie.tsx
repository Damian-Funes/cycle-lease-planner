import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

/**
 * Rota legada /dossie/:clienteId.
 * Resolve o id antigo via migracao_clientes_log e redireciona
 * para /organizacoes/:organizacao_id.
 * Se o param já for uma organização válida, redireciona direto.
 * Será removida na Fase 6.
 */
export default function Dossie() {
  const { clienteId } = useParams<{ clienteId: string }>();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["dossie-redirect", clienteId],
    enabled: !!clienteId,
    queryFn: async () => {
      const { data: log } = await (supabase as any)
        .from("migracao_clientes_log")
        .select("organizacao_id")
        .eq("cliente_id", clienteId)
        .maybeSingle();
      if (log?.organizacao_id) return log.organizacao_id as string;
      // fallback: assume que o param já é uma organização
      const { data: org } = await (supabase as any)
        .from("organizacoes").select("id").eq("id", clienteId).maybeSingle();
      return org?.id ?? null;
    },
  });

  useEffect(() => {
    if (!isLoading) {
      if (data) navigate(`/organizacoes/${data}`, { replace: true });
      else navigate("/organizacoes", { replace: true });
    }
  }, [data, isLoading, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
    </div>
  );
}
