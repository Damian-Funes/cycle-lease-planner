import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useReadTables } from "@/lib/tables";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Loader2 } from "lucide-react";
import NovaOportunidadeModal from "./NovaOportunidadeModal";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Tabela onde gravar o oportunidade_id */
  tabela: "propostas" | "orcamentos" | "orcamentos_reforma";
  registroId: string;
  organizacaoId: string;
  /** Sugestão de título para nova oportunidade */
  tituloSugerido?: string;
  /** Sugestão de valor estimado */
  valorSugerido?: number;
  onVinculado?: (oportunidadeId: string) => void;
}

export default function VincularOportunidadeModal({
  open, onOpenChange, tabela, registroId, organizacaoId,
  tituloSugerido, valorSugerido, onVinculado,
}: Props) {
  const qc = useQueryClient();
  const [oppSel, setOppSel] = useState("");
  const [novaOpen, setNovaOpen] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const tables = useReadTables();
  const isMkt = tables.oportunidades !== "oportunidades";

  const { data: oportunidades = [] } = useQuery({
    queryKey: ["opps-abertas", organizacaoId, isMkt],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from(tables.oportunidades)
        .select(isMkt ? "id, titulo, status" : "id, titulo, valor_estimado, status")
        .eq("organizacao_id", organizacaoId)
        .eq("status", "aberta")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: open && !!organizacaoId,
  });

  async function vincular(oppId: string) {
    setSalvando(true);
    const { error } = await (supabase as any)
      .from(tabela)
      .update({ oportunidade_id: oppId })
      .eq("id", registroId);
    setSalvando(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Vinculado à oportunidade");
    qc.invalidateQueries();
    onVinculado?.(oppId);
    onOpenChange(false);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Vincular ao CRM</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Oportunidades em aberto</label>
              <Select value={oppSel} onValueChange={setOppSel}>
                <SelectTrigger>
                  <SelectValue placeholder={oportunidades.length === 0 ? "Nenhuma oportunidade aberta" : "Selecione..."} />
                </SelectTrigger>
                <SelectContent>
                  {oportunidades.map((o: any) => (
                    <SelectItem key={o.id} value={o.id}>{o.titulo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" className="w-full gap-1" onClick={() => setNovaOpen(true)}>
              <Plus className="w-4 h-4" /> Criar nova oportunidade
            </Button>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button disabled={!oppSel || salvando} onClick={() => vincular(oppSel)}>
              {salvando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Vincular
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <NovaOportunidadeModal
        open={novaOpen}
        onOpenChange={setNovaOpen}
        defaultOrganizacaoId={organizacaoId}
        defaultTitulo={tituloSugerido}
        defaultValor={valorSugerido}
        onCreated={(id) => { setNovaOpen(false); vincular(id); }}
      />
    </>
  );
}
