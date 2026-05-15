import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Loader2 } from "lucide-react";

const fmtBRL = (v: number | null | undefined) =>
  (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const STATUS_STYLES: Record<string, string> = {
  rascunho: "bg-gray-200 text-gray-800",
  enviado: "bg-blue-100 text-blue-800",
  enviada: "bg-blue-100 text-blue-800",
  aprovado: "bg-emerald-100 text-emerald-800",
  aprovada: "bg-emerald-100 text-emerald-800",
};

function Lista({ tabela, organizacaoId, rotaEditar, rotaNovo }: {
  tabela: "orcamentos" | "orcamentos_reforma";
  organizacaoId: string;
  rotaEditar: (id: string) => string;
  rotaNovo: string;
}) {
  const navigate = useNavigate();
  const { data = [], isLoading } = useQuery({
    queryKey: ["org-orc", tabela, organizacaoId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from(tabela)
        .select("id, numero_orcamento, created_at, status, total")
        .eq("organizacao_id", organizacaoId)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" className="gap-1" onClick={() => navigate(rotaNovo)}>
          <Plus className="w-4 h-4" /> Novo orçamento
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
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground text-sm">Nenhum orçamento</TableCell></TableRow>
            ) : data.map((o: any) => (
              <TableRow key={o.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(rotaEditar(o.id))}>
                <TableCell className="font-medium">{o.numero_orcamento || "—"}</TableCell>
                <TableCell className="text-sm">{new Date(o.created_at).toLocaleDateString("pt-BR")}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className={STATUS_STYLES[o.status] || ""}>{o.status}</Badge>
                </TableCell>
                <TableCell className="text-right text-sm font-medium">{fmtBRL(o.total)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

export default function OrgOrcamentos({ organizacaoId }: { organizacaoId: string }) {
  return (
    <Card className="p-4">
      <Tabs defaultValue="venda">
        <TabsList>
          <TabsTrigger value="venda">Venda de Equipamentos</TabsTrigger>
          <TabsTrigger value="reforma">Reformas</TabsTrigger>
        </TabsList>
        <TabsContent value="venda" className="mt-4">
          <Lista
            tabela="orcamentos"
            organizacaoId={organizacaoId}
            rotaEditar={(id) => `/orcamento?load=${id}`}
            rotaNovo={`/orcamento?organizacao=${organizacaoId}&novo=1`}
          />
        </TabsContent>
        <TabsContent value="reforma" className="mt-4">
          <Lista
            tabela="orcamentos_reforma"
            organizacaoId={organizacaoId}
            rotaEditar={(id) => `/reforma?load=${id}`}
            rotaNovo={`/reforma?organizacao=${organizacaoId}&novo=1`}
          />
        </TabsContent>
      </Tabs>
    </Card>
  );
}
