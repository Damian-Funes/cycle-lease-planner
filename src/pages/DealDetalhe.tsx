import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  ChevronRight, MoreHorizontal, Trophy, X, ChevronDown, Plus, Trash2,
  Upload, FileText, ExternalLink, Building2, History, Loader2,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

const PAPEIS = ["decisor", "influenciador", "técnico", "comprador"];

interface Etapa { id: string; nome: string; ordem: number; cor: string | null; e_final: boolean; e_ganho: boolean; probabilidade_default: number; pipeline_id: string; }
interface Pipeline { id: string; nome: string; cor: string; }
interface Profile { user_id: string; nome: string | null; email: string; }

export default function DealDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [deal, setDeal] = useState<any>(null);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [etapas, setEtapas] = useState<Etapa[]>([]);
  const [org, setOrg] = useState<any>(null);
  const [pessoasOrg, setPessoasOrg] = useState<any[]>([]);
  const [oppPessoas, setOppPessoas] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [historico, setHistorico] = useState<any[]>([]);
  const [arquivos, setArquivos] = useState<any[]>([]);
  const [proposta, setProposta] = useState<any>(null);
  const [propostasDisponiveis, setPropostasDisponiveis] = useState<any[]>([]);
  const [historicoOpen, setHistoricoOpen] = useState(false);

  // Modais
  const [winDialog, setWinDialog] = useState(false);
  const [winData, setWinData] = useState({ data_real: "", valor_final: 0, observacoes: "" });
  const [loseDialog, setLoseDialog] = useState(false);
  const [loseData, setLoseData] = useState({ motivo: "", motivo_outro: "", concorrente: "", observacoes: "" });
  const [postWinDialog, setPostWinDialog] = useState(false);
  const [reabrirDialog, setReabrirDialog] = useState(false);
  const [reabrirObs, setReabrirObs] = useState("");
  const [delDialog, setDelDialog] = useState(false);
  const [moveDialog, setMoveDialog] = useState(false);
  const [novoPipeline, setNovoPipeline] = useState("");
  const [novaEtapa, setNovaEtapa] = useState("");
  const [addPessoaDialog, setAddPessoaDialog] = useState(false);
  const [pessoaSel, setPessoaSel] = useState("");
  const [papelSel, setPapelSel] = useState("decisor");
  const [vincPropDialog, setVincPropDialog] = useState(false);

  const carregar = async () => {
    if (!id) return;
    setLoading(true);
    const [{ data: d }, { data: pips }, { data: eps }, { data: profs }] = await Promise.all([
      supabase.from("oportunidades").select("*").eq("id", id).maybeSingle(),
      supabase.from("pipelines").select("*").order("ordem"),
      supabase.from("etapas_pipeline").select("*").order("ordem"),
      supabase.from("profiles").select("user_id, nome, email").eq("status", "approved"),
    ]);
    if (!d) { setLoading(false); toast.error("Oportunidade não encontrada"); return; }
    setDeal(d);
    setPipelines(pips || []);
    setEtapas(eps || []);
    setProfiles(profs || []);

    if (d.organizacao_id) {
      const { data: o } = await supabase.from("organizacoes").select("*").eq("id", d.organizacao_id).maybeSingle();
      setOrg(o);
      const { data: ps } = await supabase.from("pessoas").select("*").eq("organizacao_id", d.organizacao_id);
      setPessoasOrg(ps || []);
    }

    const { data: opPess } = await supabase
      .from("oportunidade_pessoas")
      .select("id, papel, pessoa_id, pessoas(id, nome, cargo, email)")
      .eq("oportunidade_id", id);
    setOppPessoas(opPess || []);

    const { data: hist } = await supabase
      .from("historico_oportunidade")
      .select("*")
      .eq("oportunidade_id", id)
      .order("created_at", { ascending: false });
    setHistorico(hist || []);

    if (d.proposta_id) {
      const { data: p } = await supabase.from("propostas").select("*").eq("id", d.proposta_id).maybeSingle();
      setProposta(p);
    } else setProposta(null);

    const { data: files } = await supabase.storage.from("deal-files").list(id, { limit: 100 });
    setArquivos(files || []);

    setLoading(false);
  };

  useEffect(() => { carregar(); }, [id]);

  const etapaAtual = useMemo(() => etapas.find(e => e.id === deal?.etapa_id), [etapas, deal]);
  const etapasPipeline = useMemo(
    () => etapas.filter(e => e.pipeline_id === deal?.pipeline_id).sort((a, b) => a.ordem - b.ordem),
    [etapas, deal]
  );
  const pipeline = useMemo(() => pipelines.find(p => p.id === deal?.pipeline_id), [pipelines, deal]);
  const responsavel = useMemo(() => profiles.find(p => p.user_id === deal?.responsavel_id), [profiles, deal]);

  // ---------- Mutações ----------
  const patch = async (changes: Record<string, any>) => {
    if (!id) return;
    const { error } = await supabase.from("oportunidades").update(changes).eq("id", id);
    if (error) { toast.error(error.message); return false; }
    setDeal((d: any) => ({ ...d, ...changes }));
    return true;
  };

  const moverParaEtapa = async (etapa: Etapa) => {
    if (etapa.e_final && etapa.e_ganho) { abrirGanhar(etapa); return; }
    if (etapa.e_final) { abrirPerder(etapa); return; }
    const ok = await patch({ etapa_id: etapa.id, probabilidade: etapa.probabilidade_default });
    if (ok) toast.success(`Movido para ${etapa.nome}`);
  };

  const abrirGanhar = (_et?: Etapa) => {
    const et = _et || etapasPipeline.find(e => e.e_final && e.e_ganho);
    if (!et) { toast.error("Nenhuma etapa final 'ganha' configurada"); return; }
    setWinData({
      data_real: new Date().toISOString().slice(0, 10),
      valor_final: deal.valor_estimado || 0,
      observacoes: "",
    });
    setWinDialog(true);
  };

  const confirmarGanhar = async () => {
    const et = etapasPipeline.find(e => e.e_final && e.e_ganho);
    if (!et) return;
    const obsNova = winData.observacoes
      ? `${deal.observacoes ? deal.observacoes + "\n\n" : ""}[Ganha ${winData.data_real}] ${winData.observacoes}`
      : deal.observacoes;
    const ok = await patch({
      etapa_id: et.id,
      status: "ganha",
      data_fechamento_real: winData.data_real,
      valor_estimado: winData.valor_final,
      probabilidade: 100,
      observacoes: obsNova,
    });
    if (!ok) return;
    setWinDialog(false);

    // Warnings não bloqueantes
    const temDecisor = oppPessoas.some(op => op.papel === "decisor");
    if (!temDecisor) toast.warning("⚠️ Sem pessoa decisora vinculada");
    if (!deal.proposta_id) toast.warning("⚠️ Sem proposta vinculada");

    toast.success("🎉 Marcada como Ganha!");
    setPostWinDialog(true);
    carregar();
  };

  const abrirPerder = (_et?: Etapa) => {
    const et = _et || etapasPipeline.find(e => e.e_final && !e.e_ganho);
    if (!et) { toast.error("Nenhuma etapa final 'perdida' configurada"); return; }
    setLoseData({ motivo: "", motivo_outro: "", concorrente: "", observacoes: "" });
    setLoseDialog(true);
  };

  const confirmarPerder = async () => {
    const et = etapasPipeline.find(e => e.e_final && !e.e_ganho);
    if (!et) return;
    if (!loseData.motivo) { toast.error("Selecione o motivo"); return; }
    const motivoFinal = loseData.motivo === "outro" ? loseData.motivo_outro.trim() : loseData.motivo;
    if (!motivoFinal) { toast.error("Descreva o motivo"); return; }
    const obsNova = loseData.observacoes
      ? `${deal.observacoes ? deal.observacoes + "\n\n" : ""}[Perdida] ${loseData.observacoes}`
      : deal.observacoes;
    const ok = await patch({
      etapa_id: et.id,
      status: "perdida",
      data_fechamento_real: new Date().toISOString().slice(0, 10),
      probabilidade: 0,
      motivo_perda: motivoFinal,
      concorrente_vencedor: loseData.concorrente || null,
      observacoes: obsNova,
    });
    if (ok) {
      toast.success("Marcada como Perdida");
      setLoseDialog(false);
      carregar();
    }
  };

  const confirmarReabrir = async () => {
    const ordemAtual = etapaAtual?.ordem ?? 0;
    const anterior = [...etapasPipeline]
      .filter(e => !e.e_final && e.ordem < ordemAtual)
      .sort((a, b) => b.ordem - a.ordem)[0]
      || etapasPipeline.find(e => !e.e_final);
    if (!anterior) { toast.error("Sem etapa anterior disponível"); return; }
    const obsNova = reabrirObs
      ? `${deal.observacoes ? deal.observacoes + "\n\n" : ""}[Reaberta] ${reabrirObs}`
      : deal.observacoes;
    const ok = await patch({
      etapa_id: anterior.id,
      status: "aberta",
      data_fechamento_real: null,
      motivo_perda: null,
      probabilidade: anterior.probabilidade_default,
      observacoes: obsNova,
    });
    if (ok) {
      toast.success("Oportunidade reaberta");
      setReabrirDialog(false);
      setReabrirObs("");
      carregar();
    }
  };

  const excluir = async () => {
    await supabase.from("oportunidade_pessoas").delete().eq("oportunidade_id", id!);
    const { error } = await supabase.from("oportunidades").delete().eq("id", id!);
    if (error) { toast.error(error.message); return; }
    toast.success("Excluída");
    navigate("/crm");
  };

  const duplicar = async () => {
    if (!deal) return;
    const { id: _, created_at, updated_at, ...rest } = deal;
    const { data, error } = await supabase
      .from("oportunidades")
      .insert({ ...rest, titulo: `${rest.titulo} (cópia)`, status: "aberta" })
      .select("id").single();
    if (error) { toast.error(error.message); return; }
    toast.success("Duplicada");
    navigate(`/crm/deal/${data!.id}`);
  };

  const moverPipeline = async () => {
    if (!novoPipeline || !novaEtapa) return;
    const ok = await patch({ pipeline_id: novoPipeline, etapa_id: novaEtapa });
    if (ok) { toast.success("Pipeline alterado"); setMoveDialog(false); carregar(); }
  };

  const removerPessoa = async (linkId: string) => {
    await supabase.from("oportunidade_pessoas").delete().eq("id", linkId);
    setOppPessoas(oppPessoas.filter(o => o.id !== linkId));
  };

  const updatePapel = async (linkId: string, papel: string) => {
    await supabase.from("oportunidade_pessoas").update({ papel }).eq("id", linkId);
    setOppPessoas(oppPessoas.map(o => o.id === linkId ? { ...o, papel } : o));
  };

  const addPessoa = async () => {
    if (!pessoaSel) return;
    const { data, error } = await supabase
      .from("oportunidade_pessoas")
      .insert({ oportunidade_id: id, pessoa_id: pessoaSel, papel: papelSel })
      .select("id, papel, pessoa_id, pessoas(id, nome, cargo, email)").single();
    if (error) { toast.error(error.message); return; }
    setOppPessoas([...oppPessoas, data]);
    setAddPessoaDialog(false);
    setPessoaSel("");
  };

  const uploadArquivo = async (file: File) => {
    const path = `${id}/${Date.now()}_${file.name}`;
    const { error } = await supabase.storage.from("deal-files").upload(path, file);
    if (error) { toast.error(error.message); return; }
    toast.success("Arquivo enviado");
    const { data } = await supabase.storage.from("deal-files").list(id!, { limit: 100 });
    setArquivos(data || []);
  };

  const baixarArquivo = async (name: string) => {
    const { data } = await supabase.storage.from("deal-files").createSignedUrl(`${id}/${name}`, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const removerArquivo = async (name: string) => {
    await supabase.storage.from("deal-files").remove([`${id}/${name}`]);
    setArquivos(arquivos.filter(a => a.name !== name));
  };

  const carregarPropostas = async () => {
    const { data } = await supabase.from("propostas").select("id, numero_proposta, nome_cliente, total_10_anos").order("created_at", { ascending: false }).limit(50);
    setPropostasDisponiveis(data || []);
  };

  const vincularProposta = async (pid: string) => {
    await patch({ proposta_id: pid });
    toast.success("Proposta vinculada");
    setVincPropDialog(false);
    carregar();
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!deal) return <div className="p-8">Não encontrado.</div>;

  const statusColor = deal.status === "ganha" ? "bg-emerald-600" : deal.status === "perdida" ? "bg-rose-600" : "bg-blue-600";
  const idxAtual = etapasPipeline.findIndex(e => e.id === deal.etapa_id);

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />

      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Link to="/crm" className="hover:text-foreground">CRM</Link>
              <ChevronRight className="w-4 h-4" />
              <span>{pipeline?.nome}</span>
              <ChevronRight className="w-4 h-4" />
              <span className="truncate text-foreground font-medium">{deal.titulo}</span>
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold truncate">{deal.titulo}</h1>
              <Badge className={`${statusColor} text-white text-sm px-3 py-1`}>{deal.status}</Badge>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon"><MoreHorizontal className="w-4 h-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={duplicar}>Duplicar deal</DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setNovoPipeline(deal.pipeline_id); setNovaEtapa(deal.etapa_id); setMoveDialog(true); }}>
                Mover de Pipeline
              </DropdownMenuItem>
              {deal.status !== "aberta" && (
                <DropdownMenuItem onClick={() => setReabrirDialog(true)}>Reabrir</DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-rose-600" onClick={() => setDelDialog(true)}>Excluir</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* 3 colunas */}
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr_320px] gap-4 p-4">
        {/* ESQUERDA */}
        <div className="space-y-4 lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
          <Card>
            <CardHeader><CardTitle className="text-base">Detalhes do Deal</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Field label="Título">
                <Input defaultValue={deal.titulo} onBlur={(e) => e.target.value !== deal.titulo && patch({ titulo: e.target.value })} />
              </Field>
              <Field label="Valor (BRL)">
                <Input type="number" defaultValue={deal.valor_estimado}
                  onBlur={(e) => patch({ valor_estimado: Number(e.target.value) })} />
                <div className="text-xs text-muted-foreground mt-1">{fmtBRL(deal.valor_estimado)}</div>
              </Field>
              <Field label={`Probabilidade: ${deal.probabilidade}%`}>
                <Slider value={[deal.probabilidade]} max={100} step={5}
                  onValueChange={(v) => setDeal({ ...deal, probabilidade: v[0] })}
                  onValueCommit={(v) => patch({ probabilidade: v[0] })} />
              </Field>
              <Field label="Data fechamento prevista">
                <Input type="date" defaultValue={deal.data_fechamento_prevista || ""}
                  onBlur={(e) => patch({ data_fechamento_prevista: e.target.value || null })} />
              </Field>
              <Field label="Responsável">
                <Select value={deal.responsavel_id || ""} onValueChange={(v) => patch({ responsavel_id: v })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {profiles.map(p => <SelectItem key={p.user_id} value={p.user_id}>{p.nome || p.email}</SelectItem>)}
                  </SelectContent>
                </Select>
                {responsavel && (
                  <div className="flex items-center gap-2 mt-2">
                    <Avatar className="w-6 h-6"><AvatarFallback className="text-xs">{(responsavel.nome || responsavel.email).slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
                    <span className="text-sm">{responsavel.nome || responsavel.email}</span>
                  </div>
                )}
              </Field>
              <Field label="Pipeline">
                <Select value={deal.pipeline_id} onValueChange={async (v) => {
                  const primEt = etapas.find(e => e.pipeline_id === v);
                  if (primEt) await patch({ pipeline_id: v, etapa_id: primEt.id });
                }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{pipelines.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Etapa">
                <Select value={deal.etapa_id} onValueChange={(v) => {
                  const et = etapas.find(e => e.id === v);
                  if (et) moverParaEtapa(et);
                }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{etapasPipeline.map(e => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}</SelectContent>
                </Select>
              </Field>

              <Collapsible open={historicoOpen} onOpenChange={setHistoricoOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="w-full justify-between">
                    <span className="flex items-center gap-2"><History className="w-4 h-4" />Histórico ({historico.length})</span>
                    <ChevronDown className={`w-4 h-4 transition-transform ${historicoOpen ? "rotate-180" : ""}`} />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 space-y-2 max-h-64 overflow-y-auto">
                  {historico.map(h => (
                    <div key={h.id} className="text-xs border-l-2 border-primary/30 pl-2 py-1">
                      <div className="font-medium">{h.tipo_mudanca}</div>
                      <div className="text-muted-foreground">{format(new Date(h.created_at), "dd/MM HH:mm", { locale: ptBR })}</div>
                    </div>
                  ))}
                  {historico.length === 0 && <div className="text-xs text-muted-foreground">Sem registros.</div>}
                </CollapsibleContent>
              </Collapsible>
            </CardContent>
          </Card>

          {org && (
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Building2 className="w-4 h-4" />Organização</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Link to={`/organizacoes/${org.id}`} className="font-medium text-primary hover:underline flex items-center gap-1">
                  {org.nome} <ExternalLink className="w-3 h-3" />
                </Link>
                {org.segmento && <div className="text-muted-foreground">{org.segmento}</div>}
                {oppPessoas[0]?.pessoas && (
                  <div className="text-xs">Contato principal: <span className="font-medium">{oppPessoas[0].pessoas.nome}</span></div>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">Pessoas Envolvidas</CardTitle>
              <Button size="sm" variant="ghost" onClick={() => setAddPessoaDialog(true)}><Plus className="w-4 h-4" /></Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {oppPessoas.map(op => (
                <div key={op.id} className="flex items-center gap-2 p-2 rounded border">
                  <Avatar className="w-7 h-7"><AvatarFallback className="text-xs">{(op.pessoas?.nome || "?").slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{op.pessoas?.nome}</div>
                    <Select value={op.papel || ""} onValueChange={(v) => updatePapel(op.id, v)}>
                      <SelectTrigger className="h-6 text-xs border-0 p-0"><SelectValue placeholder="papel" /></SelectTrigger>
                      <SelectContent>{PAPEIS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removerPessoa(op.id)}><Trash2 className="w-3 h-3" /></Button>
                </div>
              ))}
              {oppPessoas.length === 0 && <div className="text-sm text-muted-foreground">Nenhuma pessoa.</div>}
            </CardContent>
          </Card>
        </div>

        {/* CENTRO */}
        <div className="space-y-4 min-w-0">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-1 overflow-x-auto pb-2">
                {etapasPipeline.map((et, i) => {
                  const passou = i < idxAtual;
                  const ativo = i === idxAtual;
                  return (
                    <button key={et.id} onClick={() => moverParaEtapa(et)}
                      className={`flex-1 min-w-[100px] px-3 py-2 text-xs font-medium border-2 transition-all relative
                        ${ativo ? "bg-primary text-primary-foreground border-primary" :
                          passou ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/30" :
                          "bg-muted text-muted-foreground border-border hover:bg-muted/70"}`}
                      style={{ clipPath: i === 0 ? "polygon(0 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 0 100%)" :
                                          i === etapasPipeline.length - 1 ? "polygon(0 0, 100% 0, 100% 100%, 0 100%, 10px 50%)" :
                                          "polygon(0 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 0 100%, 10px 50%)" }}>
                      <div className="truncate">{et.nome}</div>
                      {et.e_ganho && <Trophy className="w-3 h-3 absolute top-1 right-3" />}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-2 mt-4">
                <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => abrirGanhar()}>
                  <Trophy className="w-4 h-4 mr-2" />Marcar Ganha
                </Button>
                <Button variant="destructive" className="flex-1" onClick={() => abrirPerder()}>
                  <X className="w-4 h-4 mr-2" />Marcar Perdida
                </Button>
              </div>
            </CardContent>
          </Card>

          <Tabs defaultValue="atividades">
            <TabsList>
              <TabsTrigger value="atividades">Atividades</TabsTrigger>
              <TabsTrigger value="notas">Notas</TabsTrigger>
              <TabsTrigger value="arquivos">Arquivos</TabsTrigger>
              <TabsTrigger value="propostas">Propostas</TabsTrigger>
              <TabsTrigger value="historico">Histórico</TabsTrigger>
            </TabsList>

            <TabsContent value="atividades">
              <Card><CardContent className="py-12 text-center text-muted-foreground">
                Em breve (Sprint 5).
              </CardContent></Card>
            </TabsContent>

            <TabsContent value="notas">
              <Card><CardContent className="pt-6">
                <Textarea rows={12} placeholder="Notas em markdown..." defaultValue={deal.notas || ""}
                  onBlur={(e) => patch({ notas: e.target.value })} />
              </CardContent></Card>
            </TabsContent>

            <TabsContent value="arquivos">
              <Card><CardContent className="pt-6 space-y-3">
                <label className="block">
                  <input type="file" className="hidden"
                    onChange={(e) => e.target.files?.[0] && uploadArquivo(e.target.files[0])} />
                  <div className="border-2 border-dashed rounded p-6 text-center cursor-pointer hover:bg-muted">
                    <Upload className="w-6 h-6 mx-auto mb-2 text-muted-foreground" />
                    <span className="text-sm">Clique para enviar arquivo</span>
                  </div>
                </label>
                <div className="space-y-1">
                  {arquivos.map(a => (
                    <div key={a.name} className="flex items-center gap-2 p-2 border rounded">
                      <FileText className="w-4 h-4" />
                      <button className="text-sm text-primary hover:underline flex-1 text-left truncate" onClick={() => baixarArquivo(a.name)}>
                        {a.name.replace(/^\d+_/, "")}
                      </button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removerArquivo(a.name)}><Trash2 className="w-3 h-3" /></Button>
                    </div>
                  ))}
                  {arquivos.length === 0 && <div className="text-sm text-muted-foreground text-center py-4">Sem arquivos.</div>}
                </div>
              </CardContent></Card>
            </TabsContent>

            <TabsContent value="propostas">
              <Card><CardContent className="pt-6 space-y-3">
                {proposta ? (
                  <div className="border rounded p-4">
                    <div className="font-medium">{proposta.numero_proposta || "Proposta"}</div>
                    <div className="text-sm text-muted-foreground">{proposta.nome_cliente}</div>
                    <div className="text-sm">{fmtBRL(proposta.total_10_anos || 0)}</div>
                    <Button variant="outline" size="sm" className="mt-2" onClick={() => patch({ proposta_id: null }).then(carregar)}>
                      Desvincular
                    </Button>
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <p className="text-muted-foreground mb-3">Nenhuma proposta vinculada.</p>
                    <Button onClick={() => { carregarPropostas(); setVincPropDialog(true); }}>Vincular proposta</Button>
                  </div>
                )}
              </CardContent></Card>
            </TabsContent>

            <TabsContent value="historico">
              <Card><CardContent className="pt-6 space-y-2">
                {historico.map(h => (
                  <div key={h.id} className="flex gap-3 text-sm border-b pb-2">
                    <div className="text-xs text-muted-foreground w-32 shrink-0">
                      {format(new Date(h.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                    </div>
                    <div className="flex-1">
                      <Badge variant="outline" className="mr-2">{h.tipo_mudanca}</Badge>
                      {h.valor_anterior && <span className="text-muted-foreground line-through mr-2">{JSON.stringify(h.valor_anterior).slice(0, 40)}</span>}
                      {h.valor_novo && <span>→ {JSON.stringify(h.valor_novo).slice(0, 40)}</span>}
                    </div>
                  </div>
                ))}
                {historico.length === 0 && <div className="text-sm text-muted-foreground text-center py-4">Sem histórico.</div>}
              </CardContent></Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* DIREITA */}
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Próximas Atividades</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground py-6 text-center">Em breve.</CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Atividades Concluídas</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground py-6 text-center">Em breve.</CardContent>
          </Card>
        </div>
      </div>

      {/* Dialog: GANHAR */}
      <Dialog open={winDialog} onOpenChange={setWinDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>🎉 Marcar como Ganha</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="Data de fechamento real">
              <Input type="date" value={winData.data_real}
                onChange={(e) => setWinData({ ...winData, data_real: e.target.value })} />
            </Field>
            <Field label="Valor final (BRL)">
              <Input type="number" value={winData.valor_final}
                onChange={(e) => setWinData({ ...winData, valor_final: Number(e.target.value) })} />
              <div className="text-xs text-muted-foreground mt-1">{fmtBRL(winData.valor_final)}</div>
            </Field>
            <Field label="Observações">
              <Textarea value={winData.observacoes}
                onChange={(e) => setWinData({ ...winData, observacoes: e.target.value })} />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWinDialog(false)}>Cancelar</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={confirmarGanhar}>Confirmar Ganho</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: pós-ganho */}
      <Dialog open={postWinDialog} onOpenChange={setPostWinDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>🏆 Deal ganho! E agora?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Button variant="outline" className="w-full justify-start" onClick={() => { carregarPropostas(); setPostWinDialog(false); setVincPropDialog(true); }}>
              <FileText className="w-4 h-4 mr-2" />Vincular proposta existente
            </Button>
            <Button variant="outline" className="w-full justify-start" onClick={() => navigate(`/orcamento?oportunidade=${id}`)}>
              <Plus className="w-4 h-4 mr-2" />Criar proposta
            </Button>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPostWinDialog(false)}>Depois</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: PERDER */}
      <Dialog open={loseDialog} onOpenChange={setLoseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marcar como Perdida</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="Motivo da perda *">
              <Select value={loseData.motivo} onValueChange={(v) => setLoseData({ ...loseData, motivo: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="preço">Preço</SelectItem>
                  <SelectItem value="timing">Timing</SelectItem>
                  <SelectItem value="concorrência">Concorrência</SelectItem>
                  <SelectItem value="sem orçamento">Sem orçamento</SelectItem>
                  <SelectItem value="sem fit técnico">Sem fit técnico</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {loseData.motivo === "outro" && (
              <Field label="Descreva o motivo *">
                <Input value={loseData.motivo_outro}
                  onChange={(e) => setLoseData({ ...loseData, motivo_outro: e.target.value })} />
              </Field>
            )}
            <Field label="Concorrente vencedor (opcional)">
              <Input value={loseData.concorrente}
                onChange={(e) => setLoseData({ ...loseData, concorrente: e.target.value })} />
            </Field>
            <Field label="Observações">
              <Textarea value={loseData.observacoes}
                onChange={(e) => setLoseData({ ...loseData, observacoes: e.target.value })} />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLoseDialog(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmarPerder}>Confirmar Perda</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: REABRIR */}
      <Dialog open={reabrirDialog} onOpenChange={setReabrirDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reabrir oportunidade</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="Observação (opcional)">
              <Textarea value={reabrirObs} onChange={(e) => setReabrirObs(e.target.value)}
                placeholder="Por que está sendo reaberta?" />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReabrirDialog(false)}>Cancelar</Button>
            <Button onClick={confirmarReabrir}>Reabrir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: excluir */}
      <AlertDialog open={delDialog} onOpenChange={setDelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir oportunidade?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={excluir} className="bg-rose-600 hover:bg-rose-700">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog: mover de pipeline */}
      <Dialog open={moveDialog} onOpenChange={setMoveDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Mover de Pipeline</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Field label="Pipeline">
              <Select value={novoPipeline} onValueChange={(v) => { setNovoPipeline(v); const e = etapas.find(x => x.pipeline_id === v); if (e) setNovaEtapa(e.id); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{pipelines.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Etapa">
              <Select value={novaEtapa} onValueChange={setNovaEtapa}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {etapas.filter(e => e.pipeline_id === novoPipeline).map(e => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveDialog(false)}>Cancelar</Button>
            <Button onClick={moverPipeline}>Mover</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: adicionar pessoa */}
      <Dialog open={addPessoaDialog} onOpenChange={setAddPessoaDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Adicionar Pessoa</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Field label="Pessoa">
              <Select value={pessoaSel} onValueChange={setPessoaSel}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {pessoasOrg.filter(p => !oppPessoas.some(op => op.pessoa_id === p.id))
                    .map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Papel">
              <Select value={papelSel} onValueChange={setPapelSel}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PAPEIS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddPessoaDialog(false)}>Cancelar</Button>
            <Button onClick={addPessoa}>Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: vincular proposta */}
      <Dialog open={vincPropDialog} onOpenChange={setVincPropDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Vincular Proposta</DialogTitle></DialogHeader>
          <div className="max-h-96 overflow-y-auto space-y-1">
            {propostasDisponiveis.map(p => (
              <button key={p.id} onClick={() => vincularProposta(p.id)}
                className="w-full text-left p-3 border rounded hover:bg-muted">
                <div className="font-medium">{p.numero_proposta || "—"} • {p.nome_cliente}</div>
                <div className="text-sm text-muted-foreground">{fmtBRL(p.total_10_anos || 0)}</div>
              </button>
            ))}
            {propostasDisponiveis.length === 0 && <div className="text-sm text-muted-foreground text-center py-4">Nenhuma proposta.</div>}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
