import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent,
  PointerSensor, useSensor, useSensors, useDroppable,
  closestCorners,
} from "@dnd-kit/core";
import {
  SortableContext, useSortable, arrayMove, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { differenceInDays, parseISO, startOfDay, subDays, isAfter } from "date-fns";
import {
  ArrowLeft, Calendar, CheckCircle2, Clock, DollarSign, Flame,
  Plus, Search, Settings, Target, TrendingUp, Trophy,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useReadTables } from "@/lib/tables";
import AppHeader from "@/components/AppHeader";
import NovaOportunidadeModal from "@/components/NovaOportunidadeModal";
import { useResponsavelFilterOptions } from "@/hooks/useResponsavelFilterOptions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const fmtDate = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) : "—";

interface Pipeline { id: string; nome: string; ativo: boolean; cor: string; }
interface Etapa {
  id: string; pipeline_id: string; nome: string; ordem: number;
  cor: string | null; probabilidade_default: number; rotting_days: number;
  e_final: boolean; e_ganho: boolean;
}
type RottingStatus = "fresh" | "aging" | "rotting" | "no_activity";

interface Oportunidade {
  id: string; titulo: string; pipeline_id: string; etapa_id: string;
  organizacao_id: string; valor_estimado: number; probabilidade: number;
  data_fechamento_prevista: string | null; data_fechamento_real: string | null;
  responsavel_id: string | null; status: string; motivo_perda: string | null;
  ordem_coluna: number | null; ultima_atividade_em: string | null;
  proxima_atividade_em: string | null; updated_at: string; created_at: string;
  organizacao_nome: string | null;
  responsavel_nome: string | null;
  responsavel_email: string | null;
  etapa_cor: string | null;
  etapa_rotting_days: number | null;
  rotting_status: RottingStatus;
  dias_sem_atividade: number;
}

const STORAGE_KEY = "crm.pipelineId";

/* ---------- Rotting visual map ---------- */
const ROTTING_MAP: Record<RottingStatus, { border: string; emoji: string; label: string }> = {
  fresh:       { border: "border-l-emerald-500", emoji: "🌱", label: "Fresca" },
  aging:       { border: "border-l-amber-500",   emoji: "⏳", label: "Envelhecendo" },
  rotting:     { border: "border-l-orange-600",  emoji: "🔥", label: "Em rotting" },
  no_activity: { border: "border-l-rose-500",    emoji: "⚠️", label: "Sem atividade" },
};

function OpCard({ op, etapa, hideValor }: { op: Oportunidade; etapa?: Etapa; hideValor?: boolean }) {
  const navigate = useNavigate();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: op.id,
    data: { type: "card", op },
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };
  const initials = (op.responsavel_nome ?? op.responsavel_email ?? "?").slice(0, 2).toUpperCase();
  const rotting = ROTTING_MAP[op.rotting_status] ?? ROTTING_MAP.fresh;
  const limit = op.etapa_rotting_days ?? etapa?.rotting_days ?? 14;
  const tooltipText =
    op.rotting_status === "fresh"
      ? `Em dia · ${op.dias_sem_atividade}d sem atividade (limite ${limit}d)`
      : op.rotting_status === "no_activity"
      ? `Sem próxima atividade agendada · ${op.dias_sem_atividade}d`
      : `Sem atividade há ${op.dias_sem_atividade}d — rotting em ${limit}d`;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        if (isDragging) return;
        e.stopPropagation();
        navigate(`/crm/deal/${op.id}`);
      }}
      className={`relative bg-card border border-l-4 ${rotting.border} rounded-md p-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow`}
    >
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className="absolute top-1.5 right-1.5 text-xs leading-none select-none"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              {rotting.emoji}
            </span>
          </TooltipTrigger>
          <TooltipContent side="left">
            <span className="text-xs">{rotting.label} · {tooltipText}</span>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <div className="font-semibold text-sm leading-snug mb-1 line-clamp-2 pr-5">{op.titulo}</div>
      {op.organizacao_nome && (
        <Link
          to={`/organizacoes/${op.organizacao_id}`}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className="text-xs text-primary hover:underline block mb-2 truncate"
        >
          {op.organizacao_nome}
        </Link>
      )}
      <div className="flex items-end justify-between mb-2">
        {hideValor ? <span /> : (
          <span className="text-base font-bold">
            {op.valor_estimado ? fmtBRL(Number(op.valor_estimado)) : "—"}
          </span>
        )}
        <Avatar className="w-7 h-7">
          <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
        </Avatar>
      </div>
      <div className="flex items-center justify-between text-[11px] text-muted-foreground gap-2">
        <span className="flex items-center gap-1">
          <Calendar className="w-3 h-3" /> {fmtDate(op.data_fechamento_prevista)}
        </span>
        <span className="flex items-center gap-2">
          {op.ultima_atividade_em && (
            <span className="flex items-center gap-0.5" title={`Última: ${fmtDate(op.ultima_atividade_em)}`}>
              <CheckCircle2 className="w-3 h-3" />
            </span>
          )}
          {op.proxima_atividade_em && (
            <span className="flex items-center gap-0.5" title={`Próxima: ${fmtDate(op.proxima_atividade_em)}`}>
              <Clock className="w-3 h-3" />
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

/* ---------- Column ---------- */
function Column({ etapa, ops, hideValor }: { etapa: Etapa; ops: Oportunidade[]; hideValor?: boolean }) {
  const total = ops.reduce((s, o) => s + (Number(o.valor_estimado) || 0), 0);
  const cor = etapa.cor ?? "#94a3b8";
  const ids = ops.map((o) => o.id);

  // droppable for empty column case
  const { setNodeRef, isOver } = useDroppable({
    id: `col:${etapa.id}`,
    data: { type: "column", etapaId: etapa.id },
  });

  return (
    <div className="w-72 shrink-0 flex flex-col bg-muted/30 rounded-lg">
      <div
        className="p-3 rounded-t-lg border-b"
        style={{ backgroundColor: cor + "26", borderTop: `3px solid ${cor}` }}
      >
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold text-sm">{etapa.nome}</h3>
          <div className="flex items-center gap-1.5">
            {(() => {
              const rotCount = ops.filter((o) => o.rotting_status === "rotting").length;
              return rotCount > 0 ? (
                <span
                  className="text-[11px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full font-medium"
                  title={`${rotCount} oportunidade(s) em rotting`}
                >
                  🔥 {rotCount}
                </span>
              ) : null;
            })()}
            <span className="text-xs bg-background px-2 py-0.5 rounded-full font-medium">{ops.length}</span>
          </div>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium">{hideValor ? `${ops.length} oportunidade${ops.length === 1 ? "" : "s"}` : fmtBRL(total)}</span>
          <span className="text-muted-foreground">{etapa.probabilidade_default}% prob.</span>
        </div>
      </div>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          data-column-id={etapa.id}
          className={`flex-1 p-2 space-y-2 min-h-[200px] transition-colors ${isOver ? "bg-primary/5" : ""}`}
        >
          {ops.map((op) => (
            <OpCard key={op.id} op={op} etapa={etapa} hideValor={hideValor} />
          ))}
          {ops.length === 0 && (
            <div className="text-center text-xs text-muted-foreground py-6">Solte aqui</div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}

/* ---------- Page ---------- */
export default function Crm() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { isAdmin, profile, user, hasRole } = useAuth();
  const isMarketing = hasRole("marketing");
  const tables = useReadTables();

  const [pipelineId, setPipelineId] = useState<string>(() => localStorage.getItem(STORAGE_KEY) ?? "");
  const [novaOpen, setNovaOpen] = useState(false);
  const [busca, setBusca] = useState("");
  const buscaRef = useRef<HTMLInputElement>(null);

  const [filtroResp, setFiltroResp] = useState<string>("all");
  const [valorMin, setValorMin] = useState("");
  const [valorMax, setValorMax] = useState("");
  const [apenasMinhas, setApenasMinhas] = useState(false);
  const [filtroStatus, setFiltroStatus] = useState<string>("aberta");

  const [activeOp, setActiveOp] = useState<Oportunidade | null>(null);
  const [confirmMove, setConfirmMove] = useState<{ op: Oportunidade; etapa: Etapa; motivo: string; dataReal: string } | null>(null);
  const [needsDate, setNeedsDate] = useState<{ op: Oportunidade; toEtapaId: string; data: string } | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  /* Queries */
  const { data: pipelines = [] } = useQuery({
    queryKey: ["pipelines-ativos"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("pipelines").select("*").eq("ativo", true).order("ordem");
      if (error) throw error;
      return data as Pipeline[];
    },
  });

  const { data: etapas = [] } = useQuery({
    queryKey: ["etapas-pipeline-all"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("etapas_pipeline").select("*").order("ordem");
      if (error) throw error;
      return data as Etapa[];
    },
  });

  const { data: oportunidades = [] } = useQuery({
    queryKey: ["oportunidades", tables.oportunidades_kanban],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from(tables.oportunidades_kanban)
        .select("*")
        .order("ordem_coluna", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as any[]).map((o) => ({ valor_estimado: 0, probabilidade: 0, ...o })) as Oportunidade[];
    },
  });

  const { profiles: respFilterProfiles } = useResponsavelFilterOptions();

  /* Default pipeline */
  useEffect(() => {
    if (!pipelines.length) return;
    if (!pipelineId || !pipelines.find((p) => p.id === pipelineId)) {
      const def = pipelines[0].id;
      setPipelineId(def);
      localStorage.setItem(STORAGE_KEY, def);
    }
  }, [pipelines]); // eslint-disable-line

  const handlePipelineChange = (v: string) => {
    setPipelineId(v);
    localStorage.setItem(STORAGE_KEY, v);
  };

  /* Atalhos */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable) return;
      if (e.key === "/") { e.preventDefault(); buscaRef.current?.focus(); }
      else if (e.key.toLowerCase() === "n" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault(); setNovaOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  /* Etapas / oportunidades do pipeline atual */
  const etapasPipeline = useMemo(
    () => etapas.filter((e) => e.pipeline_id === pipelineId).sort((a, b) => a.ordem - b.ordem),
    [etapas, pipelineId]
  );

  const filtered = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const min = Number(valorMin) || 0;
    const max = Number(valorMax) || Infinity;
    return oportunidades.filter((o) => {
      if (o.pipeline_id !== pipelineId) return false;
      if (filtroStatus !== "all" && o.status !== filtroStatus) return false;
      if (filtroResp !== "all" && o.responsavel_id !== filtroResp) return false;
      if (apenasMinhas && o.responsavel_id !== user?.id) return false;
      const v = Number(o.valor_estimado) || 0;
      if (v < min || v > max) return false;
      if (q) {
        const inTitle = o.titulo.toLowerCase().includes(q);
        const inOrg = o.organizacao_nome?.toLowerCase().includes(q);
        if (!inTitle && !inOrg) return false;
      }
      return true;
    });
  }, [oportunidades, pipelineId, filtroStatus, filtroResp, valorMin, valorMax, apenasMinhas, busca, user?.id]);

  const opsByEtapa = useMemo(() => {
    const map: Record<string, Oportunidade[]> = {};
    etapasPipeline.forEach((e) => { map[e.id] = []; });
    filtered.forEach((o) => { if (map[o.etapa_id]) map[o.etapa_id].push(o); });
    Object.values(map).forEach((arr) =>
      arr.sort((a, b) => (a.ordem_coluna ?? 9999) - (b.ordem_coluna ?? 9999))
    );
    return map;
  }, [filtered, etapasPipeline]);

  /* KPIs */
  const kpis = useMemo(() => {
    const allDoPipeline = oportunidades.filter((o) => o.pipeline_id === pipelineId);
    const abertas = allDoPipeline.filter((o) => o.status === "aberta");
    const totalCount = abertas.length;
    const totalValor = abertas.reduce((s, o) => s + (Number(o.valor_estimado) || 0), 0);
    const ponderado = abertas.reduce((s, o) => s + (Number(o.valor_estimado) || 0) * (o.probabilidade / 100), 0);

    const inicioMes = new Date();
    inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0);
    const ganhasMes = allDoPipeline.filter((o) => {
      if (o.status !== "ganha") return false;
      const d = o.data_fechamento_real ?? o.updated_at;
      return d && isAfter(parseISO(d), inicioMes);
    });
    const ganhasMesValor = ganhasMes.reduce((s, o) => s + (Number(o.valor_estimado) || 0), 0);

    const limite = startOfDay(subDays(new Date(), 90));
    const fechadas90 = allDoPipeline.filter((o) => {
      if (o.status !== "ganha" && o.status !== "perdida") return false;
      const d = o.data_fechamento_real ?? o.updated_at;
      return d && isAfter(parseISO(d), limite);
    });
    const ganhas90 = fechadas90.filter((o) => o.status === "ganha").length;
    const winRate = fechadas90.length ? (ganhas90 / fechadas90.length) * 100 : 0;

    return { totalCount, totalValor, ponderado, ganhasMes: ganhasMes.length, ganhasMesValor, winRate };
  }, [oportunidades, pipelineId]);

  /* Mutations */
  const moveCardMutation = useMutation({
    mutationFn: async ({ id, etapa_id, ordem_coluna, extra }: { id: string; etapa_id?: string; ordem_coluna?: number; extra?: any }) => {
      const payload: any = { ...(etapa_id ? { etapa_id } : {}), ...(ordem_coluna != null ? { ordem_coluna } : {}), ...(extra ?? {}) };
      const { error } = await (supabase as any).from("oportunidades").update(payload).eq("id", id);
      if (error) throw error;
    },
    onError: (err: any) => {
      qc.invalidateQueries({ queryKey: ["oportunidades"] });
      toast.error("Erro ao mover", { description: err?.message });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["oportunidades"] }),
  });

  /* Drag handlers */
  const handleDragStart = (e: DragStartEvent) => {
    const op = (e.active.data.current as any)?.op as Oportunidade | undefined;
    setActiveOp(op ?? null);
  };

  const findEtapaIdOfActive = (id: string): string | null => {
    const op = oportunidades.find((o) => o.id === id);
    return op?.etapa_id ?? null;
  };

  const resolveTargetEtapa = (overId: string): string | null => {
    if (overId.startsWith("col:")) return overId.slice(4);
    const op = oportunidades.find((o) => o.id === overId);
    return op?.etapa_id ?? null;
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    setActiveOp(null);
    if (!over) return;
    const op = (active.data.current as any)?.op as Oportunidade;
    if (!op) return;

    const fromEtapaId = op.etapa_id;
    const toEtapaId = resolveTargetEtapa(String(over.id));
    if (!toEtapaId) return;

    const targetEtapa = etapasPipeline.find((x) => x.id === toEtapaId);
    if (!targetEtapa) return;

    // Mesma coluna → reordenar
    if (fromEtapaId === toEtapaId) {
      const list = opsByEtapa[fromEtapaId] ?? [];
      const oldIdx = list.findIndex((o) => o.id === op.id);
      const overOp = oportunidades.find((o) => o.id === String(over.id));
      const newIdx = overOp ? list.findIndex((o) => o.id === overOp.id) : list.length - 1;
      if (oldIdx === -1 || newIdx === -1 || oldIdx === newIdx) return;
      const reordered = arrayMove(list, oldIdx, newIdx);
      // optimistic
      qc.setQueryData<Oportunidade[]>(["oportunidades"], (curr) => {
        if (!curr) return curr;
        return curr.map((o) => {
          const idx = reordered.findIndex((r) => r.id === o.id);
          return idx >= 0 ? { ...o, ordem_coluna: idx } : o;
        });
      });
      reordered.forEach((o, idx) => {
        if ((o.ordem_coluna ?? -1) !== idx) {
          moveCardMutation.mutate({ id: o.id, ordem_coluna: idx });
        }
      });
      return;
    }

    // Coluna diferente
    if (targetEtapa.e_final) {
      setConfirmMove({ op, etapa: targetEtapa, motivo: "", dataReal: new Date().toISOString().slice(0, 10) });
      return;
    }

    // Exige data prevista de fechamento antes de movimentar
    if (!op.data_fechamento_prevista) {
      const hoje = new Date();
      const sugestao = new Date(hoje.getFullYear(), hoje.getMonth() + 1, hoje.getDate())
        .toISOString().slice(0, 10);
      setNeedsDate({ op, toEtapaId, data: sugestao });
      return;
    }


    // Optimistic move
    const prev = qc.getQueryData<Oportunidade[]>(["oportunidades"]);
    qc.setQueryData<Oportunidade[]>(["oportunidades"], (curr) =>
      curr?.map((o) => (o.id === op.id ? { ...o, etapa_id: toEtapaId, probabilidade: targetEtapa.probabilidade_default } : o))
    );

    moveCardMutation.mutate(
      { id: op.id, etapa_id: toEtapaId, extra: { probabilidade: targetEtapa.probabilidade_default } },
      {
        onError: () => {
          if (prev) qc.setQueryData(["oportunidades"], prev);
        },
        onSuccess: () => toast.success("Oportunidade movida"),
      }
    );
  };

  const confirmFinalMove = () => {
    if (!confirmMove) return;
    const { op, etapa, motivo, dataReal } = confirmMove;
    const extra: any = {
      status: etapa.e_ganho ? "ganha" : "perdida",
      data_fechamento_real: dataReal,
    };
    if (etapa.e_ganho) extra.probabilidade = 100;
    else extra.motivo_perda = motivo.trim();

    const prev = qc.getQueryData<Oportunidade[]>(["oportunidades"]);
    qc.setQueryData<Oportunidade[]>(["oportunidades"], (curr) =>
      curr?.map((o) => (o.id === op.id ? { ...o, etapa_id: etapa.id, ...extra } : o))
    );

    moveCardMutation.mutate(
      { id: op.id, etapa_id: etapa.id, extra },
      {
        onError: () => prev && qc.setQueryData(["oportunidades"], prev),
        onSuccess: () => {
          toast.success(etapa.e_ganho ? "Oportunidade ganha 🎉" : "Oportunidade marcada como perdida");
        },
      }
    );
    setConfirmMove(null);
  };

  const confirmDateAndMove = () => {
    if (!needsDate || !needsDate.data) return;
    const { op, toEtapaId, data } = needsDate;
    const targetEtapa = etapasPipeline.find((x) => x.id === toEtapaId);
    if (!targetEtapa) { setNeedsDate(null); return; }

    const prev = qc.getQueryData<Oportunidade[]>(["oportunidades"]);
    qc.setQueryData<Oportunidade[]>(["oportunidades"], (curr) =>
      curr?.map((o) => (o.id === op.id
        ? { ...o, etapa_id: toEtapaId, probabilidade: targetEtapa.probabilidade_default, data_fechamento_prevista: data }
        : o))
    );

    moveCardMutation.mutate(
      { id: op.id, etapa_id: toEtapaId, extra: { probabilidade: targetEtapa.probabilidade_default, data_fechamento_prevista: data } },
      {
        onError: () => { if (prev) qc.setQueryData(["oportunidades"], prev); },
        onSuccess: () => toast.success("Oportunidade movida"),
      }
    );
    setNeedsDate(null);
  };

  /* Render */
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
        {/* Pipeline tabs + actions */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          {pipelines.length > 0 && pipelineId && (
            <Tabs value={pipelineId} onValueChange={handlePipelineChange}>
              <TabsList className="h-10">
                {pipelines.map((p) => (
                  <TabsTrigger key={p.id} value={p.id} className="px-5">
                    {p.nome}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}
          <div className="ml-auto flex items-center gap-2">
            {isAdmin && (
              <Button variant="ghost" size="icon" onClick={() => navigate("/admin/pipelines")} title="Gerenciar pipelines">
                <Settings className="w-4 h-4" />
              </Button>
            )}
            <Button onClick={() => setNovaOpen(true)}>
              <Plus className="w-4 h-4 mr-1" /> Nova Oportunidade
            </Button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <Card className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Target className="w-3 h-3" /> Oportunidades no Pipeline
            </div>
            <div className="text-2xl font-bold leading-tight">{kpis.totalCount}</div>
            {!isMarketing && <div className="text-xs text-muted-foreground">{fmtBRL(kpis.totalValor)}</div>}
          </Card>
          {!isMarketing && (
            <Card className="p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <TrendingUp className="w-3 h-3" /> Forecast Ponderado
              </div>
              <div className="text-2xl font-bold leading-tight">{fmtBRL(kpis.ponderado)}</div>
              <div className="text-xs text-muted-foreground">Σ valor × prob.</div>
            </Card>
          )}
          <Card className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Trophy className="w-3 h-3" /> Ganhas no Mês
            </div>
            <div className="text-2xl font-bold leading-tight">{kpis.ganhasMes}</div>
            {!isMarketing && <div className="text-xs text-muted-foreground">{fmtBRL(kpis.ganhasMesValor)}</div>}
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <DollarSign className="w-3 h-3" /> Win Rate 90d
            </div>
            <div className="text-2xl font-bold leading-tight">{kpis.winRate.toFixed(0)}%</div>
            <div className="text-xs text-muted-foreground">Ganhas / fechadas</div>
          </Card>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input
              ref={buscaRef}
              placeholder="Buscar (/ para focar)"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-9 w-[260px]"
            />
          </div>
          <Select value={filtroResp} onValueChange={setFiltroResp}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Responsável" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os responsáveis</SelectItem>
              {respFilterProfiles.map((p) => (
                <SelectItem key={p.user_id} value={p.user_id}>{p.nome ?? p.email}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filtroStatus} onValueChange={setFiltroStatus}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos status</SelectItem>
              <SelectItem value="aberta">Aberta</SelectItem>
              <SelectItem value="ganha">Ganha</SelectItem>
              <SelectItem value="perdida">Perdida</SelectItem>
            </SelectContent>
          </Select>
          <Input
            type="number" placeholder="Valor min" value={valorMin}
            onChange={(e) => setValorMin(e.target.value)} className="w-[120px]"
          />
          <Input
            type="number" placeholder="Valor max" value={valorMax}
            onChange={(e) => setValorMax(e.target.value)} className="w-[120px]"
          />
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={apenasMinhas} onCheckedChange={(v) => setApenasMinhas(!!v)} />
            Apenas minhas
          </label>
        </div>

        {/* Kanban */}
        {etapasPipeline.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            Pipeline sem etapas. {isAdmin && <Link to="/admin/pipelines" className="text-primary underline ml-1">Configurar</Link>}
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="flex-1 overflow-x-auto">
              <div className="flex gap-3 pb-4 min-h-full">
                {etapasPipeline.map((etapa) => (
                  <Column key={etapa.id} etapa={etapa} ops={opsByEtapa[etapa.id] ?? []} hideValor={isMarketing} />
                ))}
              </div>
            </div>
            <DragOverlay>
              {activeOp && (
                <div className="bg-card border rounded-md p-3 shadow-lg w-72">
                  <div className="font-semibold text-sm">{activeOp.titulo}</div>
                  <div className="text-xs text-muted-foreground">{activeOp.organizacao_nome}</div>
                  {!isMarketing && (
                    <div className="text-base font-bold mt-1">
                      {activeOp.valor_estimado ? fmtBRL(Number(activeOp.valor_estimado)) : "—"}
                    </div>
                  )}
                </div>
              )}
            </DragOverlay>
          </DndContext>
        )}
      </main>

      <NovaOportunidadeModal
        open={novaOpen}
        onOpenChange={setNovaOpen}
        defaultPipelineId={pipelineId}
      />

      {/* Confirmação para etapa final */}
      <AlertDialog open={!!confirmMove} onOpenChange={(v) => !v && setConfirmMove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Mover para "{confirmMove?.etapa.nome}"?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmMove?.etapa.e_ganho
                ? "Confirme o fechamento desta oportunidade como GANHA."
                : "Informe o motivo da perda para registrar."}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {confirmMove && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Data de fechamento *</Label>
                <Input
                  type="date"
                  value={confirmMove.dataReal}
                  onChange={(e) => setConfirmMove({ ...confirmMove, dataReal: e.target.value })}
                />
              </div>
              {confirmMove.etapa.e_ganho ? (
                <div className="text-sm text-muted-foreground">
                  Você poderá vincular uma proposta na tela de detalhes da oportunidade.
                </div>
              ) : (
                <div className="space-y-1">
                  <Label>Motivo da perda *</Label>
                  <Textarea
                    rows={3}
                    value={confirmMove.motivo}
                    onChange={(e) => setConfirmMove({ ...confirmMove, motivo: e.target.value })}
                    placeholder="Ex: preço, prazo, concorrente..."
                  />
                </div>
              )}
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={
                !confirmMove ||
                !confirmMove.dataReal ||
                (!confirmMove.etapa.e_ganho && !confirmMove.motivo.trim())
              }
              onClick={confirmFinalMove}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
