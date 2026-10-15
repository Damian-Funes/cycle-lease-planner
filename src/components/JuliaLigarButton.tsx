import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Phone, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { mensagemErroJulia } from "@/lib/julia";

export default function JuliaLigarButton({ orcamentoId, status }: { orcamentoId: string | null; status: string }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const contato = useQuery({
    queryKey: ["julia-contato", orcamentoId],
    enabled: !!orcamentoId && status === "enviado",
    retry: false,
    queryFn: async () => {
      if (!orcamentoId) throw new Error("Salve o orçamento antes de ligar.");
      const { data: budget, error } = await supabase.from("orcamentos").select("status, pessoa_contato_id").eq("id", orcamentoId).single();
      if (error) throw error;
      if (!budget.pessoa_contato_id) throw new Error("O orçamento salvo não possui uma pessoa de contato.");
      const { data: person, error: personError } = await supabase.from("pessoas").select("nome, telefone, celular, nao_ligar_bot").eq("id", budget.pessoa_contato_id).single();
      if (personError) throw personError;
      return { ...person, status: budget.status, numero: person.celular || person.telefone };
    },
  });
  if (status !== "enviado") return null;
  const aviso = !orcamentoId ? "Salve o orçamento antes de ligar." : contato.isLoading ? "Carregando contato..." : contato.error ? "Não foi possível verificar o contato. Tente novamente." : contato.data?.nao_ligar_bot ? "Este contato não autoriza ligações da Júlia." : contato.data?.status !== "enviado" ? "Salve o orçamento como enviado antes de ligar." : !contato.data.numero ? "Contato sem telefone cadastrado." : null;
  const iniciar = async () => {
    if (lock.current || !orcamentoId || aviso) return;
    lock.current = true;
    setPending(true);
    try {
      // Recheck the saved contact before placing a real call; never use unsaved form changes.
      const current = await contato.refetch();
      if (current.error) throw current.error;
      if (current.data?.nao_ligar_bot) throw new Error("Este contato não autoriza ligações da Júlia.");
      if (current.data?.status !== "enviado") throw new Error("O orçamento precisa estar salvo como enviado.");
      if (!current.data?.numero) throw new Error("Contato sem telefone cadastrado.");
      const { data, error } = await supabase.functions.invoke("julia-iniciar-ligacao", { body: { orcamento_id: orcamentoId } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data?.ok || !data?.ligacao_id) throw new Error("Não foi possível confirmar o início da ligação.");
      toast({ title: "Ligação iniciada com Júlia", description: "Acompanhe o andamento no histórico de ligações." });
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["ligacoes-julia"] });
    } catch (error) {
      toast({ title: "Não foi possível ligar", description: await mensagemErroJulia(error), variant: "destructive" });
    } finally { lock.current = false; setPending(false); }
  };
  return <div className="space-y-1">
    <Button size="sm" variant="outline" disabled={!!aviso || pending} onClick={() => { setOpen(true); void contato.refetch(); }} className="gap-2"><Phone className="w-4 h-4" /> Ligar com Júlia</Button>
    {aviso && <p className="text-xs text-muted-foreground max-w-64" role="status">{aviso}</p>}
    {contato.error && <Button variant="ghost" size="sm" onClick={() => void contato.refetch()}>Tentar novamente</Button>}
    <Dialog open={open} onOpenChange={(value) => { if (!pending) setOpen(value); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ligar com Júlia?</DialogTitle>
          <DialogDescription>A Júlia, assistente virtual, vai ligar para este contato para entender por que o orçamento não avançou.</DialogDescription>
        </DialogHeader>
        <dl className="text-sm space-y-2"><div><dt className="text-muted-foreground">Contato</dt><dd className="font-medium">{contato.data?.nome}</dd></div><div><dt className="text-muted-foreground">Telefone</dt><dd className="font-medium">{contato.data?.numero}</dd></div></dl>
        {aviso && <p role="alert" className="text-sm text-destructive">{aviso}</p>}
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={() => setOpen(false)}>Cancelar</Button>
          <Button disabled={pending || !!aviso || contato.isFetching} onClick={() => void iniciar()} className="gap-2">{pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Phone className="w-4 h-4" />} Confirmar ligação</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}