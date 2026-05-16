import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useReadTables } from "@/lib/tables";
import { SmartCycleParams } from "@/lib/smartcycle";
import { Trash2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

interface PropostaRow {
  id: string;
  created_at: string;
  nome_cliente: string;
  valor_projeto: number;
  entrada: number;
  divida: number;
  tarifa_f1: number;
  tarifa_f2: number;
  tarifa_excedente: number;
  reajuste_anual: number;
  peso_saco: number;
  vol_min_f2_pct: number;
  volume_minimo_calculado: number;
  mensalidade_f1: number;
  mensalidade_f2: number;
  total_10_anos: number;
  status: string;
  observacoes: string | null;
  itens_projeto: any[] | null;
  contato_nome: string | null;
  cliente_endereco: string | null;
  cliente_telefone: string | null;
  cliente_cnpj: string | null;
  cliente_email: string | null;
  validade_dias: number | null;
  local_entrega: string | null;
  numero_proposta: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLoad: (params: SmartCycleParams, id: string) => void;
}

const statusLabels: Record<string, string> = {
  rascunho: "Rascunho",
  enviada: "Enviada",
  aprovada: "Aprovada",
  recusada: "Recusada",
};

const statusColors: Record<string, string> = {
  rascunho: "bg-muted text-muted-foreground",
  enviada: "bg-blue-100 text-blue-800",
  aprovada: "bg-green-100 text-green-800",
  recusada: "bg-red-100 text-red-800",
};

export default function PropostasModal({ open, onOpenChange, onLoad }: Props) {
  const [propostas, setPropostas] = useState<PropostaRow[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const tables = useReadTables();

  useEffect(() => {
    if (open) fetchPropostas();
  }, [open]);

  async function fetchPropostas() {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from(tables.propostas)
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      setPropostas((data as PropostaRow[]) || []);
    }
    setLoading(false);
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from("propostas").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Aluguel excluído" });
      setPropostas((prev) => prev.filter((p) => p.id !== id));
    }
  }

  function handleLoad(p: PropostaRow) {
    const params: SmartCycleParams = {
      clientName: p.nome_cliente,
      valorProjeto: Number(p.valor_projeto),
      entrada: Number(p.entrada),
      pesoPorSaco: Number(p.peso_saco),
      volumeMinF2Pct: Number(p.vol_min_f2_pct),
      tarifaF1: Number(p.tarifa_f1),
      tarifaF2: Number(p.tarifa_f2),
      tarifaExcedente: Number(p.tarifa_excedente),
      reajuste: Number(p.reajuste_anual),
      status: p.status || "rascunho",
      observacoes: p.observacoes || "",
      itensProjeto: Array.isArray(p.itens_projeto) ? p.itens_projeto : [],
      contatoNome: p.contato_nome || "",
      clienteEndereco: p.cliente_endereco || "",
      clienteTelefone: p.cliente_telefone || "",
      clienteCnpj: p.cliente_cnpj || "",
      clienteEmail: p.cliente_email || "",
      validadeDias: p.validade_dias ?? 10,
      localEntrega: p.local_entrega || "",
      numeroProposta: p.numero_proposta || "",
    };
    onLoad(params, p.id);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Meus Aluguéis</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : propostas.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">Nenhum aluguel salvo ainda.</p>
        ) : (
          <div className="space-y-2">
            {propostas.map((p) => (
              <div key={p.id} className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => handleLoad(p)}>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{p.nome_cliente || "Sem nome"}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(p.created_at).toLocaleDateString("pt-BR")} · Projeto: {Number(p.valor_projeto).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </p>
                </div>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[p.status || "rascunho"]}`}>
                  {statusLabels[p.status || "rascunho"]}
                </span>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="shrink-0" onClick={(e) => e.stopPropagation()}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Excluir aluguel?</AlertDialogTitle>
                      <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleDelete(p.id)}>Excluir</AlertDialogAction>
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
