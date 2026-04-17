import { useEffect, useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { Trash2, Loader2, FileText, Receipt, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type TipoFiltro = "todas" | "aluguel" | "orcamento";

interface UnifiedRow {
  id: string;
  tipo: "aluguel" | "orcamento";
  numero: string | null;
  nome_cliente: string;
  total: number;
  status: string | null;
  created_at: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional: when provided and the user clicks an item of the SAME page type, load in-place instead of navigating. */
  onLoadAluguel?: (id: string) => void;
  onLoadOrcamento?: (id: string) => void;
}

const statusLabels: Record<string, string> = {
  rascunho: "Rascunho",
  enviado: "Enviado",
  enviada: "Enviada",
  aprovado: "Aprovado",
  aprovada: "Aprovada",
  recusado: "Recusado",
  recusada: "Recusada",
};

const statusColors: Record<string, string> = {
  rascunho: "bg-muted text-muted-foreground",
  enviado: "bg-blue-100 text-blue-800",
  enviada: "bg-blue-100 text-blue-800",
  aprovado: "bg-green-100 text-green-800",
  aprovada: "bg-green-100 text-green-800",
  recusado: "bg-red-100 text-red-800",
  recusada: "bg-red-100 text-red-800",
};

export default function PropostasUnificadasModal({
  open, onOpenChange, onLoadAluguel, onLoadOrcamento,
}: Props) {
  const [rows, setRows] = useState<UnifiedRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [filtro, setFiltro] = useState<TipoFiltro>("todas");
  const [busca, setBusca] = useState("");
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (open) fetchAll();
  }, [open]);

  async function fetchAll() {
    setLoading(true);
    const [{ data: prop, error: e1 }, { data: orc, error: e2 }] = await Promise.all([
      supabase.from("propostas").select("id, numero_proposta, nome_cliente, total_10_anos, status, created_at").order("created_at", { ascending: false }),
      supabase.from("orcamentos").select("id, numero_orcamento, nome_cliente, total, status, created_at").order("created_at", { ascending: false }),
    ]);
    if (e1 || e2) {
      toast({ title: "Erro", description: (e1 || e2)?.message, variant: "destructive" });
    }
    const list: UnifiedRow[] = [
      ...(prop || []).map((p: any) => ({
        id: p.id, tipo: "aluguel" as const, numero: p.numero_proposta,
        nome_cliente: p.nome_cliente, total: Number(p.total_10_anos) || 0,
        status: p.status, created_at: p.created_at,
      })),
      ...(orc || []).map((o: any) => ({
        id: o.id, tipo: "orcamento" as const, numero: o.numero_orcamento,
        nome_cliente: o.nome_cliente, total: Number(o.total) || 0,
        status: o.status, created_at: o.created_at,
      })),
    ].sort((a, b) => b.created_at.localeCompare(a.created_at));
    setRows(list);
    setLoading(false);
  }

  async function handleDelete(row: UnifiedRow) {
    const table = row.tipo === "aluguel" ? "propostas" : "orcamentos";
    const { error } = await supabase.from(table).delete().eq("id", row.id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Proposta excluída" });
      setRows((prev) => prev.filter((r) => r.id !== row.id));
    }
  }

  function handleClick(row: UnifiedRow) {
    onOpenChange(false);
    if (row.tipo === "aluguel") {
      if (onLoadAluguel) onLoadAluguel(row.id);
      else navigate(`/?load=${row.id}`);
    } else {
      if (onLoadOrcamento) onLoadOrcamento(row.id);
      else navigate(`/orcamento?load=${row.id}`);
    }
  }

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filtro !== "todas" && r.tipo !== filtro) return false;
      if (busca) {
        const q = busca.toLowerCase();
        return (r.nome_cliente || "").toLowerCase().includes(q) || (r.numero || "").toLowerCase().includes(q);
      }
      return true;
    });
  }, [rows, filtro, busca]);

  const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Minhas Propostas</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-3 flex-wrap">
          <Tabs value={filtro} onValueChange={(v) => setFiltro(v as TipoFiltro)}>
            <TabsList>
              <TabsTrigger value="todas">Todas</TabsTrigger>
              <TabsTrigger value="aluguel" className="gap-1"><FileText className="w-3 h-3" /> Aluguel</TabsTrigger>
              <TabsTrigger value="orcamento" className="gap-1"><Receipt className="w-3 h-3" /> Orçamento</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por cliente ou nº..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="h-9 pl-8 text-sm"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">Nenhuma proposta encontrada.</p>
        ) : (
          <div className="space-y-2">
            {filtered.map((r) => (
              <div
                key={`${r.tipo}-${r.id}`}
                className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                onClick={() => handleClick(r)}
              >
                <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${
                  r.tipo === "aluguel" ? "bg-primary/10 text-primary" : "bg-accent/30 text-accent-foreground"
                }`}>
                  {r.tipo === "aluguel" ? <FileText className="w-4 h-4" /> : <Receipt className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${
                      r.tipo === "aluguel" ? "bg-primary/15 text-primary" : "bg-amber-100 text-amber-800"
                    }`}>
                      {r.tipo === "aluguel" ? "Aluguel" : "Orçamento"}
                    </span>
                    <p className="font-medium text-sm truncate">
                      {r.numero ? `${r.numero} · ` : ""}{r.nome_cliente || "Sem nome"}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleDateString("pt-BR")} · {fmtBRL(r.total)}
                  </p>
                </div>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[r.status || "rascunho"] || statusColors.rascunho}`}>
                  {statusLabels[r.status || "rascunho"] || r.status}
                </span>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="shrink-0" onClick={(e) => e.stopPropagation()}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Excluir proposta?</AlertDialogTitle>
                      <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleDelete(r)}>Excluir</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
