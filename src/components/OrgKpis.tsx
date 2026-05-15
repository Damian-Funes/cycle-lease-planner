import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

const fmtBRL = (v: number | null | undefined) =>
  (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function OrgKpis({ organizacaoId }: { organizacaoId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["org-kpis", organizacaoId],
    queryFn: async () => {
      const [props, orcs, orcsRef, ats] = await Promise.all([
        (supabase as any).from("propostas")
          .select("status, total_10_anos, updated_at")
          .eq("organizacao_id", organizacaoId),
        (supabase as any).from("orcamentos").select("updated_at").eq("organizacao_id", organizacaoId),
        (supabase as any).from("orcamentos_reforma").select("updated_at").eq("organizacao_id", organizacaoId),
        (supabase as any).from("atividades").select("updated_at").eq("organizacao_id", organizacaoId).order("updated_at", { ascending: false }).limit(1),
      ]);
      const propostas = (props.data ?? []) as any[];
      const ativas = propostas.filter((p) => ["rascunho", "enviada", "enviado"].includes(p.status)).length;
      const aprovadas = propostas.filter((p) => ["aprovada", "aprovado"].includes(p.status));
      const valorAprovado = aprovadas.reduce((s, p) => s + (Number(p.total_10_anos) || 0), 0);
      const datas = [
        ...propostas.map((p) => p.updated_at),
        ...((orcs.data ?? []) as any[]).map((o) => o.updated_at),
        ...((orcsRef.data ?? []) as any[]).map((o) => o.updated_at),
        ...((ats.data ?? []) as any[]).map((a) => a.updated_at),
      ].filter(Boolean).sort().reverse();
      return {
        ativas,
        aprovadas: aprovadas.length,
        valorAprovado,
        ultimaInteracao: datas[0] ? new Date(datas[0]) : null,
      };
    },
  });

  if (isLoading || !data) {
    return <Card className="p-4"><Loader2 className="w-4 h-4 animate-spin mx-auto" /></Card>;
  }

  return (
    <Card className="p-4 space-y-3">
      <h3 className="font-semibold text-sm">Resumo Comercial</h3>
      <Stat label="Propostas Ativas" value={String(data.ativas)} />
      <Stat label="Propostas Aprovadas" value={String(data.aprovadas)} />
      <Stat label="Valor Total Aprovado" value={fmtBRL(data.valorAprovado)} />
      <Stat label="Última Interação" value={data.ultimaInteracao ? data.ultimaInteracao.toLocaleDateString("pt-BR") : "—"} />
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-baseline border-b last:border-0 pb-2 last:pb-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold">{value}</span>
    </div>
  );
}
