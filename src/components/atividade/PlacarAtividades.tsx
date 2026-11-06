import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { format } from "date-fns";
import { percentualNoPrazo } from "@/lib/atividadesAcoes";

interface Linha {
  responsavel_id: string; vencendo_semana: number; no_prazo_semana: number; vencidas_abertas: number;
  mais_antiga: string | null; empurrando: number; reagendamentos_semana: number;
}

/** Aba admin: atrasadas por vendedor + placar semanal (só acompanhamento). */
export default function PlacarAtividades({ nomes, onVerVendedor }: { nomes: Record<string, string>; onVerVendedor: (uid: string) => void }) {
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [indisponivel, setIndisponivel] = useState(false);

  useEffect(() => {
    (supabase as any).from("atividades_placar_semanal").select("*").then(({ data, error }: any) => {
      if (error) { setIndisponivel(true); setLinhas([]); return; }
      setLinhas(((data ?? []) as Linha[]).filter((l) => l.vencidas_abertas || l.vencendo_semana || l.reagendamentos_semana || l.empurrando)
        .sort((a, b) => b.vencidas_abertas - a.vencidas_abertas));
    });
  }, []);

  if (indisponivel) return <Card className="p-6 text-sm text-muted-foreground">O placar aparece depois que a migração de cobrança for aprovada e aplicada.</Card>;
  if (!linhas) return <Card className="p-6 text-sm text-muted-foreground">Carregando…</Card>;
  if (!linhas.length) return <Card className="p-6 text-sm text-muted-foreground">Nenhuma atividade atrasada. 👏</Card>;
  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs text-muted-foreground">
          <tr>
            <th className="text-left p-2">Vendedor</th>
            <th className="text-right p-2">Vencidas abertas</th>
            <th className="text-right p-2">Mais antiga</th>
            <th className="text-right p-2">Empurrando (3+)</th>
            <th className="text-right p-2">No prazo (semana)</th>
            <th className="text-right p-2">Reagendamentos (semana)</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => {
            const pct = percentualNoPrazo(l.no_prazo_semana, l.vencendo_semana);
            return (
              <tr key={l.responsavel_id} className="border-t hover:bg-muted/30 cursor-pointer" onClick={() => onVerVendedor(l.responsavel_id)}>
                <td className="p-2 font-medium">{nomes[l.responsavel_id] || "—"}</td>
                <td className={`p-2 text-right tabular-nums ${l.vencidas_abertas ? "text-destructive font-semibold" : ""}`}>{l.vencidas_abertas}</td>
                <td className="p-2 text-right tabular-nums">{l.mais_antiga ? format(new Date(l.mais_antiga), "dd/MM/yy") : "—"}</td>
                <td className={`p-2 text-right tabular-nums ${l.empurrando ? "text-destructive font-semibold" : ""}`}>{l.empurrando}</td>
                <td className="p-2 text-right tabular-nums">{pct === null ? "—" : `${pct}% (${l.no_prazo_semana}/${l.vencendo_semana})`}</td>
                <td className="p-2 text-right tabular-nums">{l.reagendamentos_semana}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}
