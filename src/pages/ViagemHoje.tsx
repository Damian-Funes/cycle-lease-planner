import { useMemo, useState } from "react";
import { sincronizarPendencias } from "@/lib/sincronizarPendencias";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, BedDouble, Flag, Home as HomeIcon, Map, Navigation, Plus } from "lucide-react";
import { atualizarParada, atualizarRota, getParadas, getRota, type RotaParada } from "@/lib/rotas";
import { diaRota, hojeRota, paradaInformada } from "@/lib/rotasFluxo";
import { agruparPorDiaRealizado, diasDaViagem, noitesDaViagem, noitesSemRegistro, ordenarParadasViagem, TIPOS_NOITE } from "@/lib/viagem";
import { coordenadaValida, linkWaze } from "@/lib/rotaNavegacao";
import { listDiario, listDiasSemVisita, listGastos, listPernoites, marcarDiaSemVisita, MOTIVOS_SEM_VISITA, voltarParaBase, type MotivoSemVisita } from "@/lib/viagemDados";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { podeEscreverDiario, podeLancarGasto } from "@/lib/viagemDiario";
import { formatBRL } from "@/lib/smartcycle";
import { useAuth } from "@/hooks/useAuth";
import PrestacaoParada from "@/components/rotas/PrestacaoParada";
import InformativoDialog from "@/components/viagens/InformativoDialog";
import DiarioTimeline from "@/components/viagens/DiarioTimeline";
import GastosViagem from "@/components/viagens/GastosViagem";
import RelatorioDiaDialog from "@/components/viagens/RelatorioDiaDialog";
import JuliaContatoCard from "@/components/viagens/JuliaContatoCard";
import NotasHotelPendentes from "@/components/viagens/NotasHotelPendentes";
import NotificacoesSino from "@/components/NotificacoesSino";

const nomeParada = (p: RotaParada) => p.organizacao?.nome_fantasia || p.organizacao?.nome || p.cidade || "Parada";

export default function ViagemHoje() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user, isAdmin } = useAuth();
  const hoje = hojeRota();
  const [aba, setAba] = useState<"pendentes" | "hoje" | "historico">("pendentes");
  const [infoOpen, setInfoOpen] = useState(false);
  const [infoParada, setInfoParada] = useState<string | null>(null);
  const [noiteOpen, setNoiteOpen] = useState(false);
  const [noiteSel, setNoiteSel] = useState<string>("");
  const [baseOpen, setBaseOpen] = useState(false);
  const [baseObs, setBaseObs] = useState("");
  const [encerrarOpen, setEncerrarOpen] = useState(false);
  const [motivos, setMotivos] = useState<Record<string, string>>({});
  const [mesmoMotivo, setMesmoMotivo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [semVisitaDia, setSemVisitaDia] = useState<string | null>(null);
  const [semVisitaMotivo, setSemVisitaMotivo] = useState<MotivoSemVisita>("deslocamento");
  const [semVisitaObs, setSemVisitaObs] = useState("");

  const { data: rota, isLoading } = useQuery({ queryKey: ["rota", id], queryFn: () => getRota(id), enabled: !!id });
  const { data: brutas = [] } = useQuery({ queryKey: ["rota-paradas", id], queryFn: () => getParadas(id), enabled: !!id });
  const { data: diario = [] } = useQuery({ queryKey: ["rota-diario", id], queryFn: () => listDiario(id), enabled: !!id });
  const { data: gastos = [] } = useQuery({ queryKey: ["rota-gastos", id], queryFn: () => listGastos(id), enabled: !!id });
  const { data: pernoites = [] } = useQuery({ queryKey: ["rota-pernoites", id], queryFn: () => listPernoites(id), enabled: !!id });
  const { data: diasSemVisita = [] } = useQuery({ queryKey: ["rota-dias-sem-visita", id], queryFn: () => listDiasSemVisita(id), enabled: !!id });
  const inicio = rota?.data_inicio ?? rota?.data_rota ?? hoje;
  const fim = rota?.data_fim ?? inicio;
  const paradas = useMemo(() => ordenarParadasViagem(brutas), [brutas]);
  const pendentes = paradas.filter((p) => !paradaInformada(p));
  const dias = diasDaViagem(inicio, fim);
  const noites = noitesDaViagem(inicio, fim);
  const faltam = noitesSemRegistro(inicio, fim, pernoites.map((p) => p.noite));
  const historico = useMemo(() => agruparPorDiaRealizado(dias.filter((d) => d <= hoje), paradas, diario, gastos, pernoites).reverse(), [dias.join(), hoje, paradas, diario, gastos, pernoites]);
  const doDia = historico.find((h) => h.dia === hoje);
  const recarregar = () => { ["rota", "rota-paradas", "rota-pernoites", "rota-gastos", "rota-dias-sem-visita"].forEach((k) => qc.invalidateQueries({ queryKey: [k, id] })); if (id) sincronizarPendencias(id); };

  if (isLoading) return <p className="p-6 text-muted-foreground">Carregando...</p>;
  if (!rota) return <p className="p-6">Viagem não encontrada.</p>;
  const dono = rota.vendedor_id === user?.id;
  const escreve = dono && podeEscreverDiario(rota, hoje);
  const prestacao = rota.status === "aprovada" && inicio <= hoje && (dono || isAdmin);
  const registraNoite = rota.status === "aprovada" && inicio <= hoje && ((dono && podeLancarGasto(rota)) || isAdmin);
  // sugestão de cidade: última parada feita
  const ultimaFeita = [...paradas].filter((p) => p.visitada != null).sort((a, b) => String(a.informada_em).localeCompare(String(b.informada_em))).pop();
  const noitesAbertas = noites.filter((n) => n <= hoje);
  const restantes = faltam.filter((n) => n >= hoje);
  // Dias anteriores sem nenhuma parada informada e ainda não marcados "sem visita" (mesma regra da Júlia).
  const marcaSemVisita = (d: string) => diasSemVisita.find((x) => x.dia === d);
  const diasSemRegistro = dias.filter((d) => d < hoje && !paradas.some((p) => p.dia === d && p.visitada != null) && !marcaSemVisita(d));
  const podeMarcarSemVisita = rota.status === "aprovada" && escreve;
  async function salvarSemVisita() {
    if (!semVisitaDia) return;
    if (semVisitaMotivo === "outro" && !semVisitaObs.trim()) { toast.error("Explique o motivo."); return; }
    setBusy(true);
    try { await marcarDiaSemVisita(id, semVisitaDia, semVisitaMotivo, semVisitaObs); toast.success(`${diaRota(semVisitaDia)} marcado como dia sem visita.`); setSemVisitaDia(null); recarregar(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível salvar."); }
    finally { setBusy(false); }
  }
  const abrirSemVisita = (d: string) => { setSemVisitaDia(d); setSemVisitaMotivo("deslocamento"); setSemVisitaObs(""); };

  function abrirNoite(n?: string) {
    setNoiteSel(n ?? (noites.includes(hoje) ? hoje : faltam[0] ?? noites[noites.length - 1]));
    setNoiteOpen(true);
  }
  async function voltei() {
    if (!baseObs.trim()) { toast.error("Explique por que voltou antes do fim."); return; }
    setBusy(true);
    try { await voltarParaBase(id, restantes, baseObs); toast.success("Noites restantes registradas"); setBaseOpen(false); recarregar(); setEncerrarOpen(true); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  async function encerrar() {
    const semMotivo = pendentes.filter((p) => !(mesmoMotivo ? motivos._todos : motivos[p.id])?.trim());
    if (semMotivo.length) { toast.error(`Informe o motivo de não visita: ${semMotivo.map(nomeParada).join(", ")}.`); return; }
    if (faltam.length) { toast.error(`Registre onde dormiu na noite de ${diaRota(faltam[0])}.`); return; }
    if (!gastos.length && !window.confirm("Nenhum gasto foi lançado nesta viagem. Encerrar mesmo assim?")) return;
    setBusy(true);
    try {
      for (const p of pendentes) await atualizarParada(p.id, { visitada: false, motivo_nao_visita: (mesmoMotivo ? motivos._todos : motivos[p.id]).trim() });
      await atualizarRota(id, { status: "concluida" } as any);
      toast.success("Viagem encerrada — prestação de contas concluída");
      setEncerrarOpen(false); recarregar();
      navigate(`/viagens/${id}/acompanhar`);
    } catch (e) { toast.error((e as Error).message); recarregar(); } finally { setBusy(false); }
  }

  const cardParada = (p: RotaParada) => (
    <Card key={p.id} className={`p-4 space-y-2 ${paradaInformada(p) ? "border-primary/50" : ""}`}>
      <div className="flex items-start gap-3">
        <span className="w-8 h-8 shrink-0 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">{paradas.indexOf(p) + 1}</span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-base">{nomeParada(p)}</p>
          <p className="text-sm text-muted-foreground">{[p.cidade, p.estado].filter(Boolean).join(" / ")}</p>
          {p.objetivo && <p className="text-sm mt-1">{p.objetivo}</p>}
        </div>
      </div>
      <div className="flex gap-2">
        {coordenadaValida(p.latitude, p.longitude) && <Button asChild variant="outline" size="lg" className="flex-1 h-12"><a href={linkWaze({ lat: Number(p.latitude), lng: Number(p.longitude) })} target="_blank" rel="noreferrer"><Navigation className="w-5 h-5 mr-1" />Waze</a></Button>}
        {escreve && <Button variant="outline" size="lg" className="flex-1 h-12" onClick={() => { setInfoParada(p.id); setInfoOpen(true); }}><Plus className="w-5 h-5 mr-1" />Informativo</Button>}
      </div>
      {prestacao && <PrestacaoParada parada={p} onSaved={recarregar} grande />}
      {!prestacao && p.visitada != null && <p className="text-sm">{p.visitada ? `Visitada — ${p.resultado}` : `Não visitada — ${p.motivo_nao_visita}`}</p>}
    </Card>
  );

  const resumoNoite = (n: (typeof pernoites)[number] | null) => n
    ? `${TIPOS_NOITE.find((t) => t.id === n.tipo)?.nome}${n.cidade ? ` · ${n.cidade}/${n.estado}` : ""}${n.hotel_nome ? ` · ${n.hotel_nome}` : ""}${n.observacao ? ` · ${n.observacao}` : ""}`
    : null;

  return (
    <div className="min-h-screen bg-muted/20 pb-28">
      <header className="sticky top-0 z-10 bg-background border-b px-3 py-2 flex items-center gap-2">
        <Button variant="ghost" size="icon" aria-label="Voltar" onClick={() => navigate(`/rotas/${id}`)}><ArrowLeft className="w-5 h-5" /></Button>
        <div className="flex-1 min-w-0">
          <h1 className="font-semibold leading-tight">Viagem de hoje</h1>
          <p className="text-xs text-muted-foreground">{paradas.length - pendentes.length} de {paradas.length} paradas informadas{noites.length ? ` · ${noites.length - faltam.length} de ${noites.length} noites` : ""}</p>
        </div>
        <NotificacoesSino />
        <Button variant="outline" size="sm" onClick={() => navigate(`/viagens/${id}/acompanhar`)}><Map className="w-4 h-4 mr-1" />Acompanhar</Button>
      </header>
      <main className="max-w-xl mx-auto p-3 space-y-3">
        {dono && rota.status === "aprovada" && <JuliaContatoCard rotaId={id} />}
        <NotasHotelPendentes rotaId={id} pernoites={pernoites} gastos={gastos} editavel={(dono && podeLancarGasto(rota)) || isAdmin} />
        {rota.status !== "aprovada" && <Card className="p-3 text-sm">Esta viagem não está aprovada — a prestação e o diário ficam disponíveis só em viagens aprovadas.</Card>}
        {registraNoite && faltam.some((n) => n < hoje) && (
          <Card className="p-3 text-sm border-warning/50 bg-warning/10">Falta registrar onde dormiu em {faltam.filter((n) => n < hoje).map(diaRota).join(", ")}. <Button variant="link" className="p-0 h-auto" onClick={() => abrirNoite(faltam[0])}>Registrar agora</Button></Card>
        )}
        {podeMarcarSemVisita && diasSemRegistro.length > 0 && (
          <Card className="p-3 text-sm border-warning/50 bg-warning/10 space-y-2">
            <p>Sem visita registrada em {diasSemRegistro.map(diaRota).join(", ")}. Informe as visitas na parada ou, se foi só deslocamento/folga, marque o dia.</p>
            <div className="flex flex-wrap gap-2">
              {diasSemRegistro.map((d) => <Button key={d} size="sm" variant="outline" onClick={() => abrirSemVisita(d)}>Dia sem visita · {diaRota(d)}</Button>)}
            </div>
          </Card>
        )}
        <div className="grid grid-cols-3 gap-1 rounded-md bg-muted p-1">
          {([["pendentes", `Pendentes (${pendentes.length})`], ["hoje", "Hoje"], ["historico", "Histórico"]] as const).map(([k, t]) => (
            <Button key={k} variant={aba === k ? "default" : "ghost"} size="sm" onClick={() => setAba(k)}>{t}</Button>
          ))}
        </div>

        {aba === "pendentes" && <>
          {!pendentes.length && <Card className="p-4 text-sm text-muted-foreground">Todas as paradas foram informadas.</Card>}
          {pendentes.map(cardParada)}
        </>}

        {aba === "hoje" && <>
          <Card className="p-4 space-y-2">
            <p className="font-semibold">{diaRota(hoje)} — o que foi feito</p>
            {doDia?.paradas.length ? <ul className="text-sm space-y-1">{doDia.paradas.map((p) => <li key={p.id}>{p.visitada ? "✓" : "✗"} {nomeParada(p)} — {p.visitada ? p.resultado : p.motivo_nao_visita}</li>)}</ul> : <p className="text-sm text-muted-foreground">Nenhuma parada informada hoje.</p>}
            {doDia && doDia.gastos.length > 0 && <p className="text-sm">Gastos de hoje: {formatBRL(doDia.gastos.reduce((s, g) => s + Number(g.valor), 0))}</p>}
            {noites.includes(hoje) && <p className="text-sm">Onde dormi hoje: {resumoNoite(doDia?.pernoite ?? null) ?? <span className="text-muted-foreground">ainda não registrado</span>}</p>}
          </Card>
          {registraNoite && noitesAbertas.length > 0 && <Button size="lg" className="w-full h-14 text-base" onClick={() => abrirNoite()}><BedDouble className="w-5 h-5 mr-2" />Fechar o dia: onde dormi</Button>}
          {registraNoite && restantes.length > 0 && <Button size="lg" variant="outline" className="w-full h-12" onClick={() => { setBaseObs(""); setBaseOpen(true); }}><HomeIcon className="w-5 h-5 mr-2" />Voltei para a base</Button>}
          {doDia && doDia.informativos.length > 0 && <section className="space-y-2"><h2 className="font-semibold">Informativos de hoje</h2><DiarioTimeline itens={doDia.informativos} paradas={paradas} podeApagar={isAdmin} /></section>}
          {paradas.filter((p) => p.dia === hoje).map(cardParada)}
        </>}

        {aba === "historico" && historico.map((h) => (
          <Card key={h.dia} className="p-4 space-y-1 text-sm">
            <p className="font-semibold">Dia {dias.indexOf(h.dia) + 1} · {diaRota(h.dia)}</p>
            {h.paradas.map((p) => <p key={p.id}>{p.visitada ? "✓" : "✗"} {nomeParada(p)}</p>)}
            {!h.paradas.length && (marcaSemVisita(h.dia)
              ? <p className="text-muted-foreground">Dia sem visita: {MOTIVOS_SEM_VISITA.find(([k]) => k === marcaSemVisita(h.dia)!.motivo)?.[1]}{marcaSemVisita(h.dia)!.observacao ? ` — ${marcaSemVisita(h.dia)!.observacao}` : ""}</p>
              : <p className="flex items-center gap-2 text-muted-foreground">Nenhuma parada informada.
                  {podeMarcarSemVisita && h.dia < hoje && <Button variant="link" className="p-0 h-auto" onClick={() => abrirSemVisita(h.dia)}>marcar dia sem visita</Button>}</p>)}
            {h.informativos.length > 0 && <p className="text-muted-foreground">{h.informativos.length} informativo(s)</p>}
            {h.gastos.length > 0 && <p>Gastos: {formatBRL(h.gastos.reduce((s, g) => s + Number(g.valor), 0))}</p>}
            {noites.includes(h.dia) && <p className="flex items-center gap-2">Noite: {resumoNoite(h.pernoite) ?? <span className="text-destructive">não registrada</span>}
              {registraNoite && <Button variant="link" className="p-0 h-auto" onClick={() => abrirNoite(h.dia)}>{h.pernoite ? "corrigir" : "registrar"}</Button>}</p>}
          </Card>
        ))}

        <GastosViagem rotaId={id} gastos={gastos} editavel={(dono && podeLancarGasto(rota)) || isAdmin} />
        {aba !== "hoje" && <section className="space-y-2">
          <h2 className="font-semibold">Diário de bordo</h2>
          <DiarioTimeline itens={diario} paradas={paradas} podeApagar={isAdmin} />
        </section>}
        {prestacao && <Button size="lg" variant="outline" className="w-full h-12" onClick={() => { setMotivos({}); setMesmoMotivo(false); setEncerrarOpen(true); }}><Flag className="w-5 h-5 mr-2" />Encerrar viagem</Button>}
      </main>

      {escreve && <div className="fixed bottom-0 inset-x-0 p-3 bg-background/95 border-t">
        <Button size="lg" className="w-full h-14 text-lg max-w-xl mx-auto flex" onClick={() => { setInfoParada(null); setInfoOpen(true); }}><Plus className="w-6 h-6 mr-1" />Informativo</Button>
      </div>}
      <InformativoDialog key={`${infoOpen}-${infoParada}`} open={infoOpen} onOpenChange={setInfoOpen} rotaId={id} paradas={paradas} paradaInicial={infoParada}
        onSaved={() => qc.invalidateQueries({ queryKey: ["rota-diario", id] })} />
      <Dialog open={!!semVisitaDia} onOpenChange={(o) => !o && setSemVisitaDia(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Dia sem visita · {semVisitaDia && diaRota(semVisitaDia)}</DialogTitle></DialogHeader>
          <RadioGroup value={semVisitaMotivo} onValueChange={(v) => setSemVisitaMotivo(v as MotivoSemVisita)} className="space-y-1">
            {MOTIVOS_SEM_VISITA.map(([k, t]) => <label key={k} className="flex items-center gap-2 text-sm"><RadioGroupItem value={k} />{t}</label>)}
          </RadioGroup>
          <div className="space-y-1">
            <Label>Observação{semVisitaMotivo === "outro" ? " (obrigatória)" : " (opcional)"}</Label>
            <Textarea value={semVisitaObs} onChange={(e) => setSemVisitaObs(e.target.value)} placeholder="Ex.: viagem de Maringá até Condor" />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSemVisitaDia(null)}>Cancelar</Button>
            <Button disabled={busy} onClick={salvarSemVisita}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {noites.length > 0 && <RelatorioDiaDialog open={noiteOpen} onOpenChange={setNoiteOpen} rotaId={id} noites={noitesAbertas.length ? noitesAbertas : noites} noiteInicial={noiteSel || noites[0]}
        pernoites={pernoites} gastos={gastos} sugestao={ultimaFeita ? { cidade: ultimaFeita.cidade, estado: ultimaFeita.estado } : null} onSaved={recarregar} />}

      <Dialog open={baseOpen} onOpenChange={setBaseOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Voltei para a base</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Registra "voltei para a base" nas noites {restantes.map(diaRota).join(", ")} e abre o encerramento.</p>
          <Label htmlFor="base-obs">Por que voltou antes do fim?</Label>
          <Textarea id="base-obs" value={baseObs} onChange={(e) => setBaseObs(e.target.value)} />
          <DialogFooter><Button size="lg" className="w-full" disabled={busy} onClick={voltei}>Confirmar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={encerrarOpen} onOpenChange={setEncerrarOpen}>
        <DialogContent className="max-w-md max-h-[92vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Encerrar viagem</DialogTitle></DialogHeader>
          {faltam.length > 0 && <p className="text-sm text-destructive">Registre onde dormiu na noite de {diaRota(faltam[0])} antes de encerrar.</p>}
          {pendentes.length > 0 ? <>
            <p className="text-sm">Estas paradas serão marcadas como <b>Não visitei</b>. Informe o motivo:</p>
            {pendentes.length > 1 && <label className="flex items-center gap-2 text-sm"><Checkbox checked={mesmoMotivo} onCheckedChange={(v) => setMesmoMotivo(Boolean(v))} />Mesmo motivo para todas</label>}
            {mesmoMotivo
              ? <Textarea aria-label="Motivo para todas" value={motivos._todos ?? ""} onChange={(e) => setMotivos({ ...motivos, _todos: e.target.value })} />
              : pendentes.map((p) => (
                <div key={p.id} className="space-y-1">
                  <Label htmlFor={`mot-${p.id}`}>{nomeParada(p)}</Label>
                  <Textarea id={`mot-${p.id}`} value={motivos[p.id] ?? ""} onChange={(e) => setMotivos({ ...motivos, [p.id]: e.target.value })} />
                </div>))}
          </> : <p className="text-sm">Todas as paradas foram informadas.</p>}
          <DialogFooter><Button size="lg" className="w-full" disabled={busy || faltam.length > 0} onClick={encerrar}>Encerrar viagem</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
