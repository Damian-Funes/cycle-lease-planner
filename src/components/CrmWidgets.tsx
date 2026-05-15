import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { KanbanSquare, CheckSquare, CalendarClock, Flame, Trophy, ListChecks } from "lucide-react";
import { format, startOfMonth, endOfMonth, startOfDay, endOfDay, subWeeks, startOfWeek, endOfWeek, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, Cell } from "recharts";

const sb: any = supabase;
const fmtBRL = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(n || 0);

export default function CrmWidgets() {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const uid = user?.id;

  const [opps, setOpps] = useState<any[]>([]);
  const [etapas, setEtapas] = useState<any[]>([]);
  const [atividades, setAtividades] = useState<any[]>([]);
  const [rotting, setRotting] = useState<{ rotting: number; aging: number; no_activity: number; fresh: number }>({ rotting: 0, aging: 0, no_activity: 0, fresh: 0 });

  useEffect(() => {
    if (!uid) return;
    (async () => {
      const [oRes, eRes, aRes] = await Promise.all([
        (isAdmin
          ? sb.from("oportunidades").select("*")
          : sb.from("oportunidades").select("*").eq("responsavel_id", uid)),
        sb.from("etapas_pipeline").select("id, nome, cor, ordem"),
        (isAdmin
          ? sb.from("atividades").select("*").eq("evento_automatico", false)
          : sb.from("atividades").select("*").eq("responsavel_id", uid).eq("evento_automatico", false))
          .order("data_inicio", { ascending: true }),
      ]);
      const allOpps = oRes.data || [];
      setOpps(allOpps);
      setEtapas(eRes.data || []);
      setAtividades(aRes.data || []);

      // Rotting status para cada deal aberto via RPC fn_oportunidade_rotting
      const abertas = allOpps.filter((o: any) => o.status === "aberta");
      const counts = { rotting: 0, aging: 0, no_activity: 0, fresh: 0 } as any;
      const results = await Promise.all(
        abertas.map((o: any) => sb.rpc("fn_oportunidade_rotting", { opp_id: o.id }))
      );
      results.forEach((r: any) => {
        const s = r?.data as string | null;
        if (s && counts[s] !== undefined) counts[s] += 1;
      });
      setRotting(counts);
    })();
  }, [uid, isAdmin]);

  // 1) Meu Pipeline
  const minhasAbertas = useMemo(() => opps.filter(o => o.status === "aberta"), [opps]);
  const valorPipeline = minhasAbertas.reduce((s, o) => s + Number(o.valor_estimado || 0), 0);
  const miniFunnel = useMemo(() => {
    const map = new Map<string, { name: string; qtd: number; cor?: string; ordem?: number }>();
    minhasAbertas.forEach(o => {
      const ep = etapas.find(e => e.id === o.etapa_id);
      if (!ep) return;
      const cur = map.get(ep.id) || { name: ep.nome, qtd: 0, cor: ep.cor, ordem: ep.ordem };
      cur.qtd += 1;
      map.set(ep.id, cur);
    });
    return Array.from(map.values()).sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  }, [minhasAbertas, etapas]);

  // 2) Atividades Hoje
  const ativHoje = useMemo(
    () => atividades.filter(a => !a.concluida && a.data_inicio && isToday(new Date(a.data_inicio))),
    [atividades]
  );
  const proximas3Hoje = ativHoje.slice(0, 3);

  // 3) Deals Fechando Este Mês
  const fechandoMes = useMemo(() => {
    const ini = startOfMonth(new Date()), fim = endOfMonth(new Date());
    return minhasAbertas
      .filter(o => o.data_fechamento_prevista && new Date(o.data_fechamento_prevista) >= ini && new Date(o.data_fechamento_prevista) <= fim)
      .sort((a, b) => new Date(a.data_fechamento_prevista).getTime() - new Date(b.data_fechamento_prevista).getTime());
  }, [minhasAbertas]);
  const valorFechandoMes = fechandoMes.reduce((s, o) => s + Number(o.valor_estimado || 0), 0);

  // 4) Rotting indicador
  const rottingTotal = rotting.rotting + rotting.aging;
  const rottingColor = rotting.rotting > 0 ? "bg-destructive" : rotting.aging > 0 ? "bg-amber-500" : "bg-emerald-500";

  // 5) Ganhos do mês + sparkline 12 semanas
  const ganhosMes = useMemo(() => {
    const ini = startOfMonth(new Date()), fim = endOfMonth(new Date());
    return opps.filter(o => o.status === "ganha" && o.data_fechamento_real
      && new Date(o.data_fechamento_real) >= ini && new Date(o.data_fechamento_real) <= fim);
  }, [opps]);
  const valorGanhosMes = ganhosMes.reduce((s, o) => s + Number(o.valor_estimado || 0), 0);
  const sparkline = useMemo(() => {
    const out: { w: string; v: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const ref = subWeeks(new Date(), i);
      const ini = startOfWeek(ref, { weekStartsOn: 1 });
      const fim = endOfWeek(ref, { weekStartsOn: 1 });
      const v = opps
        .filter(o => o.status === "ganha" && o.data_fechamento_real
          && new Date(o.data_fechamento_real) >= ini && new Date(o.data_fechamento_real) <= fim)
        .reduce((s, o) => s + Number(o.valor_estimado || 0), 0);
      out.push({ w: format(ini, "dd/MM"), v });
    }
    return out;
  }, [opps]);

  // 6) Próximas atividades (5)
  const proximas5 = useMemo(
    () => atividades.filter(a => !a.concluida && a.data_inicio && new Date(a.data_inicio) >= startOfDay(new Date())).slice(0, 5),
    [atividades]
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {/* 1) Meu Pipeline */}
      <Card onClick={() => navigate("/crm")} className="p-5 cursor-pointer hover:shadow-md hover:border-primary/40 transition-all">
        <div className="flex items-start justify-between mb-2">
          <div>
            <div className="text-xs text-muted-foreground flex items-center gap-1.5"><KanbanSquare className="w-3.5 h-3.5" /> Meu Pipeline</div>
            <div className="text-2xl font-bold text-primary mt-1">{fmtBRL(valorPipeline)}</div>
            <div className="text-xs text-muted-foreground">{minhasAbertas.length} deals em aberto</div>
          </div>
        </div>
        <div className="h-16 mt-2">
          {miniFunnel.length > 0 ? (
            <ResponsiveContainer>
              <BarChart data={miniFunnel}>
                <Bar dataKey="qtd">
                  {miniFunnel.map((d, i) => <Cell key={i} fill={d.cor || "#059669"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="text-xs text-muted-foreground italic">Sem deals</div>}
        </div>
      </Card>

      {/* 2) Atividades Hoje */}
      <Card onClick={() => navigate("/atividades")} className="p-5 cursor-pointer hover:shadow-md hover:border-primary/40 transition-all">
        <div className="text-xs text-muted-foreground flex items-center gap-1.5"><CheckSquare className="w-3.5 h-3.5" /> Atividades Hoje</div>
        <div className="text-2xl font-bold mt-1">{ativHoje.length}</div>
        <ul className="mt-2 space-y-1">
          {proximas3Hoje.map(a => (
            <li key={a.id} className="text-xs flex items-center gap-2 truncate">
              <span className="text-muted-foreground tabular-nums">{format(new Date(a.data_inicio), "HH:mm")}</span>
              <span className="truncate">{a.titulo}</span>
            </li>
          ))}
          {!proximas3Hoje.length && <li className="text-xs text-muted-foreground italic">Nada para hoje</li>}
        </ul>
      </Card>

      {/* 3) Deals Fechando Este Mês */}
      <Card onClick={() => navigate("/crm")} className="p-5 cursor-pointer hover:shadow-md hover:border-primary/40 transition-all">
        <div className="text-xs text-muted-foreground flex items-center gap-1.5"><CalendarClock className="w-3.5 h-3.5" /> Fechando Este Mês</div>
        <div className="text-2xl font-bold mt-1">{fechandoMes.length} <span className="text-sm font-normal text-muted-foreground">· {fmtBRL(valorFechandoMes)}</span></div>
        <ul className="mt-2 space-y-1">
          {fechandoMes.slice(0, 3).map(o => (
            <li key={o.id} className="text-xs flex items-center justify-between gap-2">
              <span className="truncate">{o.titulo}</span>
              <span className="text-muted-foreground tabular-nums shrink-0">{format(new Date(o.data_fechamento_prevista), "dd/MM", { locale: ptBR })}</span>
            </li>
          ))}
          {!fechandoMes.length && <li className="text-xs text-muted-foreground italic">Nenhum previsto</li>}
        </ul>
      </Card>

      {/* 4) Rotting */}
      <Card onClick={() => navigate("/crm?rotting=1")} className="p-5 cursor-pointer hover:shadow-md hover:border-primary/40 transition-all">
        <div className="text-xs text-muted-foreground flex items-center gap-1.5"><Flame className="w-3.5 h-3.5" /> Deals em Rotting</div>
        <div className="flex items-center gap-3 mt-1">
          <span className={`w-3 h-3 rounded-full ${rottingColor}`} />
          <div className="text-2xl font-bold">{rottingTotal}</div>
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          {rotting.rotting} críticos · {rotting.aging} em risco · {rotting.no_activity} sem atividade
        </div>
      </Card>

      {/* 5) Ganhos do Mês */}
      <Card onClick={() => navigate("/relatorios")} className="p-5 cursor-pointer hover:shadow-md hover:border-primary/40 transition-all">
        <div className="text-xs text-muted-foreground flex items-center gap-1.5"><Trophy className="w-3.5 h-3.5" /> Ganhos do Mês</div>
        <div className="text-2xl font-bold text-emerald-600 mt-1">{fmtBRL(valorGanhosMes)}</div>
        <div className="text-xs text-muted-foreground">{ganhosMes.length} deals fechados</div>
        <div className="h-12 mt-2">
          <ResponsiveContainer>
            <LineChart data={sparkline}>
              <Line type="monotone" dataKey="v" stroke="#059669" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* 6) Próximas Atividades */}
      <Card onClick={() => navigate("/atividades")} className="p-5 cursor-pointer hover:shadow-md hover:border-primary/40 transition-all">
        <div className="text-xs text-muted-foreground flex items-center gap-1.5"><ListChecks className="w-3.5 h-3.5" /> Próximas Atividades</div>
        <ul className="mt-2 space-y-1.5">
          {proximas5.map(a => (
            <li key={a.id} className="text-xs flex items-center gap-2">
              <span className="text-muted-foreground tabular-nums shrink-0">{format(new Date(a.data_inicio), "dd/MM HH:mm")}</span>
              <span className="truncate">{a.titulo}</span>
            </li>
          ))}
          {!proximas5.length && <li className="text-xs text-muted-foreground italic">Sem atividades agendadas</li>}
        </ul>
      </Card>
    </div>
  );
}
