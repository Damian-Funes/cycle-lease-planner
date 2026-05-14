import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent,
  PointerSensor, useSensor, useSensors, useDraggable, useDroppable,
} from "@dnd-kit/core";
import AppHeader from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Plus, ArrowLeft, Calendar, TrendingUp, Target, DollarSign } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import OportunidadeFormModal from "@/components/OportunidadeFormModal";
import OportunidadeSheet from "@/components/OportunidadeSheet";

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const fmtDate = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) : "—";

interface Etapa { id: string; nome: string; ordem: number; cor: string | null; e_final: boolean; e_ganho: boolean; }
interface Oportunidade {
  id: string; cliente_id: string; titulo: string; etapa_id: string;
  valor_estimado: number | null; probabilidade: number;
  data_fechamento_prevista: string | null; responsavel_id: string | null;
  motivo_perda: string | null;
  clientes: { id: string; razao_social: string } | null;
  profiles: { id: string; nome: string | null; email: string } | null;
}

function OpCard({ op, onClick }: { op: Oportunidade; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: op.id,
    data: { op },
  });
  const initials = (op.profiles?.nome ?? op.profiles?.email ?? "?").slice(0, 2).toUpperCase();
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        // ignore click after drag
        if (isDragging) return;
        e.stopPropagation();
        onClick();
      }}
      className={`bg-card border rounded-md p-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow ${
        isDragging ? "opacity-30" : ""
      }`}
    >
      <div className="font-medium text-sm leading-snug mb-1">{op.titulo}</div>
      {op.clientes && (
        <Link
          to={`/dossie/${op.cliente_id}`}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className="text-xs text-primary hover:underline block mb-2 truncate"
        >
          {op.clientes.razao_social}
        </Link>
      )}
      <div className="flex items-center justify-between text-xs mb-2">
        <span className="font-semibold text-foreground">
          {op.valor_estimado ? fmtBRL(Number(op.valor_estimado)) : "—"}
        </span>
        <span className="flex items-center gap-1 text-muted-foreground">
          <Calendar className="w-3 h-3" /> {fmtDate(op.data_fechamento_prevista)}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary"
            style={{ width: `${op.probabilidade}%` }}
          />
        </div>
        <span className="text-[10px] text-muted-foreground w-7 text-right">{op.probabilidade}%</span>
        <Avatar className="w-6 h-6">
          <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
        </Avatar>
      </div>
    </div>
  );
}

function Column({ etapa, ops, onCardClick }: { etapa: Etapa; ops: Oportunidade[]; onCardClick: (id: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: etapa.id });
  const total = ops.reduce((s, o) => s + (Number(o.valor_estimado) || 0), 0);
  return (
    <div className="w-72 shrink-0 flex flex-col bg-muted/30 rounded-lg">
      <div
        className="p-3 rounded-t-lg border-b"
        style={{ backgroundColor: (etapa.cor ?? "#94a3b8") + "20", borderTop: `3px solid ${etapa.cor ?? "#94a3b8"}` }}
      >
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold text-sm">{etapa.nome}</h3>
          <span className="text-xs bg-background px-2 py-0.5 rounded-full">{ops.length}</span>
        </div>
        <div className="text-xs text-muted-foreground">{fmtBRL(total)}</div>
      </div>
      <div
        ref={setNodeRef}
        className={`flex-1 p-2 space-y-2 min-h-[200px] transition-colors ${isOver ? "bg-primary/5" : ""}`}
      >
        {ops.map((op) => (
          <OpCard key={op.id} op={op} onClick={() => onCardClick(op.id)} />
        ))}
      </div>
    </div>
  );
}

export default function Crm() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [novaOpen, setNovaOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [activeOpId, setActiveOpId] = useState<string | null>(null);
  const [activeDragOp, setActiveDragOp] = useState<Oportunidade | null>(null);
  const [filtroResponsavel, setFiltroResponsavel] = useState<string>("all");
  const [valorMin, setValorMin] = useState<string>("");

  // confirm modal for final stages
  const [confirmMove, setConfirmMove] = useState<{
    op: Oportunidade; etapa: Etapa; motivo: string;
  } | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const { data: etapas = [] } = useQuery({
    queryKey: ["etapas-pipeline"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("etapas_pipeline").select("*").order("ordem");
      if (error) throw error;
      return data as Etapa[];
    },
  });

  const { data: oportunidades = [] } = useQuery({
    queryKey: ["oportunidades"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("oportunidades")
        .select("*, clientes(id, razao_social), profiles(id, nome, email)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Oportunidade[];
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-approved"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, nome, email").eq("status", "approved");
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    return oportunidades.filter((o) => {
      if (filtroResponsavel !== "all" && o.responsavel_id !== filtroResponsavel) return false;
      if (valorMin && (Number(o.valor_estimado) || 0) < Number(valorMin)) return false;
      return true;
    });
  }, [oportunidades, filtroResponsavel, valorMin]);

  const opsByEtapa = useMemo(() => {
    const map: Record<string, Oportunidade[]> = {};
    etapas.forEach((e) => { map[e.id] = []; });
    filtered.forEach((o) => { if (map[o.etapa_id]) map[o.etapa_id].push(o); });
    return map;
  }, [filtered, etapas]);

  // KPIs
  const kpis = useMemo(() => {
    const naoFinais = filtered.filter((o) => {
      const et = etapas.find((e) => e.id === o.etapa_id);
      return et && !et.e_final;
    });
    const totalFunil = naoFinais.reduce((s, o) => s + (Number(o.valor_estimado) || 0), 0);
    const ponderado = naoFinais.reduce((s, o) => s + (Number(o.valor_estimado) || 0) * (o.probabilidade / 100), 0);
    const finais = filtered.filter((o) => etapas.find((e) => e.id === o.etapa_id)?.e_final);
    const ganhas = finais.filter((o) => etapas.find((e) => e.id === o.etapa_id)?.e_ganho).length;
    const conversao = finais.length ? (ganhas / finais.length) * 100 : 0;
    return { totalFunil, ponderado, conversao, count: naoFinais.length };
  }, [filtered, etapas]);

  const moveMutation = useMutation({
    mutationFn: async ({ op, etapa, motivo }: { op: Oportunidade; etapa: Etapa; motivo?: string }) => {
      const fromEtapa = etapas.find((e) => e.id === op.etapa_id);
      const payload: any = { etapa_id: etapa.id };
      if (etapa.e_final && !etapa.e_ganho) payload.motivo_perda = motivo ?? null;
      if (etapa.e_ganho) payload.probabilidade = 100;
      const { error } = await (supabase as any).from("oportunidades").update(payload).eq("id", op.id);
      if (error) throw error;
      // log activity
      await (supabase as any).from("atividades").insert({
        cliente_id: op.cliente_id,
        oportunidade_id: op.id,
        tipo: "evento_automatico",
        titulo: `Movida de ${fromEtapa?.nome ?? "?"} para ${etapa.nome}`,
        conteudo: motivo ? `Motivo: ${motivo}` : null,
        concluida: true,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["oportunidades"] });
      toast.success("Oportunidade movida");
    },
    onError: (e: any) => toast.error("Erro ao mover", { description: e?.message }),
  });

  const handleDragStart = (e: DragStartEvent) => {
    const op = e.active.data.current?.op as Oportunidade | undefined;
    setActiveDragOp(op ?? null);
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveDragOp(null);
    if (!e.over) return;
    const op = e.active.data.current?.op as Oportunidade;
    const targetEtapaId = String(e.over.id);
    if (!op || op.etapa_id === targetEtapaId) return;
    const etapa = etapas.find((x) => x.id === targetEtapaId);
    if (!etapa) return;
    if (etapa.e_final) {
      setConfirmMove({ op, etapa, motivo: "" });
    } else {
      moveMutation.mutate({ op, etapa });
    }
  };

  return (
    <div className="min-h-screen bg-muted/20 flex flex-col">
      <header className="bg-background border-b">
        <div className="max-w-[1600px] mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
            </Button>
            <div>
              <h1 className="font-semibold leading-tight">Pipeline Comercial</h1>
              <p className="text-xs text-muted-foreground">Gestão de oportunidades</p>
            </div>
          </div>
          <AppHeader />
        </div>
      </header>

      <main className="flex-1 px-4 py-4 max-w-[1600px] mx-auto w-full flex flex-col min-h-0">
        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <Card className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Target className="w-3 h-3" /> No funil
            </div>
            <div className="text-2xl font-bold">{kpis.count}</div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <DollarSign className="w-3 h-3" /> Valor total
            </div>
            <div className="text-2xl font-bold">{fmtBRL(kpis.totalFunil)}</div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <TrendingUp className="w-3 h-3" /> Valor ponderado
            </div>
            <div className="text-2xl font-bold">{fmtBRL(kpis.ponderado)}</div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <TrendingUp className="w-3 h-3" /> Conversão
            </div>
            <div className="text-2xl font-bold">{kpis.conversao.toFixed(0)}%</div>
          </Card>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <Select value={filtroResponsavel} onValueChange={setFiltroResponsavel}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="Responsável" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os responsáveis</SelectItem>
              {profiles.map((p: any) => (
                <SelectItem key={p.id} value={p.id}>{p.nome ?? p.email}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            placeholder="Valor mínimo"
            value={valorMin}
            onChange={(e) => setValorMin(e.target.value)}
            className="w-[160px]"
          />
          <div className="ml-auto">
            <Button onClick={() => setNovaOpen(true)}>
              <Plus className="w-4 h-4 mr-1" /> Nova Oportunidade
            </Button>
          </div>
        </div>

        {/* Kanban */}
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="flex-1 overflow-x-auto">
            <div className="flex gap-3 pb-4 min-h-full">
              {etapas.map((etapa) => (
                <Column
                  key={etapa.id}
                  etapa={etapa}
                  ops={opsByEtapa[etapa.id] ?? []}
                  onCardClick={(id) => { setActiveOpId(id); setSheetOpen(true); }}
                />
              ))}
            </div>
          </div>
          <DragOverlay>
            {activeDragOp && (
              <div className="bg-card border rounded-md p-3 shadow-lg w-72">
                <div className="font-medium text-sm">{activeDragOp.titulo}</div>
                <div className="text-xs text-muted-foreground">{activeDragOp.clientes?.razao_social}</div>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </main>

      <OportunidadeFormModal open={novaOpen} onOpenChange={setNovaOpen} />
      <OportunidadeSheet open={sheetOpen} onOpenChange={setSheetOpen} oportunidadeId={activeOpId} />

      {/* Confirmação para etapa final */}
      <AlertDialog open={!!confirmMove} onOpenChange={(v) => !v && setConfirmMove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Mover para "{confirmMove?.etapa.nome}"?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmMove?.etapa.e_ganho
                ? "Confirme o fechamento desta oportunidade como ganha."
                : "Informe o motivo da perda para registrar."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {confirmMove && !confirmMove.etapa.e_ganho && (
            <div className="space-y-1">
              <Label>Motivo da perda *</Label>
              <Textarea
                rows={3}
                value={confirmMove.motivo}
                onChange={(e) => setConfirmMove({ ...confirmMove, motivo: e.target.value })}
                placeholder="Ex: Preço, prazo, concorrente..."
              />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={confirmMove ? (!confirmMove.etapa.e_ganho && !confirmMove.motivo.trim()) : false}
              onClick={() => {
                if (!confirmMove) return;
                moveMutation.mutate({
                  op: confirmMove.op,
                  etapa: confirmMove.etapa,
                  motivo: confirmMove.etapa.e_ganho ? undefined : confirmMove.motivo.trim(),
                });
                setConfirmMove(null);
              }}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
