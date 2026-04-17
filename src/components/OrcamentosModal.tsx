import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { OrcamentoParams, DescontoTipo } from "@/lib/orcamento";
import { Trash2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

interface OrcamentoRow {
  id: string;
  created_at: string;
  numero_orcamento: string | null;
  nome_cliente: string;
  contato_nome: string | null;
  cliente_endereco: string | null;
  cliente_telefone: string | null;
  cliente_cnpj: string | null;
  cliente_email: string | null;
  itens: any;
  subtotal: number;
  desconto_tipo: string;
  desconto_valor: number;
  frete: number;
  total: number;
  condicoes_pagamento: string | null;
  prazo_entrega: string | null;
  validade_dias: number | null;
  local_entrega: string | null;
  observacoes: string | null;
  status: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLoad: (params: OrcamentoParams, id: string) => void;
}

const statusLabels: Record<string, string> = {
  rascunho: "Rascunho",
  enviado: "Enviado",
  aprovado: "Aprovado",
  recusado: "Recusado",
};

const statusColors: Record<string, string> = {
  rascunho: "bg-muted text-muted-foreground",
  enviado: "bg-blue-100 text-blue-800",
  aprovado: "bg-green-100 text-green-800",
  recusado: "bg-red-100 text-red-800",
};

export default function OrcamentosModal({ open, onOpenChange, onLoad }: Props) {
  const [orcamentos, setOrcamentos] = useState<OrcamentoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) fetchOrcamentos();
  }, [open]);

  async function fetchOrcamentos() {
    setLoading(true);
    const { data, error } = await supabase
      .from("orcamentos")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      setOrcamentos((data as OrcamentoRow[]) || []);
    }
    setLoading(false);
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from("orcamentos").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Orçamento excluído" });
      setOrcamentos((prev) => prev.filter((p) => p.id !== id));
    }
  }

  function handleLoad(o: OrcamentoRow) {
    const params: OrcamentoParams = {
      numeroOrcamento: o.numero_orcamento || "",
      clientName: o.nome_cliente,
      contatoNome: o.contato_nome || "",
      clienteEndereco: o.cliente_endereco || "",
      clienteTelefone: o.cliente_telefone || "",
      clienteCnpj: o.cliente_cnpj || "",
      clienteEmail: o.cliente_email || "",
      itens: Array.isArray(o.itens) ? o.itens : [],
      descontoTipo: (o.desconto_tipo as DescontoTipo) || "percentual",
      descontoValor: Number(o.desconto_valor) || 0,
      frete: Number(o.frete) || 0,
      condicoesPagamento: o.condicoes_pagamento || "",
      prazoEntrega: o.prazo_entrega || "",
      validadeDias: o.validade_dias ?? 10,
      localEntrega: o.local_entrega || "",
      observacoes: o.observacoes || "",
      status: o.status || "rascunho",
    };
    onLoad(params, o.id);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Meus Orçamentos</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : orcamentos.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">Nenhum orçamento salvo ainda.</p>
        ) : (
          <div className="space-y-2">
            {orcamentos.map((o) => (
              <div key={o.id} className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => handleLoad(o)}>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">
                    {o.numero_orcamento ? `${o.numero_orcamento} · ` : ""}{o.nome_cliente || "Sem nome"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(o.created_at).toLocaleDateString("pt-BR")} · Total: {Number(o.total).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </p>
                </div>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[o.status || "rascunho"]}`}>
                  {statusLabels[o.status || "rascunho"]}
                </span>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="shrink-0" onClick={(e) => e.stopPropagation()}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Excluir orçamento?</AlertDialogTitle>
                      <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleDelete(o.id)}>Excluir</AlertDialogAction>
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
