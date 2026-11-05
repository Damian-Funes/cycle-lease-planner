import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Smartphone } from "lucide-react";
import { getParadas, getRota } from "@/lib/rotas";
import { diaRota, hojeRota, paradaInformada, periodoRota } from "@/lib/rotasFluxo";
import { agruparPorDiaRealizado, diasDaViagem, noitesDaViagem, ordenarParadasViagem, TIPOS_NOITE } from "@/lib/viagem";
import { formatBRL } from "@/lib/smartcycle";
import { listDiario, listGastos, listPernoites } from "@/lib/viagemDados";
import { podeLancarGasto } from "@/lib/viagemDiario";
import { useAuth } from "@/hooks/useAuth";
import RotaMapa from "@/components/rotas/RotaMapa";
import RotaStatus from "@/components/rotas/RotaStatus";
import CustoViagemCard, { custoSalvo } from "@/components/rotas/CustoViagemCard";
import ComparativoCard from "@/components/viagens/ComparativoCard";
import GastosViagem from "@/components/viagens/GastosViagem";
import DiarioTimeline from "@/components/viagens/DiarioTimeline";
import JuliaLigacoes from "@/components/viagens/JuliaLigacoes";
import NotasHotelPendentes from "@/components/viagens/NotasHotelPendentes";
import RelatoVisitaResumo from "@/components/viagens/RelatoVisitaResumo";

export default function ViagemAcompanhar() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const { data: rota, isLoading } = useQuery({ queryKey: ["rota", id], queryFn: () => getRota(id), enabled: !!id });
  const { data: brutas = [] } = useQuery({ queryKey: ["rota-paradas", id], queryFn: () => getParadas(id), enabled: !!id });
  const { data: diario = [] } = useQuery({ queryKey: ["rota-diario", id], queryFn: () => listDiario(id), enabled: !!id });
  const { data: gastos = [] } = useQuery({ queryKey: ["rota-gastos", id], queryFn: () => listGastos(id), enabled: !!id });
  const { data: pernoites = [] } = useQuery({ queryKey: ["rota-pernoites", id], queryFn: () => listPernoites(id), enabled: !!id });
  const { data: vendedor } = useQuery({ queryKey: ["perfil", rota?.vendedor_id], enabled: !!rota, queryFn: async () => {
    if (!rota) return null;
    return (await (await import("@/integrations/supabase/client")).supabase.from("profiles").select("nome,email").eq("user_id", rota.vendedor_id).maybeSingle()).data;
  } });
  const inicio = rota?.data_inicio ?? rota?.data_rota ?? hojeRota();
  const paradas = useMemo(() => ordenarParadasViagem(brutas), [brutas]);

  if (isLoading) return <p className="p-6 text-muted-foreground">Carregando...</p>;
  if (!rota) return <p className="p-6">Viagem não encontrada ou sem acesso.</p>;
  const dono = rota.vendedor_id === user?.id;
  const est = custoSalvo(rota);
  const dias = diasDaViagem(inicio, rota.data_fim);
  const visitas = paradas;
  const noites = noitesDaViagem(inicio, rota.data_fim);
  const porDia = agruparPorDiaRealizado(dias, paradas, diario, gastos, pernoites);
  const pendentes = paradas.filter((p) => p.visitada == null);
  const hotelReal = gastos.filter((g) => g.categoria === "hotel").reduce((s, g) => s + Number(g.valor), 0);
  const nome = (p: (typeof paradas)[number]) => p.organizacao?.nome_fantasia || p.organizacao?.nome || p.cidade;

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="bg-background border-b"><div className="max-w-6xl mx-auto px-4 py-3 flex justify-between"><Button variant="ghost" onClick={() => navigate(-1)}><ArrowLeft className="w-4 h-4 mr-2" />Voltar</Button><AppHeader /></div></header>
      <main className="max-w-6xl mx-auto px-4 py-6 space-y-4">
        <NotasHotelPendentes rotaId={id} pernoites={pernoites} gastos={gastos} editavel={(dono && podeLancarGasto(rota)) || isAdmin} />
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold">Acompanhar viagem</h1><RotaStatus status={rota.status} />
          <span className="text-muted-foreground">{vendedor?.nome || vendedor?.email} · {periodoRota(rota)} · {visitas.filter(paradaInformada).length} de {visitas.length} paradas informadas</span>
          {dono && rota.status === "aprovada" && <Button size="sm" className="ml-auto" onClick={() => navigate(`/viagens/${id}/hoje`)}><Smartphone className="w-4 h-4 mr-1" />Viagem de hoje</Button>}
        </div>
        <div className="grid lg:grid-cols-2 gap-4">
          <Card className="overflow-hidden"><RotaMapa vendedorId={rota.vendedor_id} veiculoId={rota.veiculo_id} paradas={brutas} inicio={inicio} fim={rota.data_fim} /></Card>
          <div className="space-y-3">
            {est ? <CustoViagemCard custo={est} /> : <Card className="p-3 text-sm text-muted-foreground">Custo estimado não registrado.</Card>}
            <Card className="p-3 text-sm">Hospedagem real: <b>{formatBRL(hotelReal)}</b> · {pernoites.length} de {noites.length} noites registradas</Card>
            <ComparativoCard estimado={est} gastos={gastos} />
            <GastosViagem rotaId={id} gastos={gastos} editavel={(dono && podeLancarGasto(rota)) || isAdmin} />
          </div>
        </div>
        <Card className="p-4 space-y-3">
          <h2 className="font-semibold">Paradas</h2>
          {porDia.filter((h) => h.paradas.length || h.pernoite || h.gastos.length || noites.includes(h.dia)).map((h) => (
            <div key={h.dia}><p className="text-sm font-medium text-muted-foreground">Dia {dias.indexOf(h.dia) + 1} · {diaRota(h.dia)}{h.gastos.length ? ` · gastos ${formatBRL(h.gastos.reduce((s, g) => s + Number(g.valor), 0))}` : ""}</p>
              <ul className="divide-y">{h.paradas.map((p) => (
                <li key={p.id} className="py-2 text-sm flex gap-2">
                  <span className={`mt-1 w-2.5 h-2.5 rounded-full shrink-0 ${p.visitada ? "bg-primary" : "bg-destructive"}`} />
                  <div><span className="font-medium">{nome(p)}</span>
                    <span className="text-muted-foreground"> · {p.visitada ? `Visitada — ${p.resultado}` : `Não visitada — ${p.motivo_nao_visita}`}</span>
                    {isAdmin && <RelatoVisitaResumo relato={p.relato} />}</div>
                </li>))}
                {noites.includes(h.dia) && <li className="py-2 text-sm">🛏 {h.pernoite ? `${TIPOS_NOITE.find((t) => t.id === h.pernoite?.tipo)?.nome}${h.pernoite.cidade ? ` · ${h.pernoite.cidade}/${h.pernoite.estado}` : ""}${h.pernoite.hotel_nome ? ` · ${h.pernoite.hotel_nome}` : ""}${h.pernoite.observacao ? ` — ${h.pernoite.observacao}` : ""}` : <span className="text-muted-foreground">Noite ainda não registrada</span>}</li>}
              </ul></div>))}
          {pendentes.length > 0 && <div><p className="text-sm font-medium text-muted-foreground">Pendentes ({pendentes.length})</p>
            <ul className="divide-y">{pendentes.map((p) => <li key={p.id} className="py-2 text-sm flex gap-2"><span className="mt-1 w-2.5 h-2.5 rounded-full shrink-0 bg-border" /><span className="font-medium">{nome(p)}</span></li>)}</ul></div>}
        </Card>
        <Card className="p-4 space-y-3"><h2 className="font-semibold">Diário de bordo</h2><DiarioTimeline itens={diario} paradas={paradas} podeApagar={isAdmin} /></Card>
        <JuliaLigacoes rotaId={id} admin={isAdmin} />
      </main>
    </div>
  );
}
