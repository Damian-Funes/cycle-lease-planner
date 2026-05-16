import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useReadTables } from "@/lib/tables";
import AppHeader from "@/components/AppHeader";
import NovaAtividadeQuickForm from "@/components/NovaAtividadeQuickForm";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import * as Icons from "lucide-react";
import { ChevronDown, ChevronRight, Plus, Pencil, Trash2, Clock, Loader2, ArrowLeft, List, CalendarDays, Video, AlertTriangle } from "lucide-react";
import { useSyncingAtividade } from "@/hooks/useGoogleIntegration";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format, isBefore, isToday, isTomorrow, addDays, startOfWeek, endOfWeek, addWeeks } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import AtividadesCalendar from "@/components/AtividadesCalendar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Tipo { id: string; nome: string; icone: string | null; cor: string | null; ativo: boolean; }
interface Profile { user_id: string; nome: string | null; email: string; }
interface Atividade {
  id: string; titulo: string; descricao: string | null; data_inicio: string;
  concluida: boolean; evento_automatico: boolean; tipo_id: string | null;
  responsavel_id: string | null; oportunidade_id: string | null; organizacao_id: string | null;
  google_meet_link?: string | null; erro_sincronizacao?: string | null;
}

type Periodo = "hoje" | "semana" | "proxima" | "atrasadas" | "tudo";

const initials = (s?: string | null) => (s || "?").split(" ").map(x => x[0]).slice(0, 2).join("").toUpperCase();

function SyncIndicator({ id, erro }: { id: string; erro?: string | null }) {
  const syncing = useSyncingAtividade(id);
  if (syncing) {
    return (
      <span className="inline-flex items-center gap-1 ml-2 text-xs text-muted-foreground align-middle">
        <Loader2 className="h-3 w-3 animate-spin" /> sincronizando…
      </span>
    );
  }
  if (erro) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center ml-2 align-middle text-amber-600">
              <AlertTriangle className="h-3.5 w-3.5" />
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">{erro}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  return null;
}

export default function Atividades() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [tipos, setTipos] = useState<Tipo[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [atividades, setAtividades] = useState<Atividade[]>([]);
  const [opps, setOpps] = useState<Record<string, { titulo: string; organizacao_id: string }>>({});
  const [orgs, setOrgs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  // Filtros
  const [tiposSel, setTiposSel] = useState<string[]>([]);
  const [respSel, setRespSel] = useState<string>("me");
  const [periodo, setPeriodo] = useState<Periodo>("tudo");
  const [showConcluidas, setShowConcluidas] = useState(false);
  const [view, setView] = useState<"lista" | "calendario">("lista");

  // Modais
  const [novoModal, setNovoModal] = useState(false);
  const [editAtiv, setEditAtiv] = useState<Atividade | null>(null);
  const [concluirAtiv, setConcluirAtiv] = useState<Atividade | null>(null);
  const [resultado, setResultado] = useState("");

  const carregar = async () => {
    setLoading(true);
    const [tps, prs, ats] = await Promise.all([
      (supabase as any).from("tipos_atividade").select("*").eq("ativo", true).order("ordem"),
      supabase.from("profiles").select("user_id, nome, email").eq("status", "approved"),
      (supabase as any).from("atividades").select("*").order("data_inicio", { ascending: true }).limit(1000),
    ]);
    setTipos((tps.data as any) || []);
    setProfiles((prs.data as any) || []);
    const arr = (ats.data as any) || [];
    setAtividades(arr);

    const oppIds = [...new Set(arr.filter((a: any) => a.oportunidade_id).map((a: any) => a.oportunidade_id as string))] as string[];
    if (oppIds.length) {
      const { data: ops } = await supabase.from("oportunidades").select("id, titulo, organizacao_id").in("id", oppIds);
      const map: any = {};
      (ops || []).forEach((o: any) => { map[o.id] = { titulo: o.titulo, organizacao_id: o.organizacao_id }; });
      setOpps(map);
      const orgIds = [...new Set((ops || []).map((o: any) => o.organizacao_id as string))] as string[];
      if (orgIds.length) {
        const { data: ogs } = await supabase.from("organizacoes").select("id, nome").in("id", orgIds);
        const omap: any = {};
        (ogs || []).forEach((o: any) => { omap[o.id] = o.nome; });
        setOrgs(omap);
      }
    }
    setLoading(false);
  };

  useEffect(() => { carregar(); }, []);

  const filtradas = useMemo(() => {
    const now = new Date();
    return atividades.filter(a => {
      if (a.evento_automatico) return false;
      if (!showConcluidas && a.concluida) return false;
      if (tiposSel.length && (!a.tipo_id || !tiposSel.includes(a.tipo_id))) return false;
      if (respSel === "me" && a.responsavel_id !== user?.id) return false;
      if (respSel !== "me" && respSel !== "all" && a.responsavel_id !== respSel) return false;

      const d = new Date(a.data_inicio);
      if (periodo === "hoje" && !isToday(d)) return false;
      if (periodo === "atrasadas" && !(isBefore(d, now) && !a.concluida)) return false;
      if (periodo === "semana") {
        const ws = startOfWeek(now, { weekStartsOn: 1 }); const we = endOfWeek(now, { weekStartsOn: 1 });
        if (d < ws || d > we) return false;
      }
      if (periodo === "proxima") {
        const ws = startOfWeek(addWeeks(now, 1), { weekStartsOn: 1 }); const we = endOfWeek(addWeeks(now, 1), { weekStartsOn: 1 });
        if (d < ws || d > we) return false;
      }
      return true;
    });
  }, [atividades, showConcluidas, tiposSel, respSel, periodo, user?.id]);

  const grupos = useMemo(() => {
    const now = new Date();
    const ws = startOfWeek(now, { weekStartsOn: 1 }); const we = endOfWeek(now, { weekStartsOn: 1 });
    const nws = startOfWeek(addWeeks(now, 1), { weekStartsOn: 1 }); const nwe = endOfWeek(addWeeks(now, 1), { weekStartsOn: 1 });
    const g: Record<string, Atividade[]> = { atrasadas: [], hoje: [], amanha: [], semana: [], proxima: [], depois: [] };
    filtradas.forEach(a => {
      const d = new Date(a.data_inicio);
      if (isBefore(d, now) && !a.concluida) g.atrasadas.push(a);
      else if (isToday(d)) g.hoje.push(a);
      else if (isTomorrow(d)) g.amanha.push(a);
      else if (d >= ws && d <= we) g.semana.push(a);
      else if (d >= nws && d <= nwe) g.proxima.push(a);
      else g.depois.push(a);
    });
    return g;
  }, [filtradas]);

  const countAtrasadas = grupos.atrasadas.length;
  const countHoje = grupos.hoje.length;

  const toggleTipo = (id: string) => setTiposSel(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

  const marcarConcluida = async (a: Atividade) => {
    if (!a.concluida) { setConcluirAtiv(a); setResultado(""); return; }
    const { error } = await (supabase as any).from("atividades").update({ concluida: false, data_conclusao: null }).eq("id", a.id);
    if (error) return toast.error(error.message);
    carregar();
  };

  const confirmarConclusao = async () => {
    if (!concluirAtiv) return;
    const { error } = await (supabase as any).from("atividades").update({
      concluida: true, data_conclusao: new Date().toISOString(), resultado: resultado.trim() || null,
    }).eq("id", concluirAtiv.id);
    if (error) return toast.error(error.message);
    setConcluirAtiv(null); carregar();
  };

  const adiar = async (a: Atividade, dias?: number, dataCustom?: string) => {
    let nova: Date;
    if (dataCustom) nova = new Date(dataCustom);
    else nova = addDays(new Date(a.data_inicio), dias || 1);
    const { error } = await (supabase as any).from("atividades").update({ data_inicio: nova.toISOString() }).eq("id", a.id);
    if (error) return toast.error(error.message);
    toast.success("Adiada"); carregar();
  };

  const excluir = async (id: string) => {
    if (!confirm("Excluir atividade?")) return;
    const { error } = await (supabase as any).from("atividades").delete().eq("id", id);
    if (error) return toast.error(error.message);
    carregar();
  };

  const renderLinha = (a: Atividade) => {
    const tipo = a.tipo_id ? tipos.find(t => t.id === a.tipo_id) : null;
    const Icon: any = tipo?.icone && (Icons as any)[tipo.icone] ? (Icons as any)[tipo.icone] : Icons.Circle;
    const prof = profiles.find(p => p.user_id === a.responsavel_id);
    const opp = a.oportunidade_id ? opps[a.oportunidade_id] : null;
    const orgName = opp ? orgs[opp.organizacao_id] : (a.organizacao_id ? orgs[a.organizacao_id] : null);

    return (
      <div key={a.id} className="flex items-center gap-3 px-3 py-2 hover:bg-muted/40 border-b last:border-0">
        <Checkbox checked={a.concluida} onCheckedChange={() => marcarConcluida(a)} />
        <span className="text-xs text-muted-foreground w-12 tabular-nums">{format(new Date(a.data_inicio), "HH:mm")}</span>
        <div className="rounded p-1.5" style={{ background: (tipo?.cor || "#888") + "22", color: tipo?.cor || "#666" }}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-medium truncate ${a.concluida ? "line-through text-muted-foreground" : ""}`}>
            {a.titulo}
            <SyncIndicator id={a.id} erro={a.erro_sincronizacao} />
            {a.google_meet_link && (
              <a href={a.google_meet_link} target="_blank" rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 ml-2 text-xs text-primary hover:underline align-middle">
                <Video className="h-3 w-3" /> Meet
              </a>
            )}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {orgName && <Link to={a.oportunidade_id && opp ? `/organizacoes/${opp.organizacao_id}` : `/organizacoes/${a.organizacao_id}`} className="hover:underline">{orgName}</Link>}
            {opp && a.oportunidade_id && <> → <Link to={`/crm/deal/${a.oportunidade_id}`} className="hover:underline">{opp.titulo}</Link></>}
          </div>
        </div>
        <Avatar className="h-7 w-7"><AvatarFallback className="text-[10px]">{initials(prof?.nome || prof?.email)}</AvatarFallback></Avatar>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button size="sm" variant="ghost" className="h-7 px-2 text-xs"><Clock className="h-3 w-3 mr-1" />Adiar</Button></DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => adiar(a, 1)}>1 dia</DropdownMenuItem>
            <DropdownMenuItem onClick={() => adiar(a, 7)}>1 semana</DropdownMenuItem>
            <DropdownMenuItem onClick={() => {
              const v = prompt("Data (YYYY-MM-DD HH:mm):", format(new Date(a.data_inicio), "yyyy-MM-dd HH:mm"));
              if (v) adiar(a, undefined, v);
            }}>Escolher data…</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditAtiv(a)}><Pencil className="h-3.5 w-3.5" /></Button>
        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => excluir(a.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
      </div>
    );
  };

  const Section = ({ id, label, emoji, items, defaultOpen = true }: any) => {
    const [open, setOpen] = useState(defaultOpen);
    if (!items.length) return null;
    return (
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex items-center gap-2 w-full px-3 py-2 bg-muted/50 text-sm font-semibold hover:bg-muted">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <span>{emoji} {label}</span>
          <span className="ml-auto text-xs text-muted-foreground">{items.length}</span>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="bg-card">{items.map(renderLinha)}</div>
        </CollapsibleContent>
      </Collapsible>
    );
  };

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="bg-background border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")}><ArrowLeft className="h-4 w-4 mr-1" />Início</Button>
          <h1 className="font-semibold text-lg">Atividades</h1>
          <span className="text-sm text-muted-foreground">
            <span className="text-destructive font-medium">{countAtrasadas} atrasadas</span> · <span>{countHoje} hoje</span>
          </span>
          <div className="ml-auto flex items-center gap-3">
            <Tabs value={view} onValueChange={(v) => setView(v as any)}>
              <TabsList className="h-8">
                <TabsTrigger value="lista" className="text-xs gap-1 px-2"><List className="h-3.5 w-3.5" />Lista</TabsTrigger>
                <TabsTrigger value="calendario" className="text-xs gap-1 px-2"><CalendarDays className="h-3.5 w-3.5" />Calendário</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="flex items-center gap-2"><Switch checked={showConcluidas} onCheckedChange={setShowConcluidas} id="sc" /><Label htmlFor="sc" className="text-sm">Concluídas</Label></div>
            <Button size="sm" onClick={() => setNovoModal(true)}><Plus className="h-4 w-4 mr-1" />Nova</Button>
            <AppHeader />
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-4 grid grid-cols-[240px_1fr] gap-4">
        <aside className="space-y-4">
          <Card className="p-3 space-y-2">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground">Período</h3>
            {[["tudo", "Tudo"], ["atrasadas", "Atrasadas"], ["hoje", "Hoje"], ["semana", "Esta semana"], ["proxima", "Próxima semana"]].map(([v, l]) => (
              <button key={v} onClick={() => setPeriodo(v as Periodo)}
                className={`w-full text-left text-sm px-2 py-1 rounded ${periodo === v ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{l}</button>
            ))}
          </Card>
          <Card className="p-3 space-y-2">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground">Responsável</h3>
            <Select value={respSel} onValueChange={setRespSel}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="me">Eu</SelectItem>
                <SelectItem value="all">Todos</SelectItem>
                {profiles.map(p => <SelectItem key={p.user_id} value={p.user_id}>{p.nome || p.email}</SelectItem>)}
              </SelectContent>
            </Select>
          </Card>
          <Card className="p-3 space-y-2">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground">Tipos</h3>
            {tipos.map(t => (
              <label key={t.id} className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={tiposSel.includes(t.id)} onCheckedChange={() => toggleTipo(t.id)} />
                <span className="w-2 h-2 rounded-full" style={{ background: t.cor || "#888" }} />
                {t.nome}
              </label>
            ))}
          </Card>
        </aside>

        <main className="space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : view === "calendario" ? (
            <AtividadesCalendar
              atividades={filtradas}
              tipos={tipos}
              onSelectAtividade={(a) => setEditAtiv(a as any)}
              onCreateAt={() => setNovoModal(true)}
            />
          ) : filtradas.length === 0 ? (
            <Card className="p-12 text-center text-muted-foreground">Nenhuma atividade encontrada</Card>
          ) : (
            <Card className="overflow-hidden">
              <Section id="atrasadas" label="Atrasadas" emoji="🔴" items={grupos.atrasadas} />
              <Section id="hoje" label="Hoje" emoji="📅" items={grupos.hoje} />
              <Section id="amanha" label="Amanhã" emoji="📆" items={grupos.amanha} />
              <Section id="semana" label="Esta semana" emoji="📅" items={grupos.semana} />
              <Section id="proxima" label="Próxima semana" emoji="📅" items={grupos.proxima} />
              <Section id="depois" label="Depois" emoji="⏳" items={grupos.depois} defaultOpen={false} />
            </Card>
          )}
        </main>
      </div>

      {/* Modal Nova Atividade */}
      <Dialog open={novoModal} onOpenChange={setNovoModal}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Nova atividade</DialogTitle></DialogHeader>
          <NovaAtividadeQuickForm onSaved={() => { carregar(); setNovoModal(false); }} onClose={() => setNovoModal(false)} />
        </DialogContent>
      </Dialog>

      {/* Editar */}
      <Dialog open={!!editAtiv} onOpenChange={(o) => !o && setEditAtiv(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Editar atividade</DialogTitle></DialogHeader>
          {editAtiv && (
            <div className="space-y-3">
              <Input value={editAtiv.titulo} onChange={e => setEditAtiv({ ...editAtiv, titulo: e.target.value })} placeholder="Título" />
              <Textarea value={editAtiv.descricao || ""} onChange={e => setEditAtiv({ ...editAtiv, descricao: e.target.value })} placeholder="Descrição" />
              <Input type="datetime-local" value={format(new Date(editAtiv.data_inicio), "yyyy-MM-dd'T'HH:mm")}
                onChange={e => setEditAtiv({ ...editAtiv, data_inicio: new Date(e.target.value).toISOString() })} />
              <DialogFooter>
                <Button variant="ghost" onClick={() => setEditAtiv(null)}>Cancelar</Button>
                <Button onClick={async () => {
                  const { error } = await (supabase as any).from("atividades").update({
                    titulo: editAtiv.titulo, descricao: editAtiv.descricao, data_inicio: editAtiv.data_inicio,
                  }).eq("id", editAtiv.id);
                  if (error) return toast.error(error.message);
                  setEditAtiv(null); carregar();
                }}>Salvar</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirmar conclusão */}
      <Dialog open={!!concluirAtiv} onOpenChange={(o) => !o && setConcluirAtiv(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Marcar como concluída</DialogTitle></DialogHeader>
          <Textarea placeholder="Resultado (opcional)" value={resultado} onChange={e => setResultado(e.target.value)} rows={3} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConcluirAtiv(null)}>Cancelar</Button>
            <Button onClick={confirmarConclusao}>Concluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
