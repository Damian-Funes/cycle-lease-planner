import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import AppHeader from "@/components/AppHeader";
import NovaAtividadeQuickForm from "@/components/NovaAtividadeQuickForm";
import ConcluirAtividadeDialog from "@/components/ConcluirAtividadeDialog";
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
import { ChevronDown, ChevronRight, Plus, Pencil, Trash2, Clock, Loader2, ArrowLeft, List, CalendarDays, Video, AlertTriangle, Play, MoreHorizontal } from "lucide-react";
import { useSyncingAtividade } from "@/hooks/useGoogleIntegration";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { startOfMonth, addMonths, setMonth } from "date-fns";
import { useIsMobile } from "@/hooks/use-mobile";
import CalendarioMesMobile from "@/components/atividade/CalendarioMesMobile";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Menu, Search } from "lucide-react";
import { format, isBefore, isToday, isTomorrow, addDays, startOfWeek, endOfWeek, addWeeks } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import AtividadesCalendar from "@/components/AtividadesCalendar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useResponsavelFilterOptions } from "@/hooks/useResponsavelFilterOptions";
import { AcaoAtividadeDialog, BotoesAcaoAtividade, type AcaoAtividade } from "@/components/atividade/AcoesAtividade";
import AtividadeDetalhe from "@/components/atividade/AtividadeDetalhe";
import PlacarAtividades from "@/components/atividade/PlacarAtividades";
import { empurrando } from "@/lib/atividadesAcoes";

interface Tipo { id: string; nome: string; icone: string | null; cor: string | null; ativo: boolean; }
interface Profile { user_id: string; nome: string | null; email: string; }
interface Atividade {
  id: string; titulo: string; descricao: string | null; data_inicio: string;
  concluida: boolean; evento_automatico: boolean; tipo_id: string | null;
  responsavel_id: string | null; oportunidade_id: string | null; organizacao_id: string | null; pessoa_id: string | null;
  google_meet_link?: string | null; erro_sincronizacao?: string | null; reagendamentos?: number | null;
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
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const atividadeLink = searchParams.get('atividade');
  const { profiles: respFilterProfiles } = useResponsavelFilterOptions();

  const [tipos, setTipos] = useState<Tipo[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [atividades, setAtividades] = useState<Atividade[]>([]);
  const [opps, setOpps] = useState<Record<string, { titulo: string; organizacao_id: string }>>({});
  const [orgs, setOrgs] = useState<Record<string, string>>({});
  const [pessoasMap, setPessoasMap] = useState<Record<string, { nome: string; organizacao_id: string | null }>>({});
  const [loading, setLoading] = useState(true);

  // Filtros
  const [tiposSel, setTiposSel] = useState<string[]>([]);
  const [respSel, setRespSel] = useState<string>("all");
  const [periodo, setPeriodo] = useState<Periodo>(() => (new URLSearchParams(window.location.search).get("atrasadas") ? "atrasadas" : "tudo"));
  const [showConcluidas, setShowConcluidas] = useState(false);
  type Visao = "lista" | "calendario" | "placar";
  const [view, setViewState] = useState<Visao>(() => {
    const q = new URLSearchParams(window.location.search);
    const v = q.get("visao");
    if (v === "lista" || v === "calendario") return v;
    if (q.get("atrasadas")) return "lista";
    if (window.innerWidth < 768) return "calendario"; // celular: sempre Calendário mês
    const salvo = localStorage.getItem("atividades:visao");
    return salvo === "lista" || salvo === "calendario" ? salvo : "calendario";
  });
  const setView = (v: Visao) => { setViewState(v); if (v !== "placar" && window.innerWidth >= 768) localStorage.setItem("atividades:visao", v); };
  const isMobile = useIsMobile();
  const [mesMobile, setMesMobile] = useState(() => startOfMonth(new Date()));
  const [menuMobile, setMenuMobile] = useState(false);
  const [buscaAberta, setBuscaAberta] = useState(false);
  const [busca, setBusca] = useState("");
  const [novoData, setNovoData] = useState<Date | undefined>(undefined);
  const [detalhe, setDetalhe] = useState<Atividade | null>(null);

  // Modais
  const [novoModal, setNovoModal] = useState(false);
  const [editAtiv, setEditAtiv] = useState<Atividade | null>(null);
  const [concluirAtiv, setConcluirAtiv] = useState<Atividade | null>(null);
  const [testando, setTestando] = useState(false);
  const [acao, setAcao] = useState<{ a: Atividade; tipo: AcaoAtividade; data?: Date } | null>(null);

  const carregar = async () => {
    if (!user?.id) return;
    setLoading(true);
    const [tps, prs, acc, direct] = await Promise.all([
      (supabase as any).from("tipos_atividade").select("*").eq("ativo", true).order("ordem"),
      supabase.from("profiles").select("user_id, nome, email").eq("status", "approved"),
      (supabase as any).from("vw_atividades_usuario").select("atividade_id").eq("usuario_com_acesso", user.id),
      (supabase as any)
        .from("atividades")
        .select("*")
        .order("data_inicio", { ascending: true })
        .limit(2000),
    ]);
    setTipos((tps.data as any) || []);
    setProfiles((prs.data as any) || []);

    // Base: tudo que a RLS já libera (admin/gerente = tudo; demais = próprias).
    const byId = new Map<string, any>();
    ((direct.data as any) || []).forEach((a: any) => byId.set(a.id, a));

    // Complemento: ids extras vindos da expansão por território (view).
    const viewIds = [...new Set(((acc.data as any) || []).map((r: any) => r.atividade_id))] as string[];
    const missing = viewIds.filter((id) => !byId.has(id));
    if (missing.length) {
      const { data: ats } = await (supabase as any)
        .from("atividades")
        .select("*")
        .in("id", missing)
        .limit(2000);
      (ats || []).forEach((a: any) => byId.set(a.id, a));
    }

    const arr = Array.from(byId.values()).sort((a: any, b: any) => {
      const da = a.data_inicio ? new Date(a.data_inicio).getTime() : 0;
      const db = b.data_inicio ? new Date(b.data_inicio).getTime() : 0;
      return da - db;
    });
    setAtividades(arr);

    const oppIds = [...new Set(arr.filter((a: any) => a.oportunidade_id).map((a: any) => a.oportunidade_id as string))] as string[];
    const orgDireto = [...new Set(arr.filter((a: any) => a.organizacao_id).map((a: any) => a.organizacao_id as string))] as string[];
    const pesIds = [...new Set(arr.filter((a: any) => a.pessoa_id).map((a: any) => a.pessoa_id as string))] as string[];

    let opsData: any[] = [];
    if (oppIds.length) {
      const { data: ops } = await supabase.from("oportunidades").select("id, titulo, organizacao_id").in("id", oppIds);
      opsData = ops || [];
      const map: any = {};
      opsData.forEach((o: any) => { map[o.id] = { titulo: o.titulo, organizacao_id: o.organizacao_id }; });
      setOpps(map);
    }

    const orgIds = [...new Set([...orgDireto, ...opsData.map((o: any) => o.organizacao_id).filter(Boolean)])] as string[];
    if (orgIds.length) {
      const { data: ogs } = await supabase.from("organizacoes").select("id, nome").in("id", orgIds);
      const omap: any = {};
      (ogs || []).forEach((o: any) => { omap[o.id] = o.nome; });
      setOrgs(omap);
    }

    if (pesIds.length) {
      const { data: ps } = await supabase.from("pessoas").select("id, nome, organizacao_id").in("id", pesIds);
      const pmap: any = {};
      (ps || []).forEach((p: any) => { pmap[p.id] = { nome: p.nome, organizacao_id: p.organizacao_id }; });
      setPessoasMap(pmap);
    }
    setLoading(false);
  };

  useEffect(() => { carregar(); }, [user?.id]);
  useEffect(() => {
    if (loading || !atividadeLink) return;
    const atividade = atividades.find(a => a.id === atividadeLink);
    if (atividade) setDetalhe(atividade);
    else toast.error('Atividade não encontrada ou sem acesso.');
    setSearchParams(params => { const next = new URLSearchParams(params); next.delete('atividade'); return next; }, { replace: true });
  }, [loading, atividadeLink, atividades, setSearchParams]);

  const filtradas = useMemo(() => {
    const now = new Date();
    return atividades.filter(a => {
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
    if (!a.concluida) { setAcao({ a, tipo: "feito" }); return; }
    const { error } = await (supabase as any).from("atividades").update({ concluida: false, data_conclusao: null }).eq("id", a.id);
    if (error) return toast.error(error.message);
    carregar();
  };

  const excluir = async (id: string) => {
    if (!confirm("Excluir atividade?")) return;
    const { error } = await (supabase as any).from("atividades").delete().eq("id", id);
    if (error) return toast.error(error.message);
    carregar();
  };

  const testarAssumirOrgs = async () => {
    setTestando(true);
    try {
      const { data, error } = await supabase.functions.invoke("notify-assumir-organizacoes", { body: { force: true } });
      if (error) throw error;
      console.log("[teste notify-assumir-organizacoes] resultado:", data);
      if (data?.criadas && Array.isArray(data.criadas)) {
        data.criadas.forEach((c: any) => {
          console.log(`  → Atividade criada para ${c.responsavel_email || c.responsavel_id} (${c.titulo})`);
        });
      }
      toast.success(`Teste concluído: ${data?.criadas?.length || 0} atividade(s) criada(s)`);
    } catch (err: any) {
      console.error("[teste notify-assumir-organizacoes] erro:", err);
      toast.error(err.message || "Falha ao chamar Edge Function");
    } finally {
      setTestando(false);
    }
  };

  const renderLinha = (a: Atividade) => {
    const tipo = a.tipo_id ? tipos.find(t => t.id === a.tipo_id) : null;
    const Icon: any = tipo?.icone && (Icons as any)[tipo.icone] ? (Icons as any)[tipo.icone] : Icons.Circle;
    const prof = profiles.find(p => p.user_id === a.responsavel_id);
    const opp = a.oportunidade_id ? opps[a.oportunidade_id] : null;
    const orgName = opp ? orgs[opp.organizacao_id] : (a.organizacao_id ? orgs[a.organizacao_id] : null);

    return (
      <div key={a.id} onClick={() => setDetalhe(a)} className="flex items-center gap-3 px-3 py-2 hover:bg-muted/40 border-b last:border-0 cursor-pointer">
        <span onClick={(e) => e.stopPropagation()}><Checkbox checked={a.concluida} onCheckedChange={() => marcarConcluida(a)} /></span>
        <span className="text-xs text-muted-foreground w-12 tabular-nums">{format(new Date(a.data_inicio), "HH:mm")}</span>
        <div className="rounded p-1.5" style={{ background: (tipo?.cor || "#888") + "22", color: tipo?.cor || "#666" }}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-medium truncate ${a.concluida ? "line-through text-muted-foreground" : ""}`}>
            {a.tipo_id === "18a81316-9ca6-4e3f-980c-c771b821a730" && /assumir organiza/i.test(a.titulo) ? (
              <Link to="/organizacoes?filtro=sem_responsavel" className="hover:underline text-primary" onClick={(e) => e.stopPropagation()}>
                {a.titulo}
              </Link>
            ) : a.titulo}
            <SyncIndicator id={a.id} erro={a.erro_sincronizacao} />
            {!a.concluida && empurrando(a.reagendamentos) && (
              <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-destructive/10 text-destructive align-middle">
                empurrando · {a.reagendamentos}x
              </span>
            )}
            {a.evento_automatico && (
              <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary align-middle">
                IA
              </span>
            )}
            {a.google_meet_link && (
              <a href={a.google_meet_link} target="_blank" rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 ml-2 text-xs text-primary hover:underline align-middle">
                <Video className="h-3 w-3" /> Meet
              </a>
            )}
          </div>
          <div className="text-xs text-muted-foreground truncate flex flex-wrap gap-x-1">
            {orgName && <Link to={a.oportunidade_id && opp ? `/organizacoes/${opp.organizacao_id}` : `/organizacoes/${a.organizacao_id}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>{orgName}</Link>}
            {opp && a.oportunidade_id && <span>→ <Link to={`/crm/deal/${a.oportunidade_id}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>{opp.titulo}</Link></span>}
            {a.pessoa_id && pessoasMap[a.pessoa_id] && (
              <span>{(orgName || opp) ? "· " : ""}<Link to={`/pessoas`} className="hover:underline">{pessoasMap[a.pessoa_id].nome}</Link></span>
            )}
          </div>
        </div>
        <Avatar className="h-7 w-7"><AvatarFallback className="text-[10px]">{initials(prof?.nome || prof?.email)}</AvatarFallback></Avatar>
        {!a.concluida && <BotoesAcaoAtividade compacto onAcao={(tipo) => setAcao({ a, tipo })} />}
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); setEditAtiv(a); }}><Pencil className="h-3.5 w-3.5" /></Button>
        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={(e) => { e.stopPropagation(); excluir(a.id); }}><Trash2 className="h-3.5 w-3.5" /></Button>
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

  const filtrosUI = (
    <>
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
                {respFilterProfiles.map(p => <SelectItem key={p.user_id} value={p.user_id}>{p.nome || p.email}</SelectItem>)}
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
    </>
  );

  const listaUI = (
            filtradas.length === 0 ? (
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
          ));

  const modaisUI = (
    <>
      {/* Modal Nova Atividade */}
      <Dialog open={novoModal} onOpenChange={(o) => { setNovoModal(o); if (!o) setNovoData(undefined); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Nova atividade</DialogTitle></DialogHeader>
          <NovaAtividadeQuickForm key={novoData?.toISOString() ?? "novo"} dataInicial={novoData} onSaved={() => { carregar(); setNovoModal(false); }} onClose={() => setNovoModal(false)} />
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
                  const original = atividades.find((x) => x.id === editAtiv.id);
                  const mudouData = !!original && !original.concluida && new Date(original.data_inicio).getTime() !== new Date(editAtiv.data_inicio).getTime();
                  // Mudança de data em atividade aberta só pelo reagendamento (motivo obrigatório).
                  const { error } = await (supabase as any).from("atividades").update({
                    titulo: editAtiv.titulo, descricao: editAtiv.descricao,
                    ...(original?.concluida ? { data_inicio: editAtiv.data_inicio } : {}),
                  }).eq("id", editAtiv.id);
                  if (error) return toast.error(error.message);
                  if (mudouData && original) setAcao({ a: { ...original, titulo: editAtiv.titulo }, tipo: "reagendar", data: new Date(editAtiv.data_inicio) });
                  setEditAtiv(null); carregar();
                }}>Salvar</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {detalhe && (() => {
        const opp = detalhe.oportunidade_id ? opps[detalhe.oportunidade_id] : null;
        const orgId = detalhe.organizacao_id || opp?.organizacao_id || null;
        const nomeDe = (uid: string | null) => { const p = profiles.find(x => x.user_id === uid); return p ? (p.nome || p.email) : null; };
        return (
          <AtividadeDetalhe
            atividade={{ ...detalhe, organizacao_id: orgId }}
            tipoNome={tipos.find(t => t.id === detalhe.tipo_id)?.nome}
            responsavelNome={nomeDe(detalhe.responsavel_id)}
            orgNome={orgId ? orgs[orgId] : null}
            oppTitulo={opp?.titulo}
            nomeDe={nomeDe}
            onClose={() => setDetalhe(null)}
            onAcao={(tipo) => { const a = detalhe; setDetalhe(null); setAcao({ a, tipo }); }}
            onEditar={() => { const a = detalhe; setDetalhe(null); setEditAtiv(a); }}
            onReabrir={() => { const a = detalhe; setDetalhe(null); marcarConcluida(a); }}
          />
        );
      })()}

      {/* Concluir atividade + próximo passo */}
      <AcaoAtividadeDialog
        atividade={acao?.a ?? null} acao={acao?.tipo ?? null} dataSugerida={acao?.data}
        onClose={() => setAcao(null)}
        onDone={() => { setAcao(null); carregar(); }}
      />
      <ConcluirAtividadeDialog atividade={concluirAtiv} onClose={() => setConcluirAtiv(null)} onDone={() => { setConcluirAtiv(null); carregar(); }} />
    </>
  );

  const termo = busca.trim().toLowerCase();
  const resultadosBusca = termo.length < 2 ? [] : filtradas.filter((a) => {
    const orgId = a.organizacao_id || (a.oportunidade_id ? opps[a.oportunidade_id]?.organizacao_id : null);
    return [a.titulo, orgId ? orgs[orgId] : "", a.pessoa_id ? pessoasMap[a.pessoa_id]?.nome : ""].some((t) => (t || "").toLowerCase().includes(termo));
  }).slice(0, 30);

  if (isMobile) {
    const hoje = new Date();
    return (
      <div className="flex h-[100dvh] flex-col bg-background">
        <header className="flex items-center gap-1 border-b px-2 py-1.5">
          <Button size="icon" variant="ghost" aria-label="Menu" onClick={() => setMenuMobile(true)}><Menu className="h-5 w-5" /></Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" className="px-2 text-lg font-semibold capitalize">
                {format(mesMobile, "MMMM", { locale: ptBR })}{mesMobile.getFullYear() !== hoje.getFullYear() ? ` ${mesMobile.getFullYear()}` : ""}
                <ChevronDown className="ml-1 h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72" align="start">
              <div className="mb-2 flex items-center justify-between">
                <Button size="sm" variant="ghost" onClick={() => setMesMobile(addMonths(mesMobile, -12))}>‹</Button>
                <span className="font-semibold">{mesMobile.getFullYear()}</span>
                <Button size="sm" variant="ghost" onClick={() => setMesMobile(addMonths(mesMobile, 12))}>›</Button>
              </div>
              <div className="grid grid-cols-3 gap-1">
                {Array.from({ length: 12 }, (_, i) => (
                  <Button key={i} size="sm" variant={mesMobile.getMonth() === i ? "default" : "ghost"} className="capitalize"
                    onClick={() => setMesMobile(setMonth(mesMobile, i))}>{format(new Date(2026, i, 1), "MMM", { locale: ptBR })}</Button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          <div className="ml-auto flex items-center gap-1">
            <Button size="icon" variant="ghost" aria-label="Buscar" onClick={() => setBuscaAberta(true)}><Search className="h-5 w-5" /></Button>
            <Button size="icon" variant="outline" aria-label="Hoje" className="h-8 w-8 text-xs font-bold"
              onClick={() => { setMesMobile(startOfMonth(hoje)); setView("calendario"); }}>{hoje.getDate()}</Button>
            <AppHeader />
          </div>
        </header>

        {loading ? (
          <div className="flex flex-1 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : view === "calendario" ? (
          <CalendarioMesMobile
            mes={mesMobile} onMes={setMesMobile}
            atividades={filtradas} tipos={tipos}
            onSelectAtividade={(a) => setDetalhe(a)}
            onConcluirRapido={(a) => setAcao({ a, tipo: "feito" })}
            onNovaNoDia={(d) => { const x = new Date(d); x.setHours(9, 0, 0, 0); setNovoData(x); setNovoModal(true); }}
          />
        ) : (
          <div className="flex-1 overflow-y-auto p-2 pb-24">
            {view === "placar" ? (
              <PlacarAtividades
                nomes={Object.fromEntries(profiles.map((p) => [p.user_id, p.nome || p.email]))}
                onVerVendedor={(uid) => { setRespSel(uid); setPeriodo("atrasadas"); setView("lista"); }}
              />
            ) : listaUI}
          </div>
        )}

        <Button aria-label="Nova atividade" onClick={() => { setNovoData(undefined); setNovoModal(true); }}
          className="fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] right-5 z-20 h-14 w-14 rounded-2xl shadow-lg">
          <Plus className="h-7 w-7" />
        </Button>

        <Sheet open={menuMobile} onOpenChange={setMenuMobile}>
          <SheetContent side="left" className="w-[85vw] max-w-xs overflow-y-auto">
            <SheetHeader><SheetTitle>Atividades</SheetTitle></SheetHeader>
            <p className="mt-1 text-sm text-muted-foreground">
              <span className="font-medium text-destructive">{countAtrasadas} atrasadas</span> · {countHoje} hoje
            </p>
            <div className="mt-4 space-y-4">
              <Card className="space-y-1 p-3">
                <h3 className="text-xs font-semibold uppercase text-muted-foreground">Visão</h3>
                {([["calendario", "Calendário mês"], ["lista", "Lista"], ...(isAdmin ? [["placar", "Atrasadas do time"]] : [])] as [Visao, string][]).map(([v, l]) => (
                  <button key={v} onClick={() => { setView(v); setMenuMobile(false); }}
                    className={`w-full rounded px-2 py-1.5 text-left text-sm ${view === v ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{l}</button>
                ))}
              </Card>
              <Card className="space-y-3 p-3">
                <div className="flex items-center justify-between"><Label htmlFor="scm">Concluídas</Label><Switch id="scm" checked={showConcluidas} onCheckedChange={setShowConcluidas} /></div>
                <div className="flex items-center justify-between"><Label htmlFor="atm">Só atrasadas</Label><Switch id="atm" checked={periodo === "atrasadas"} onCheckedChange={(v) => setPeriodo(v ? "atrasadas" : "tudo")} /></div>
              </Card>
              {filtrosUI}
              {isAdmin && <Button variant="ghost" size="sm" className="w-full justify-start" disabled={testando} onClick={testarAssumirOrgs}><Play className="mr-2 h-4 w-4" />Testar aviso "assumir organizações"</Button>}
              <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => navigate("/")}><ArrowLeft className="mr-2 h-4 w-4" />Início</Button>
            </div>
          </SheetContent>
        </Sheet>

        <Dialog open={buscaAberta} onOpenChange={setBuscaAberta}>
          <DialogContent className="top-4 max-w-md translate-y-0">
            <DialogHeader><DialogTitle>Buscar atividade</DialogTitle></DialogHeader>
            <Input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Título, empresa ou pessoa (filtros atuais)" />
            <div className="max-h-[60dvh] space-y-1 overflow-y-auto">
              {termo.length >= 2 && resultadosBusca.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">Nada encontrado nos filtros atuais.</p>}
              {resultadosBusca.map((a) => (
                <button key={a.id} className="w-full rounded border p-2 text-left hover:bg-muted"
                  onClick={() => { setBuscaAberta(false); setMesMobile(startOfMonth(new Date(a.data_inicio))); setView("calendario"); setDetalhe(a); }}>
                  <div className="truncate text-sm font-medium">{a.titulo}</div>
                  <div className="text-xs text-muted-foreground">{format(new Date(a.data_inicio), "dd/MM/yyyy HH:mm")}</div>
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>

        {modaisUI}
      </div>
    );
  }

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
                {isAdmin && <TabsTrigger value="placar" className="text-xs gap-1 px-2"><AlertTriangle className="h-3.5 w-3.5" />Atrasadas</TabsTrigger>}
              </TabsList>
            </Tabs>
            <div className="flex items-center gap-2"><Switch checked={showConcluidas} onCheckedChange={setShowConcluidas} id="sc" /><Label htmlFor="sc" className="text-sm">Concluídas</Label></div>
            {isAdmin && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="ghost" className="h-8 w-8" title="Ferramentas de admin" disabled={testando}>
                    {testando ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={testarAssumirOrgs}><Play className="h-4 w-4 mr-2" />Testar aviso "assumir organizações"</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button size="sm" onClick={() => setNovoModal(true)}><Plus className="h-4 w-4 mr-1" />Nova</Button>
            <AppHeader />
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-4 grid grid-cols-[240px_1fr] gap-4">
        <aside className="space-y-4">
          {filtrosUI}
        </aside>

        <main className="space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : view === "placar" ? (
            <PlacarAtividades
              nomes={Object.fromEntries(profiles.map((p) => [p.user_id, p.nome || p.email]))}
              onVerVendedor={(uid) => { setRespSel(uid); setPeriodo("atrasadas"); setView("lista"); }}
            />
          ) : view === "calendario" ? (
            <AtividadesCalendar
              atividades={filtradas}
              tipos={tipos}
              onSelectAtividade={(a) => setDetalhe(a as any)}
              onConcluirRapido={(a) => setAcao({ a: a as any, tipo: "feito" })}
              onCreateAt={() => setNovoModal(true)}
            />
          ) : listaUI}
        </main>
      </div>

      {modaisUI}
    </div>
  );
}
