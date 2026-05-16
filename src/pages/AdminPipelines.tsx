import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useReadTables } from "@/lib/tables";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Plus, Pencil, Trash2, Loader2, GripVertical, AlertTriangle } from "lucide-react";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface Pipeline {
  id: string; nome: string; descricao: string | null; ordem: number | null;
  ativo: boolean; cor: string;
}
interface Etapa {
  id: string; pipeline_id: string; nome: string; ordem: number;
  cor: string | null; probabilidade_default: number; rotting_days: number;
  e_final: boolean; e_ganho: boolean;
}

export default function AdminPipelines() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [pipeModalOpen, setPipeModalOpen] = useState(false);
  const [editingPipe, setEditingPipe] = useState<Pipeline | null>(null);
  const [pipeToDelete, setPipeToDelete] = useState<Pipeline | null>(null);

  const { data: pipelines = [], isLoading } = useQuery({
    queryKey: ["pipelines-admin"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("pipelines").select("*").order("ordem");
      return (data ?? []) as Pipeline[];
    },
  });

  const { data: etapas = [] } = useQuery({
    queryKey: ["etapas-admin"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("etapas_pipeline").select("*").order("ordem");
      return (data ?? []) as Etapa[];
    },
  });

  const { data: oportCounts = {} } = useQuery({
    queryKey: ["oport-counts"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("oportunidades").select("pipeline_id, etapa_id");
      const map: Record<string, { byPipe: number; byEtapa: Record<string, number> }> = {};
      (data ?? []).forEach((o: any) => {
        if (!map[o.pipeline_id]) map[o.pipeline_id] = { byPipe: 0, byEtapa: {} };
        map[o.pipeline_id].byPipe++;
        map[o.pipeline_id].byEtapa[o.etapa_id] = (map[o.pipeline_id].byEtapa[o.etapa_id] || 0) + 1;
      });
      return map;
    },
  });

  const etapasByPipe = useMemo(() => {
    const m = new Map<string, Etapa[]>();
    etapas.forEach((e) => {
      if (!m.has(e.pipeline_id)) m.set(e.pipeline_id, []);
      m.get(e.pipeline_id)!.push(e);
    });
    return m;
  }, [etapas]);

  const togglePipe = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await (supabase as any).from("pipelines").update({ ativo }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pipelines-admin"] }),
  });

  const deletePipe = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("pipelines").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pipeline excluído");
      qc.invalidateQueries({ queryKey: ["pipelines-admin"] });
      qc.invalidateQueries({ queryKey: ["etapas-admin"] });
      setPipeToDelete(null);
    },
    onError: (e: any) => toast.error("Erro ao excluir", { description: e?.message }),
  });

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="bg-background border-b sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")}><ArrowLeft className="w-4 h-4" /></Button>
            <h1 className="text-lg font-bold">Gerenciar Pipelines</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => { setEditingPipe(null); setPipeModalOpen(true); }} className="gap-1">
              <Plus className="w-4 h-4" /> Novo Pipeline
            </Button>
            <AppHeader />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : pipelines.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">Nenhum pipeline cadastrado.</Card>
        ) : (
          pipelines.map((p) => {
            const eList = etapasByPipe.get(p.id) ?? [];
            const counts = oportCounts[p.id];
            const totalOport = counts?.byPipe ?? 0;
            const hasGanho = eList.some((e) => e.e_ganho);
            const hasFinal = eList.some((e) => e.e_final);

            return (
              <Card key={p.id} className="p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-2 h-12 rounded-full" style={{ background: p.cor }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="font-semibold">{p.nome}</h2>
                      {!p.ativo && <Badge variant="secondary">Inativo</Badge>}
                      {totalOport > 0 && <Badge variant="outline">{totalOport} oport.</Badge>}
                    </div>
                    {p.descricao && <p className="text-sm text-muted-foreground">{p.descricao}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2">
                      <Switch checked={p.ativo} onCheckedChange={(v) => togglePipe.mutate({ id: p.id, ativo: v })} />
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => { setEditingPipe(p); setPipeModalOpen(true); }}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setPipeToDelete(p)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {(!hasGanho || !hasFinal) && (
                  <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded">
                    <AlertTriangle className="w-4 h-4" />
                    Cada pipeline precisa ter pelo menos 1 etapa com <b>e_ganho</b> e 1 com <b>e_final</b>.
                  </div>
                )}

                <EtapasList
                  pipelineId={p.id}
                  etapas={eList}
                  oportCount={counts?.byEtapa ?? {}}
                />
              </Card>
            );
          })
        )}
      </main>

      <PipelineFormModal
        open={pipeModalOpen}
        onOpenChange={setPipeModalOpen}
        pipeline={editingPipe}
      />

      <AlertDialog open={!!pipeToDelete} onOpenChange={(v) => !v && setPipeToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir pipeline?</AlertDialogTitle>
            <AlertDialogDescription>
              {pipeToDelete && oportCounts[pipeToDelete.id]?.byPipe ? (
                <span className="text-destructive">
                  Não é possível excluir: este pipeline possui <b>{oportCounts[pipeToDelete.id].byPipe}</b> oportunidade(s) vinculada(s). Mova-as antes.
                </span>
              ) : (
                <>O pipeline <b>{pipeToDelete?.nome}</b> e todas as suas etapas serão removidos permanentemente.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={!!(pipeToDelete && oportCounts[pipeToDelete.id]?.byPipe)}
              onClick={() => pipeToDelete && deletePipe.mutate(pipeToDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletePipe.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* =========== ETAPAS LIST (drag/drop + edit) =========== */

function EtapasList({ pipelineId, etapas, oportCount }: { pipelineId: string; etapas: Etapa[]; oportCount: Record<string, number> }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Etapa | null>(null);
  const [novaOpen, setNovaOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Etapa | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const reorder = useMutation({
    mutationFn: async (items: Etapa[]) => {
      // duas passagens para evitar conflito com UNIQUE(pipeline_id, ordem)
      for (const e of items) {
        await (supabase as any).from("etapas_pipeline").update({ ordem: e.ordem + 1000 }).eq("id", e.id);
      }
      for (let i = 0; i < items.length; i++) {
        await (supabase as any).from("etapas_pipeline").update({ ordem: i + 1 }).eq("id", items[i].id);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["etapas-admin"] }),
    onError: (e: any) => toast.error("Erro ao reordenar", { description: e?.message }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("etapas_pipeline").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Etapa excluída");
      qc.invalidateQueries({ queryKey: ["etapas-admin"] });
      setToDelete(null);
    },
    onError: (e: any) => toast.error("Erro", { description: e?.message }),
  });

  function onDragEnd(ev: DragEndEvent) {
    const { active, over } = ev;
    if (!over || active.id === over.id) return;
    const oldIdx = etapas.findIndex((e) => e.id === active.id);
    const newIdx = etapas.findIndex((e) => e.id === over.id);
    const reordered = arrayMove(etapas, oldIdx, newIdx);
    reorder.mutate(reordered);
  }

  return (
    <div className="border-t pt-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Etapas ({etapas.length})</span>
        <Button size="sm" variant="outline" onClick={() => setNovaOpen(true)} className="gap-1">
          <Plus className="w-3 h-3" /> Nova Etapa
        </Button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={etapas.map((e) => e.id)} strategy={verticalListSortingStrategy}>
          {etapas.map((e) => (
            <EtapaRow key={e.id} etapa={e} count={oportCount[e.id] ?? 0} onEdit={() => setEditing(e)} onDelete={() => setToDelete(e)} />
          ))}
        </SortableContext>
      </DndContext>

      {(editing || novaOpen) && (
        <EtapaFormModal
          open
          onOpenChange={(v) => { if (!v) { setEditing(null); setNovaOpen(false); } }}
          pipelineId={pipelineId}
          etapa={editing}
          nextOrdem={etapas.length + 1}
        />
      )}

      <AlertDialog open={!!toDelete} onOpenChange={(v) => !v && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir etapa?</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete && oportCount[toDelete.id] ? (
                <span className="text-destructive">
                  Esta etapa possui <b>{oportCount[toDelete.id]}</b> oportunidade(s). Mova-as antes de excluir.
                </span>
              ) : (
                <>A etapa <b>{toDelete?.nome}</b> será removida permanentemente.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={!!(toDelete && oportCount[toDelete.id])}
              onClick={() => toDelete && deleteMut.mutate(toDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EtapaRow({ etapa, count, onEdit, onDelete }: { etapa: Etapa; count: number; onEdit: () => void; onDelete: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: etapa.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 p-2 rounded border bg-background">
      <button {...attributes} {...listeners} className="cursor-grab text-muted-foreground hover:text-foreground" type="button">
        <GripVertical className="w-4 h-4" />
      </button>
      <div className="w-3 h-3 rounded-full shrink-0" style={{ background: etapa.cor || "#94a3b8" }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{etapa.nome}</span>
          {etapa.e_ganho && <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100" variant="secondary">Ganho</Badge>}
          {etapa.e_final && !etapa.e_ganho && <Badge variant="secondary">Final</Badge>}
          {count > 0 && <Badge variant="outline" className="text-xs">{count}</Badge>}
        </div>
        <div className="text-xs text-muted-foreground">
          {etapa.probabilidade_default}% · rotting {etapa.rotting_days}d
        </div>
      </div>
      <Button size="icon" variant="ghost" onClick={onEdit}><Pencil className="w-4 h-4" /></Button>
      <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive" onClick={onDelete}>
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  );
}

/* =========== MODALS =========== */

function PipelineFormModal({ open, onOpenChange, pipeline }: { open: boolean; onOpenChange: (v: boolean) => void; pipeline: Pipeline | null }) {
  const qc = useQueryClient();
  const isEdit = !!pipeline;
  const [nome, setNome] = useState(pipeline?.nome ?? "");
  const [descricao, setDescricao] = useState(pipeline?.descricao ?? "");
  const [cor, setCor] = useState(pipeline?.cor ?? "#3b82f6");
  const [ativo, setAtivo] = useState(pipeline?.ativo ?? true);

  // re-init quando muda
  useMemo(() => {
    setNome(pipeline?.nome ?? "");
    setDescricao(pipeline?.descricao ?? "");
    setCor(pipeline?.cor ?? "#3b82f6");
    setAtivo(pipeline?.ativo ?? true);
  }, [pipeline]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = { nome: nome.trim(), descricao: descricao.trim() || null, cor, ativo };
      if (isEdit && pipeline) {
        const { error } = await (supabase as any).from("pipelines").update(payload).eq("id", pipeline.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("pipelines").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(isEdit ? "Pipeline atualizado" : "Pipeline criado");
      qc.invalidateQueries({ queryKey: ["pipelines-admin"] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error("Erro", { description: e?.message }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{isEdit ? "Editar Pipeline" : "Novo Pipeline"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Nome *</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Descrição</Label>
            <Textarea rows={3} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          </div>
          <div className="flex items-center gap-4">
            <div className="space-y-1">
              <Label>Cor</Label>
              <input type="color" value={cor} onChange={(e) => setCor(e.target.value)} className="h-9 w-16 rounded border" />
            </div>
            <div className="flex items-center gap-2 mt-5">
              <Switch checked={ativo} onCheckedChange={setAtivo} id="ativo" />
              <Label htmlFor="ativo">Ativo</Label>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => save.mutate()} disabled={!nome.trim() || save.isPending}>
            {save.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {isEdit ? "Salvar" : "Criar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EtapaFormModal({ open, onOpenChange, pipelineId, etapa, nextOrdem }: {
  open: boolean; onOpenChange: (v: boolean) => void; pipelineId: string; etapa: Etapa | null; nextOrdem: number;
}) {
  const qc = useQueryClient();
  const isEdit = !!etapa;
  const [nome, setNome] = useState(etapa?.nome ?? "");
  const [cor, setCor] = useState(etapa?.cor ?? "#94a3b8");
  const [prob, setProb] = useState(etapa?.probabilidade_default ?? 50);
  const [rot, setRot] = useState(etapa?.rotting_days ?? 14);
  const [eFinal, setEFinal] = useState(etapa?.e_final ?? false);
  const [eGanho, setEGanho] = useState(etapa?.e_ganho ?? false);

  const save = useMutation({
    mutationFn: async () => {
      const payload: any = {
        pipeline_id: pipelineId,
        nome: nome.trim(),
        cor,
        probabilidade_default: Math.max(0, Math.min(100, prob)),
        rotting_days: Math.max(0, rot),
        e_final: eFinal,
        e_ganho: eGanho,
      };
      if (isEdit && etapa) {
        const { error } = await (supabase as any).from("etapas_pipeline").update(payload).eq("id", etapa.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("etapas_pipeline").insert({ ...payload, ordem: nextOrdem });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(isEdit ? "Etapa atualizada" : "Etapa criada");
      qc.invalidateQueries({ queryKey: ["etapas-admin"] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error("Erro", { description: e?.message }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{isEdit ? "Editar Etapa" : "Nova Etapa"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Nome *</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Cor</Label>
              <input type="color" value={cor} onChange={(e) => setCor(e.target.value)} className="h-9 w-full rounded border" />
            </div>
            <div className="space-y-1">
              <Label>Probabilidade (%)</Label>
              <Input type="number" min={0} max={100} value={prob} onChange={(e) => setProb(Number(e.target.value))} />
            </div>
            <div className="space-y-1">
              <Label>Rotting (dias)</Label>
              <Input type="number" min={0} value={rot} onChange={(e) => setRot(Number(e.target.value))} />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Checkbox id="ef" checked={eFinal} onCheckedChange={(v) => setEFinal(!!v)} />
              <Label htmlFor="ef" className="cursor-pointer">Etapa final</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="eg" checked={eGanho} onCheckedChange={(v) => { setEGanho(!!v); if (v) setEFinal(true); }} />
              <Label htmlFor="eg" className="cursor-pointer">Representa ganho</Label>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => save.mutate()} disabled={!nome.trim() || save.isPending}>
            {save.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {isEdit ? "Salvar" : "Criar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
