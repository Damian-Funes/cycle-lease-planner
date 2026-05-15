import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, FileText, Loader2 } from "lucide-react";

const fmtBRL = (v: number | null | undefined) =>
  (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const STATUS_STYLES: Record<string, string> = {
  rascunho: "bg-gray-200 text-gray-800",
  enviada: "bg-blue-100 text-blue-800",
  aprovada: "bg-emerald-100 text-emerald-800",
  rejeitada: "bg-red-100 text-red-800",
};

export default function OrgPropostas({ organizacaoId }: { organizacaoId: string }) {
  const navigate = useNavigate();
  const { data = [], isLoading } = useQuery({
    queryKey: ["org-propostas", organizacaoId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("propostas")
        .select("id, numero_proposta, created_at, status, valor_projeto, total_10_anos")
        .eq("organizacao_id", organizacaoId)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <FileText className="w-4 h-4" /> Propostas SmartCycle ({data.length})
        </h3>
        <Button size="sm" className="gap-1" onClick={() => navigate(`/?organizacao=${organizacaoId}&novo=1`)}>
          <Plus className="w-4 h-4" /> Nova Proposta SmartCycle
        </Button>
      </div>
      {isLoading ? (
        <div className="py-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Número</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Valor projeto</TableHead>
              <TableHead className="text-right">Total 10 anos</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground text-sm">Nenhuma proposta</TableCell></TableRow>
            ) : data.map((p: any) => (
              <TableRow key={p.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/?load=${p.id}`)}>
                <TableCell className="font-medium">{p.numero_proposta || "—"}</TableCell>
                <TableCell className="text-sm">{new Date(p.created_at).toLocaleDateString("pt-BR")}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className={STATUS_STYLES[p.status] || ""}>{p.status}</Badge>
                </TableCell>
                <TableCell className="text-right text-sm">{fmtBRL(p.valor_projeto)}</TableCell>
                <TableCell className="text-right text-sm font-medium">{fmtBRL(p.total_10_anos)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}
