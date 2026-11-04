import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Smartphone } from "lucide-react";
import { getParadas, getRota } from "@/lib/rotas";
import { diaRota, hojeRota, paradaInformada, periodoRota } from "@/lib/rotasFluxo";
import { diasDaViagem, ordenarParadasViagem } from "@/lib/viagem";
import { listDiario, listGastos } from "@/lib/viagemDados";
import { podeLancarGasto } from "@/lib/viagemDiario";
import { useAuth } from "@/hooks/useAuth";
import RotaMapa from "@/components/rotas/RotaMapa";
import RotaStatus from "@/components/rotas/RotaStatus";
import CustoViagemCard, { custoSalvo } from "@/components/rotas/CustoViagemCard";
import ComparativoCard from "@/components/viagens/ComparativoCard";
import GastosViagem from "@/components/viagens/GastosViagem";
import DiarioTimeline from "@/components/viagens/DiarioTimeline";

export default function ViagemAcompanhar() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const { data: rota, isLoading } = useQuery({ queryKey: ["rota", id], queryFn: () => getRota(id), enabled: !!id });
  const { data: brutas = [] } = useQuery({ queryKey: ["rota-paradas", id], queryFn: () => getParadas(id), enabled: !!id });
  const { data: diario = [] } = useQuery({ queryKey: ["rota-diario", id], queryFn: () => listDiario(id), enabled: !!id });
  const { data: gastos = [] } = useQuery({ queryKey: ["rota-gastos", id], queryFn: () => listGastos(id), enabled: !!id });
  const { data: vendedor } = useQuery({ queryKey: ["perfil", rota?.vendedor_id], enabled: !!rota, queryFn: async () => (await (await import("@/integrations/supabase/client")).supabase.from("profiles").select("nome,email").eq("user_id", rota!.vendedor_id).maybeSingle()).data });
  const inicio = rota?.data_inicio ?? rota?.data_rota ?? hojeRota();
  const paradas = useMemo(() => ordenarParadasViagem(brutas.map((p) => ({ ...p, dia: p.dia ?? inicio })), inicio), [brutas, inicio]);

  if (isLoading) return <p className="p-6 text-muted-foreground">Carregando...</p>;
  if (!rota) return <p className="p-6">Viagem não encontrada ou sem acesso.</p>;
  const dono = rota.vendedor_id === user?.id;
  const est = custoSalvo(rota);
  const dias = diasDaViagem(inicio, rota.data_fim);
  const visitas = paradas.filter((p) => p.tipo !== "pernoite");

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="bg-background border-b"><div className="max-w-6xl mx-auto px-4 py-3 flex justify-between"><Button variant="ghost" onClick={() => navigate(-1)}><ArrowLeft className="w-4 h-4 mr-2" />Voltar</Button><AppHeader /></div></header>
      <main className="max-w-6xl mx-auto px-4 py-6 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold">Acompanhar viagem</h1><RotaStatus status={rota.status} />
          <span className="text-muted-foreground">{vendedor?.nome || vendedor?.email} · {periodoRota(rota)} · {visitas.filter(paradaInformada).length} de {visitas.length} paradas informadas</span>
          {dono && rota.status === "aprovada" && <Button size="sm" className="ml-auto" onClick={() => navigate(`/viagens/${id}/hoje`)}><Smartphone className="w-4 h-4 mr-1" />Viagem de hoje</Button>}
        </div>
        <div className="grid lg:grid-cols-2 gap-4">
          <Card className="overflow-hidden"><RotaMapa vendedorId={rota.vendedor_id} veiculoId={rota.veiculo_id} paradas={brutas} inicio={inicio} fim={rota.data_fim} /></Card>
          <div className="space-y-3">
            {est ? <CustoViagemCard custo={est} /> : <Card className="p-3 text-sm text-muted-foreground">Custo estimado não registrado.</Card>}
            <ComparativoCard estimado={est} gastos={gastos} />
            <GastosViagem rotaId={id} gastos={gastos} editavel={(dono && podeLancarGasto(rota)) || isAdmin} />
          </div>
        </div>
        <Card className="p-4 space-y-3">
          <h2 className="font-semibold">Paradas</h2>
          {dias.map((d, i) => (
            <div key={d}><p className="text-sm font-medium text-muted-foreground">Dia {i + 1} · {diaRota(d)}</p>
              <ul className="divide-y">{paradas.filter((p) => p.dia === d).map((p) => (
                <li key={p.id} className="py-2 text-sm flex gap-2">
                  <span className={`mt-1 w-2.5 h-2.5 rounded-full shrink-0 ${p.tipo === "pernoite" ? "bg-muted-foreground" : p.visitada === true ? "bg-primary" : p.visitada === false ? "bg-destructive" : "bg-border"}`} />
                  <div><span className="font-medium">{p.tipo === "pernoite" ? `Pernoite: ${p.hotel_nome}` : (p.organizacao?.nome_fantasia || p.organizacao?.nome || p.cidade)}</span>
                    <span className="text-muted-foreground"> · {p.tipo === "pernoite" ? "hotel" : p.visitada === true ? `Visitada — ${p.resultado}` : p.visitada === false ? `Não visitada — ${p.motivo_nao_visita}` : "Pendente"}</span></div>
                </li>))}</ul></div>))}
        </Card>
        <Card className="p-4 space-y-3"><h2 className="font-semibold">Diário de bordo</h2><DiarioTimeline itens={diario} paradas={paradas} podeApagar={isAdmin} /></Card>
      </main>
    </div>
  );
}
