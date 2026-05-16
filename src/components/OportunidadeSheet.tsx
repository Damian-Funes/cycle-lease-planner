import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useReadTables } from "@/lib/tables";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ExternalLink, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  oportunidadeId: string | null;
}

const fmtBRL = (v: number | null | undefined) =>
  v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function OportunidadeSheet({ open, onOpenChange, oportunidadeId }: Props) {
  const qc = useQueryClient();
  const [form, setForm] = useState<any>(null);
  const tables = useReadTables();

  const { data: op, isLoading } = useQuery({
    queryKey: ["oportunidade", oportunidadeId, tables.oportunidades],
    queryFn: async () => {
      if (!oportunidadeId) return null;
      const { data, error } = await (supabase as any)
        .from(tables.oportunidades)
        .select("*, organizacoes(id, nome), etapas_pipeline(id, nome, cor)")
        .eq("id", oportunidadeId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!oportunidadeId && open,
  });

  const { data: etapas = [] } = useQuery({
    queryKey: ["etapas-pipeline"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("etapas_pipeline").select("*").order("ordem");
      return data ?? [];
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-approved"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, nome, email").eq("status", "approved");
      return data ?? [];
    },
  });

  useEffect(() => {
    if (op) setForm(op);
  }, [op]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        titulo: form.titulo,
        etapa_id: form.etapa_id,
        valor_estimado: form.valor_estimado != null && form.valor_estimado !== "" ? Number(form.valor_estimado) : null,
        probabilidade: Number(form.probabilidade),
        data_fechamento_prevista: form.data_fechamento_prevista || null,
        responsavel_id: form.responsavel_id || null,
        observacoes: form.observacoes || null,
        motivo_perda: form.motivo_perda || null,
      };
      const { error } = await (supabase as any).from("oportunidades").update(payload).eq("id", oportunidadeId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Oportunidade atualizada");
      qc.invalidateQueries({ queryKey: ["oportunidades"] });
      qc.invalidateQueries({ queryKey: ["oportunidade", oportunidadeId] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error("Erro", { description: e?.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("oportunidades").delete().eq("id", oportunidadeId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Oportunidade excluída");
      qc.invalidateQueries({ queryKey: ["oportunidades"] });
      onOpenChange(false);
    },
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Detalhes da Oportunidade</SheetTitle>
        </SheetHeader>

        {isLoading || !form ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-4 mt-4">
            <div className="text-sm">
              <Link
                to={`/organizacoes/${form.organizacao_id}`}
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                {form.organizacoes?.nome} <ExternalLink className="w-3 h-3" />
              </Link>
            </div>

            <div className="space-y-1">
              <Label>Título</Label>
              <Input value={form.titulo ?? ""} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Etapa</Label>
                <Select value={form.etapa_id} onValueChange={(v) => setForm({ ...form, etapa_id: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {etapas.map((e: any) => (
                      <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Responsável</Label>
                <Select
                  value={form.responsavel_id || "none"}
                  onValueChange={(v) => setForm({ ...form, responsavel_id: v === "none" ? null : v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem responsável</SelectItem>
                    {profiles.map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>{p.nome ?? p.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Valor estimado (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.valor_estimado ?? ""}
                  onChange={(e) => setForm({ ...form, valor_estimado: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">{fmtBRL(Number(form.valor_estimado) || 0)}</p>
              </div>
              <div className="space-y-1">
                <Label>Probabilidade (%)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={form.probabilidade ?? 50}
                  onChange={(e) => setForm({ ...form, probabilidade: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Data prevista de fechamento</Label>
              <Input
                type="date"
                value={form.data_fechamento_prevista ?? ""}
                onChange={(e) => setForm({ ...form, data_fechamento_prevista: e.target.value })}
              />
            </div>

            <div className="space-y-1">
              <Label>Observações</Label>
              <Textarea
                rows={3}
                value={form.observacoes ?? ""}
                onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
              />
            </div>

            {form.motivo_perda && (
              <div className="space-y-1">
                <Label>Motivo da perda</Label>
                <Textarea
                  rows={2}
                  value={form.motivo_perda ?? ""}
                  onChange={(e) => setForm({ ...form, motivo_perda: e.target.value })}
                />
              </div>
            )}

            <div className="flex items-center justify-between gap-2 pt-4 border-t">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="text-destructive">
                    <Trash2 className="w-4 h-4 mr-1" /> Excluir
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Excluir oportunidade?</AlertDialogTitle>
                    <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => deleteMutation.mutate()}>Excluir</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                  {saveMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Salvar
                </Button>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
