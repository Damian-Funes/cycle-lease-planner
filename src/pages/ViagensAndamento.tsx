import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { hojeRota, paradaInformada, periodoRota } from "@/lib/rotasFluxo";
import { viagensEmAndamento } from "@/lib/viagemDados";
import { haQuantoTempo } from "@/lib/viagemDiario";
import { noitesDaViagem, TIPOS_NOITE } from "@/lib/viagem";
import { formatBRL } from "@/lib/smartcycle";

export default function ViagensAndamento() {
  const navigate = useNavigate();
  const hoje = hojeRota();
  const { data = [], isLoading } = useQuery({ queryKey: ["viagens-andamento", hoje], queryFn: () => viagensEmAndamento(hoje), refetchInterval: 120000 });
  return (
    <div className="min-h-screen bg-muted/20">
      <header className="bg-background border-b"><div className="max-w-5xl mx-auto px-4 py-3 flex justify-between"><Button variant="ghost" onClick={() => navigate(-1)}><ArrowLeft className="w-4 h-4 mr-2" />Voltar</Button><AppHeader /></div></header>
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        <h1 className="text-2xl font-bold">Viagens em andamento</h1>
        {isLoading && <p className="text-muted-foreground">Carregando...</p>}
        {!isLoading && !data.length && <Card className="p-6 text-center text-muted-foreground">Nenhuma viagem aprovada em andamento hoje.</Card>}
        {data.map((r) => {
          const visitas = r.paradas.filter((p) => p.tipo !== "pernoite");
          const feitas = visitas.filter(paradaInformada).length;
          const noites = noitesDaViagem(r.data_inicio ?? r.data_rota, r.data_fim);
          const ultimaNoite = [...(r.pernoites ?? [])].sort((a, b) => a.noite.localeCompare(b.noite)).pop();
          const real = (r.gastos ?? []).reduce((s, g) => s + Number(g.valor), 0);
          const hotel = (r.gastos ?? []).filter((g) => g.categoria === "hotel").reduce((s, g) => s + Number(g.valor), 0);
          return (
            <Card key={r.id} className="p-4 flex flex-wrap items-center gap-4 cursor-pointer hover:border-primary/50" onClick={() => navigate(`/viagens/${r.id}/acompanhar`)}>
              <div className="flex-1 min-w-48">
                <p className="font-semibold">{r.vendedor?.nome || r.vendedor?.email || "Vendedor"}</p>
                <p className="text-sm text-muted-foreground">{periodoRota(r)}</p>
                <p className="text-xs text-muted-foreground">Gasto real {formatBRL(real)} (hotel {formatBRL(hotel)}){r.custo_total_est != null ? ` · estimado ${formatBRL(Number(r.custo_total_est))}` : ""}</p>
              </div>
              <div className="w-40">
                <p className="text-sm">{feitas} de {visitas.length} paradas · {visitas.length - feitas} pendentes</p>
                {noites.length > 0 && <p className="text-xs text-muted-foreground">{ultimaNoite ? `Dormiu: ${ultimaNoite.cidade ? `${ultimaNoite.cidade}/${ultimaNoite.estado}` : TIPOS_NOITE.find((t) => t.id === ultimaNoite.tipo)?.nome}` : "Nenhuma noite registrada"} · {(r.pernoites ?? []).length}/{noites.length} noites</p>}
                <div className="h-2 rounded bg-muted overflow-hidden"><div className="h-full bg-primary" style={{ width: `${visitas.length ? (100 * feitas) / visitas.length : 0}%` }} /></div>
              </div>
              <div className="flex-1 min-w-56 text-sm">
                {r.ultimo ? <><p className="line-clamp-2">{r.ultimo.texto}</p><p className="text-xs text-muted-foreground">Último informativo {haQuantoTempo(r.ultimo.registrado_em)}</p></> : <p className="text-muted-foreground">Sem informativos ainda</p>}
              </div>
            </Card>
          );
        })}
      </main>
    </div>
  );
}
