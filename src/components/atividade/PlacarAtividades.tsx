import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { format } from "date-fns";
import { liberarOrcamentoHoje, percentualNoPrazo } from "@/lib/atividadesAcoes";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

interface Linha {
  responsavel_id: string; vencendo_semana: number; no_prazo_semana: number; vencidas_abertas: number;
  mais_antiga: string | null; empurrando: number; reagendamentos_semana: number;
  nao_fiz_semana: number; liberacoes_semana: number;
  organizacoes_completadas?: number; organizacoes_descartadas?: number;
}

/** Aba admin: atrasadas por vendedor + placar semanal (só acompanhamento). */
export default function PlacarAtividades({ nomes, onVerVendedor }: { nomes: Record<string, string>; onVerVendedor: (uid: string) => void }) {
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [indisponivel, setIndisponivel] = useState(false);
  const [liberar, setLiberar] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [recarga, setRecarga] = useState(0);

  const confirmarLiberacao = async () => {
    if (!liberar) return;
    setSalvando(true);
    try {
      await liberarOrcamentoHoje(liberar, motivo);
      toast.success(`${nomes[liberar] || "Vendedor"} liberado para criar orçamentos hoje`);
      setLiberar(null); setMotivo(""); setRecarga((n) => n + 1);
    } catch (e: any) { toast.error(e?.message); } finally { setSalvando(false); }
  };

  useEffect(() => {
    (supabase as any).from("atividades_placar_semanal").select("*").then(({ data, error }: any) => {
      if (error) { setIndisponivel(true); setLinhas([]); return; }
      setLinhas(((data ?? []) as Linha[]).filter((l) => l.vencidas_abertas || l.vencendo_semana || l.reagendamentos_semana || l.empurrando || l.nao_fiz_semana || l.liberacoes_semana || l.organizacoes_completadas || l.organizacoes_descartadas)
        .sort((a, b) => b.vencidas_abertas - a.vencidas_abertas));
    });
  }, [recarga]);

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
            <th className="text-right p-2">Não fiz (semana)</th>
            <th className="text-right p-2">Liberações (semana)</th>
            <th className="text-right p-2">Orgs completadas</th>
            <th className="text-right p-2">Orgs descartadas</th>
            <th className="p-2"></th>
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
                <td className={`p-2 text-right tabular-nums ${l.nao_fiz_semana ? "text-destructive font-semibold" : ""}`}>{l.nao_fiz_semana}</td>
                <td className="p-2 text-right tabular-nums">{l.liberacoes_semana}</td>
                <td className="p-2 text-right tabular-nums">{l.organizacoes_completadas ?? "—"}</td>
                <td className="p-2 text-right tabular-nums">{l.organizacoes_descartadas ?? "—"}</td>
                <td className="p-2 text-right" onClick={(e) => e.stopPropagation()}>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setLiberar(l.responsavel_id)}>Liberar por hoje</Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <Dialog open={!!liberar} onOpenChange={(o) => { if (!o) { setLiberar(null); setMotivo(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Liberar {liberar ? nomes[liberar] || "vendedor" : ""} por hoje</DialogTitle>
            <DialogDescription>Ele poderá criar orçamentos hoje mesmo com atividades vencidas. Fica registrado quem liberou e o motivo.</DialogDescription>
          </DialogHeader>
          <Textarea rows={3} placeholder="Motivo *" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setLiberar(null)}>Voltar</Button>
            <Button onClick={confirmarLiberacao} disabled={salvando}>Liberar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
