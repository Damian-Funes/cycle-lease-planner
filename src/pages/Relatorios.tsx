import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, CalendarIcon, TrendingUp, Target, Trophy, DollarSign } from "lucide-react";
import { format, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear, addMonths, subMonths, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  LineChart, Line, PieChart, Pie, Cell, FunnelChart, Funnel, LabelList,
} from "recharts";

const sb: any = supabase;
const fmtBRL = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(n || 0);

type Periodo = "mes" | "trimestre" | "semestre" | "ano" | "custom";

const COLORS = ["#059669", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#10b981", "#ec4899", "#6366f1", "#14b8a6", "#f97316"];

export default function Relatorios() {
  const navigate = useNavigate();
  const [pipelineId, setPipelineId] = useState<string>("todos");
  const [responsavelId, setResponsavelId] = useState<string>("todos");
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [customRange, setCustomRange] = useState<{ from?: Date; to?: Date }>({});

  const [pipelines, setPipelines] = useState<any[]>([]);
  const [vendedores, setVendedores] = useState<any[]>([]);
  const [etapas, setEtapas] = useState<any[]>([]);
  const [tiposAtividade, setTiposAtividade] = useState<any[]>([]);

  const [oportunidades, setOportunidades] = useState<any[]>([]);
  const [forecastView, setForecastView] = useState<any[]>([]);
  const [perfView, setPerfView] = useState<any[]>([]);
  const [motivosView, setMotivosView] = useState<any[]>([]);
  const [tempoEtapaView, setTempoEtapaView] = useState<any[]>([]);
  const [atividades, setAtividades] = useState<any[]>([]);

  const range = useMemo(() => {
    const now = new Date();
    if (periodo === "mes") return { from: startOfMonth(now), to: endOfMonth(now) };
    if (periodo === "trimestre") return { from: startOfQuarter(now), to: endOfQuarter(now) };
    if (periodo === "semestre") {
      const m = now.getMonth();
      const from = m < 6 ? new Date(now.getFullYear(), 0, 1) : new Date(now.getFullYear(), 6, 1);
      const to = m < 6 ? new Date(now.getFullYear(), 5, 30) : new Date(now.getFullYear(), 11, 31);
      return { from, to };
    }
    if (periodo === "ano") return { from: startOfYear(now), to: endOfYear(now) };
    return { from: customRange.from ?? startOfYear(now), to: customRange.to ?? endOfYear(now) };
  }, [periodo, customRange]);

  // catálogos
  useEffect(() => {
    (async () => {
      const [pp, pr, ep, ta] = await Promise.all([
        sb.from("pipelines").select("id, nome, cor").eq("ativo", true).order("ordem"),
        sb.from("profiles").select("user_id, nome, email").eq("status", "approved"),
        sb.from("etapas_pipeline").select("id, nome, cor, ordem, pipeline_id").order("ordem"),
        sb.from("tipos_atividade").select("id, nome, cor, icone").eq("ativo", true).order("ordem"),
      ]);
      setPipelines(pp.data || []);
      setVendedores(pr.data || []);
      setEtapas(ep.data || []);
      setTiposAtividade(ta.data || []);
    })();
  }, []);

  // dados
  useEffect(() => {
    (async () => {
      let oQ = sb.from("oportunidades").select("*");
      if (pipelineId !== "todos") oQ = oQ.eq("pipeline_id", pipelineId);
      if (responsavelId !== "todos") oQ = oQ.eq("responsavel_id", responsavelId);
      const { data: opps } = await oQ;
      setOportunidades(opps || []);

      let fQ = sb.from("v_relatorio_forecast_mensal").select("*");
      if (pipelineId !== "todos") fQ = fQ.eq("pipeline_id", pipelineId);
      if (responsavelId !== "todos") fQ = fQ.eq("responsavel_id", responsavelId);
      setForecastView((await fQ).data || []);

      let perf = sb.from("v_relatorio_performance_vendedor").select("*");
      if (pipelineId !== "todos") perf = perf.eq("pipeline_id", pipelineId);
      setPerfView((await perf).data || []);

      let mp = sb.from("v_relatorio_motivos_perda").select("*");
      if (pipelineId !== "todos") mp = mp.eq("pipeline_id", pipelineId);
      setMotivosView((await mp).data || []);

      let te = sb.from("v_relatorio_tempo_etapa").select("*");
      if (pipelineId !== "todos") te = te.eq("pipeline_id", pipelineId);
      setTempoEtapaView((await te).data || []);

      let aQ = sb.from("atividades").select("*")
        .gte("data_inicio", range.from.toISOString())
        .lte("data_inicio", range.to.toISOString())
        .eq("evento_automatico", false);
      if (responsavelId !== "todos") aQ = aQ.eq("responsavel_id", responsavelId);
      setAtividades((await aQ).data || []);
    })();
  }, [pipelineId, responsavelId, range.from, range.to]);

  // ============ FORECAST ============
  const oppsAbertas = useMemo(
    () => oportunidades.filter(o => o.status === "aberta" && o.data_fechamento_prevista
      && new Date(o.data_fechamento_prevista) >= range.from
      && new Date(o.data_fechamento_prevista) <= range.to),
    [oportunidades, range]
  );

  const forecastPonderado = useMemo(
    () => oppsAbertas.reduce((s, o) => s + Number(o.valor_estimado || 0) * Number(o.probabilidade || 0) / 100, 0),
    [oppsAbertas]
  );
  const fechamentoProvavel = useMemo(
    () => oppsAbertas.filter(o => Number(o.probabilidade || 0) >= 70).reduce((s, o) => s + Number(o.valor_estimado || 0), 0),
    [oppsAbertas]
  );

  const forecastChartData = useMemo(() => {
    const meses: { mes: string; mesKey: string }[] = [];
    for (let i = 0; i < 6; i++) {
      const d = addMonths(startOfMonth(new Date()), i);
      meses.push({ mes: format(d, "MMM/yy", { locale: ptBR }), mesKey: format(d, "yyyy-MM") });
    }
    const etapasNomes = Array.from(new Set(forecastView.map(f => f.etapa_nome).filter(Boolean)));
    return meses.map(m => {
      const row: any = { mes: m.mes };
      etapasNomes.forEach(en => {
        const match = forecastView.filter(f => format(new Date(f.mes), "yyyy-MM") === m.mesKey && f.etapa_nome === en);
        row[en] = match.reduce((s, f) => s + Number(f.forecast_ponderado || 0), 0);
      });
      return row;
    });
  }, [forecastView]);

  const etapasParaStack = useMemo(
    () => Array.from(new Set(forecastView.map(f => f.etapa_nome).filter(Boolean))),
    [forecastView]
  );

  // ============ PIPELINE HEALTH ============
  const oppsAbertasAll = useMemo(() => oportunidades.filter(o => o.status === "aberta"), [oportunidades]);

  const funilData = useMemo(() => {
    const byEtapa = new Map<string, { name: string; value: number; cor?: string; ordem?: number }>();
    oppsAbertasAll.forEach(o => {
      const ep = etapas.find(e => e.id === o.etapa_id);
      if (!ep) return;
      const cur = byEtapa.get(ep.id) || { name: ep.nome, value: 0, cor: ep.cor, ordem: ep.ordem };
      cur.value += 1;
      byEtapa.set(ep.id, cur);
    });
    return Array.from(byEtapa.values()).sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  }, [oppsAbertasAll, etapas]);

  const valorEtapaData = useMemo(
    () => funilData.map(f => {
      const valor = oppsAbertasAll
        .filter(o => etapas.find(e => e.id === o.etapa_id)?.nome === f.name)
        .reduce((s, o) => s + Number(o.valor_estimado || 0), 0);
      return { name: f.name, valor, fill: f.cor || "#059669" };
    }),
    [funilData, oppsAbertasAll, etapas]
  );

  const top10Deals = useMemo(
    () => [...oppsAbertasAll].sort((a, b) => Number(b.valor_estimado || 0) - Number(a.valor_estimado || 0)).slice(0, 10),
    [oppsAbertasAll]
  );

  // ============ PERFORMANCE ============
  const oppsFechadasPeriodo = useMemo(
    () => oportunidades.filter(o => o.data_fechamento_real
      && new Date(o.data_fechamento_real) >= range.from
      && new Date(o.data_fechamento_real) <= range.to),
    [oportunidades, range]
  );
  const ganhosPeriodo = useMemo(() => oppsFechadasPeriodo.filter(o => o.status === "ganha"), [oppsFechadasPeriodo]);
  const perdidosPeriodo = useMemo(() => oppsFechadasPeriodo.filter(o => o.status === "perdida"), [oppsFechadasPeriodo]);

  const winRate = oppsFechadasPeriodo.length
    ? Math.round((ganhosPeriodo.length / oppsFechadasPeriodo.length) * 1000) / 10
    : 0;
  const cicloMedio = ganhosPeriodo.length
    ? Math.round(ganhosPeriodo.reduce((s, o) => s + differenceInDays(new Date(o.data_fechamento_real), new Date(o.created_at)), 0) / ganhosPeriodo.length)
    : 0;
  const totalVendido = ganhosPeriodo.reduce((s, o) => s + Number(o.valor_estimado || 0), 0);
  const ticketMedio = ganhosPeriodo.length ? totalVendido / ganhosPeriodo.length : 0;

  const ganhosPorMes = useMemo(() => {
    const out: { mes: string; ganhos: number; valor: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = subMonths(startOfMonth(new Date()), i);
      const key = format(d, "yyyy-MM");
      const itens = oportunidades.filter(o => o.status === "ganha" && o.data_fechamento_real && format(new Date(o.data_fechamento_real), "yyyy-MM") === key);
      out.push({ mes: format(d, "MMM/yy", { locale: ptBR }), ganhos: itens.length, valor: itens.reduce((s, o) => s + Number(o.valor_estimado || 0), 0) });
    }
    return out;
  }, [oportunidades]);

  const motivosData = useMemo(
    () => motivosView.map(m => ({ name: m.motivo, value: Number(m.qtd || 0) })),
    [motivosView]
  );

  // ============ ATIVIDADES ============
  const atividadesPorTipo = useMemo(() => {
    const map = new Map<string, { name: string; qtd: number; cor: string }>();
    atividades.forEach(a => {
      const t = tiposAtividade.find(tt => tt.id === a.tipo_id);
      const nome = t?.nome || a.tipo || "Outro";
      const cor = t?.cor || "#6b7280";
      const cur = map.get(nome) || { name: nome, qtd: 0, cor };
      cur.qtd += 1;
      map.set(nome, cur);
    });
    return Array.from(map.values());
  }, [atividades, tiposAtividade]);

  const atividadesPorVendedor = useMemo(() => {
    const map = new Map<string, { vendedor: string; total: number; concluidas: number }>();
    atividades.forEach(a => {
      const v = vendedores.find(vv => vv.user_id === a.responsavel_id);
      const nome = v?.nome || v?.email || "—";
      const cur = map.get(a.responsavel_id || "—") || { vendedor: nome, total: 0, concluidas: 0 };
      cur.total += 1;
      if (a.concluida) cur.concluidas += 1;
      map.set(a.responsavel_id || "—", cur);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [atividades, vendedores]);

  const tempoEtapaData = useMemo(
    () => [...tempoEtapaView]
      .filter(t => pipelineId === "todos" || t.pipeline_id === pipelineId)
      .sort((a, b) => (a.etapa_ordem || 0) - (b.etapa_ordem || 0))
      .map(t => ({ name: t.etapa_nome, dias: Number(t.tempo_medio_dias || 0), fill: t.etapa_cor || "#059669" })),
    [tempoEtapaView, pipelineId]
  );

  const perfFiltrado = useMemo(
    () => {
      const map = new Map<string, any>();
      perfView.forEach(p => {
        const key = p.responsavel_id || "—";
        const cur = map.get(key) || { ...p, deals_ganhos: 0, deals_perdidos: 0, deals_fechados: 0, valor_ganho: 0, ciclo_acc: 0 };
        cur.deals_ganhos += Number(p.deals_ganhos || 0);
        cur.deals_perdidos += Number(p.deals_perdidos || 0);
        cur.deals_fechados += Number(p.deals_fechados || 0);
        cur.valor_ganho += Number(p.valor_ganho || 0);
        cur.ciclo_acc += Number(p.ciclo_medio_dias || 0);
        cur._n = (cur._n || 0) + 1;
        map.set(key, cur);
      });
      return Array.from(map.values()).map(r => ({
        ...r,
        win_rate: r.deals_fechados ? Math.round(1000 * r.deals_ganhos / r.deals_fechados) / 10 : 0,
        ciclo_medio_dias: r._n ? Math.round(r.ciclo_acc / r._n) : 0,
      })).sort((a, b) => b.valor_ganho - a.valor_ganho);
    },
    [perfView]
  );

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="bg-background border-b">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")}><ArrowLeft className="w-4 h-4" /></Button>
            <h1 className="text-xl font-semibold">Relatórios</h1>
          </div>
          <AppHeader />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* FILTROS */}
        <Card className="p-4 flex flex-wrap gap-3 items-center">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Pipeline</label>
            <Select value={pipelineId} onValueChange={setPipelineId}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {pipelines.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Período</label>
            <Select value={periodo} onValueChange={(v: any) => setPeriodo(v)}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mes">Este mês</SelectItem>
                <SelectItem value="trimestre">Trimestre</SelectItem>
                <SelectItem value="semestre">Semestre</SelectItem>
                <SelectItem value="ano">Ano</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {periodo === "custom" && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="mt-5">
                  <CalendarIcon className="w-4 h-4 mr-2" />
                  {customRange.from ? format(customRange.from, "dd/MM/yy", { locale: ptBR }) : "—"} → {customRange.to ? format(customRange.to, "dd/MM/yy", { locale: ptBR }) : "—"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar mode="range" selected={customRange as any} onSelect={(r: any) => setCustomRange(r || {})} locale={ptBR} />
              </PopoverContent>
            </Popover>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Responsável</label>
            <Select value={responsavelId} onValueChange={setResponsavelId}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {vendedores.map(v => <SelectItem key={v.user_id} value={v.user_id}>{v.nome || v.email}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="ml-auto text-xs text-muted-foreground">
            {format(range.from, "dd/MM/yy", { locale: ptBR })} – {format(range.to, "dd/MM/yy", { locale: ptBR })}
          </div>
        </Card>

        {/* SEÇÃO 1 — FORECAST */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2"><TrendingUp className="w-5 h-5 text-primary" /> Forecast</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="p-5">
              <div className="text-xs text-muted-foreground">Forecast Ponderado</div>
              <div className="text-3xl font-bold text-primary mt-1">{fmtBRL(forecastPonderado)}</div>
              <div className="text-xs text-muted-foreground mt-1">{oppsAbertas.length} oportunidades abertas no período</div>
            </Card>
            <Card className="p-5">
              <div className="text-xs text-muted-foreground">Fechamento Provável (≥ 70%)</div>
              <div className="text-3xl font-bold text-emerald-600 mt-1">{fmtBRL(fechamentoProvavel)}</div>
            </Card>
          </div>

          <Card className="p-4">
            <div className="text-sm font-medium mb-3">Forecast por Mês (próximos 6 meses)</div>
            <div className="h-72">
              <ResponsiveContainer>
                <BarChart data={forecastChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="mes" />
                  <YAxis tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: any) => fmtBRL(Number(v))} />
                  <Legend />
                  {etapasParaStack.map((en, i) => (
                    <Bar key={en} dataKey={en} stackId="a" fill={COLORS[i % COLORS.length]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </section>

        {/* SEÇÃO 2 — PIPELINE HEALTH */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2"><Target className="w-5 h-5 text-primary" /> Pipeline Health</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-4">
              <div className="text-sm font-medium mb-3">Funil — Quantidade por Etapa</div>
              <div className="h-72">
                <ResponsiveContainer>
                  <FunnelChart>
                    <Tooltip />
                    <Funnel dataKey="value" data={funilData} isAnimationActive>
                      <LabelList position="right" fill="hsl(var(--foreground))" stroke="none" dataKey="name" />
                      {funilData.map((e, i) => <Cell key={i} fill={e.cor || COLORS[i % COLORS.length]} />)}
                    </Funnel>
                  </FunnelChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="p-4">
              <div className="text-sm font-medium mb-3">Valor por Etapa</div>
              <div className="h-72">
                <ResponsiveContainer>
                  <BarChart data={valorEtapaData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: any) => fmtBRL(Number(v))} />
                    <Bar dataKey="valor" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <Card className="p-4">
            <div className="text-sm font-medium mb-3">Top 10 Maiores Deals em Aberto</div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Deal</TableHead>
                  <TableHead>Etapa</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">Prob.</TableHead>
                  <TableHead>Prev. Fechamento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {top10Deals.map(d => (
                  <TableRow key={d.id} className="cursor-pointer" onClick={() => navigate(`/crm/deal/${d.id}`)}>
                    <TableCell className="font-medium">{d.titulo}</TableCell>
                    <TableCell>{etapas.find(e => e.id === d.etapa_id)?.nome || "—"}</TableCell>
                    <TableCell className="text-right">{fmtBRL(Number(d.valor_estimado || 0))}</TableCell>
                    <TableCell className="text-right">{d.probabilidade}%</TableCell>
                    <TableCell>{d.data_fechamento_prevista ? format(new Date(d.data_fechamento_prevista), "dd/MM/yy") : "—"}</TableCell>
                  </TableRow>
                ))}
                {!top10Deals.length && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Sem deals abertos</TableCell></TableRow>}
              </TableBody>
            </Table>
          </Card>
        </section>

        {/* SEÇÃO 3 — PERFORMANCE */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2"><Trophy className="w-5 h-5 text-primary" /> Performance</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="p-4"><div className="text-xs text-muted-foreground">Win Rate</div><div className="text-2xl font-bold">{winRate}%</div></Card>
            <Card className="p-4"><div className="text-xs text-muted-foreground">Ciclo Médio</div><div className="text-2xl font-bold">{cicloMedio} dias</div></Card>
            <Card className="p-4"><div className="text-xs text-muted-foreground">Ticket Médio</div><div className="text-2xl font-bold">{fmtBRL(ticketMedio)}</div></Card>
            <Card className="p-4"><div className="text-xs text-muted-foreground">Total Vendido</div><div className="text-2xl font-bold text-primary">{fmtBRL(totalVendido)}</div></Card>
          </div>

          <Card className="p-4">
            <div className="text-sm font-medium mb-3">Deals Ganhos por Mês (12 meses)</div>
            <div className="h-72">
              <ResponsiveContainer>
                <LineChart data={ganhosPorMes}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="mes" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="ganhos" stroke="#059669" strokeWidth={2} name="Deals" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-4">
              <div className="text-sm font-medium mb-3">Ranking de Vendedores</div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vendedor</TableHead>
                    <TableHead className="text-right">Ganhos</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead className="text-right">Win %</TableHead>
                    <TableHead className="text-right">Ciclo (d)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {perfFiltrado.map(p => (
                    <TableRow key={p.responsavel_id || Math.random()}>
                      <TableCell className="font-medium">{p.vendedor_nome || p.vendedor_email || "—"}</TableCell>
                      <TableCell className="text-right">{p.deals_ganhos}</TableCell>
                      <TableCell className="text-right">{fmtBRL(Number(p.valor_ganho || 0))}</TableCell>
                      <TableCell className="text-right">{p.win_rate}%</TableCell>
                      <TableCell className="text-right">{p.ciclo_medio_dias}</TableCell>
                    </TableRow>
                  ))}
                  {!perfFiltrado.length && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Sem dados</TableCell></TableRow>}
                </TableBody>
              </Table>
            </Card>

            <Card className="p-4">
              <div className="text-sm font-medium mb-3">Motivos de Perda</div>
              <div className="h-72">
                <ResponsiveContainer>
                  <PieChart>
                    <Tooltip />
                    <Legend />
                    <Pie data={motivosData} dataKey="value" nameKey="name" outerRadius={90} label>
                      {motivosData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>
        </section>

        {/* SEÇÃO 4 — ATIVIDADES */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2"><DollarSign className="w-5 h-5 text-primary" /> Atividades</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-4">
              <div className="text-sm font-medium mb-3">Atividades por Tipo</div>
              <div className="h-72">
                <ResponsiveContainer>
                  <BarChart data={atividadesPorTipo}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="qtd">
                      {atividadesPorTipo.map((d, i) => <Cell key={i} fill={d.cor} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="p-4">
              <div className="text-sm font-medium mb-3">Tempo Médio em Cada Etapa (dias)</div>
              <div className="h-72">
                <ResponsiveContainer>
                  <BarChart data={tempoEtapaData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis type="category" dataKey="name" width={120} />
                    <Tooltip />
                    <Bar dataKey="dias">
                      {tempoEtapaData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <Card className="p-4">
            <div className="text-sm font-medium mb-3">Atividades por Vendedor</div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendedor</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Concluídas</TableHead>
                  <TableHead className="text-right">Pendentes</TableHead>
                  <TableHead className="text-right">% Conclusão</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {atividadesPorVendedor.map((a, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{a.vendedor}</TableCell>
                    <TableCell className="text-right">{a.total}</TableCell>
                    <TableCell className="text-right">{a.concluidas}</TableCell>
                    <TableCell className="text-right">{a.total - a.concluidas}</TableCell>
                    <TableCell className="text-right">{a.total ? Math.round(100 * a.concluidas / a.total) : 0}%</TableCell>
                  </TableRow>
                ))}
                {!atividadesPorVendedor.length && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Sem atividades no período</TableCell></TableRow>}
              </TableBody>
            </Table>
          </Card>
        </section>
      </main>
    </div>
  );
}
