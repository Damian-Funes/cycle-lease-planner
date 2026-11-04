import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Hotel, Map, Navigation, Plus } from "lucide-react";
import { getParadas, getRota } from "@/lib/rotas";
import { diaRota, hojeRota, paradaInformada } from "@/lib/rotasFluxo";
import { ordenarParadasViagem, diasDaViagem } from "@/lib/viagem";
import { coordenadaValida, linkWaze } from "@/lib/rotaNavegacao";
import { listDiario, listGastos } from "@/lib/viagemDados";
import { podeEscreverDiario, podeLancarGasto } from "@/lib/viagemDiario";
import { useAuth } from "@/hooks/useAuth";
import PrestacaoParada from "@/components/rotas/PrestacaoParada";
import InformativoDialog from "@/components/viagens/InformativoDialog";
import DiarioTimeline from "@/components/viagens/DiarioTimeline";
import GastosViagem from "@/components/viagens/GastosViagem";

export default function ViagemHoje() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user, isAdmin } = useAuth();
  const hoje = hojeRota();
  const [infoOpen, setInfoOpen] = useState(false);
  const [infoParada, setInfoParada] = useState<string | null>(null);
  const { data: rota, isLoading } = useQuery({ queryKey: ["rota", id], queryFn: () => getRota(id), enabled: !!id });
  const { data: brutas = [] } = useQuery({ queryKey: ["rota-paradas", id], queryFn: () => getParadas(id), enabled: !!id });
  const { data: diario = [] } = useQuery({ queryKey: ["rota-diario", id], queryFn: () => listDiario(id), enabled: !!id });
  const { data: gastos = [] } = useQuery({ queryKey: ["rota-gastos", id], queryFn: () => listGastos(id), enabled: !!id });
  const inicio = rota?.data_inicio ?? rota?.data_rota ?? hoje;
  const paradas = useMemo(() => ordenarParadasViagem(brutas.map((p) => ({ ...p, dia: p.dia ?? inicio })), inicio), [brutas, inicio]);
  const dias = rota ? diasDaViagem(inicio, rota.data_fim) : [];
  const diaAtual = dias.includes(hoje) ? hoje : dias[dias.length - 1];
  const [dia, setDia] = useState<string | null>(null);
  const diaSel = dia ?? diaAtual;
  const doDia = paradas.filter((p) => p.dia === diaSel);
  const recarregar = () => qc.invalidateQueries({ queryKey: ["rota-paradas", id] });

  if (isLoading) return <p className="p-6 text-muted-foreground">Carregando...</p>;
  if (!rota) return <p className="p-6">Viagem não encontrada.</p>;
  const dono = rota.vendedor_id === user?.id;
  const escreve = dono && podeEscreverDiario(rota, hoje);
  const prestacao = rota.status === "aprovada" && inicio <= hoje && (dono || isAdmin);
  const visitas = paradas.filter((p) => p.tipo !== "pernoite");

  return (
    <div className="min-h-screen bg-muted/20 pb-28">
      <header className="sticky top-0 z-10 bg-background border-b px-3 py-2 flex items-center gap-2">
        <Button variant="ghost" size="icon" aria-label="Voltar" onClick={() => navigate(`/rotas/${id}`)}><ArrowLeft className="w-5 h-5" /></Button>
        <div className="flex-1 min-w-0">
          <h1 className="font-semibold leading-tight">Viagem de hoje</h1>
          <p className="text-xs text-muted-foreground">{visitas.filter(paradaInformada).length} de {visitas.length} paradas informadas</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate(`/viagens/${id}/acompanhar`)}><Map className="w-4 h-4 mr-1" />Acompanhar</Button>
      </header>
      <main className="max-w-xl mx-auto p-3 space-y-3">
        {rota.status !== "aprovada" && <Card className="p-3 text-sm">Esta viagem não está aprovada — a prestação e o diário ficam disponíveis só em viagens aprovadas.</Card>}
        {dias.length > 1 && <div className="flex gap-2 overflow-x-auto pb-1">{dias.map((d, i) => (
          <Button key={d} size="sm" variant={d === diaSel ? "default" : "outline"} className="shrink-0" onClick={() => setDia(d)}>Dia {i + 1} · {diaRota(d)}{d === hoje ? " (hoje)" : ""}</Button>))}</div>}
        {!doDia.length && <Card className="p-4 text-sm text-muted-foreground">Nenhuma parada neste dia.</Card>}
        {doDia.map((p) => {
          const n = paradas.indexOf(p) + 1;
          const nome = p.tipo === "pernoite" ? `Pernoite: ${p.hotel_nome ?? ""}` : (p.organizacao?.nome_fantasia || p.organizacao?.nome || p.cidade || "Parada");
          return (
            <Card key={p.id} className={`p-4 space-y-2 ${paradaInformada(p) ? "border-primary/50" : ""}`}>
              <div className="flex items-start gap-3">
                <span className="w-8 h-8 shrink-0 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">{p.tipo === "pernoite" ? <Hotel className="w-4 h-4" /> : n}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-base">{nome}</p>
                  <p className="text-sm text-muted-foreground">{[p.cidade, p.estado].filter(Boolean).join(" / ")}</p>
                  {p.objetivo && p.tipo !== "pernoite" && <p className="text-sm mt-1">{p.objetivo}</p>}
                </div>
              </div>
              <div className="flex gap-2">
                {coordenadaValida(p.latitude, p.longitude) && <Button asChild variant="outline" size="lg" className="flex-1 h-12"><a href={linkWaze({ lat: Number(p.latitude), lng: Number(p.longitude) })} target="_blank" rel="noreferrer"><Navigation className="w-5 h-5 mr-1" />Waze</a></Button>}
                {escreve && <Button variant="outline" size="lg" className="flex-1 h-12" onClick={() => { setInfoParada(p.id); setInfoOpen(true); }}><Plus className="w-5 h-5 mr-1" />Informativo</Button>}
              </div>
              {prestacao && p.tipo !== "pernoite" && <PrestacaoParada parada={p} onSaved={recarregar} grande />}
              {!prestacao && p.tipo !== "pernoite" && p.visitada != null && <p className="text-sm">{p.visitada ? `Visitada — ${p.resultado}` : `Não visitada — ${p.motivo_nao_visita}`}</p>}
            </Card>
          );
        })}
        <GastosViagem rotaId={id} gastos={gastos} editavel={(dono && podeLancarGasto(rota)) || isAdmin} />
        <section className="space-y-2">
          <h2 className="font-semibold">Diário de bordo</h2>
          <DiarioTimeline itens={diario} paradas={paradas} podeApagar={isAdmin} />
        </section>
      </main>
      {escreve && <div className="fixed bottom-0 inset-x-0 p-3 bg-background/95 border-t">
        <Button size="lg" className="w-full h-14 text-lg max-w-xl mx-auto flex" onClick={() => { setInfoParada(null); setInfoOpen(true); }}><Plus className="w-6 h-6 mr-1" />Informativo</Button>
      </div>}
      <InformativoDialog key={`${infoOpen}-${infoParada}`} open={infoOpen} onOpenChange={setInfoOpen} rotaId={id} paradas={paradas} paradaInicial={infoParada}
        onSaved={() => qc.invalidateQueries({ queryKey: ["rota-diario", id] })} />
    </div>
  );
}
