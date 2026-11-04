import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatBRL } from "@/lib/smartcycle";
import { resumoViagensMes, type RotaResumo } from "@/lib/viagemDiario";

/** "Viagens do mês" por vendedor. `mes` = YYYY-MM. Viagens contam no mês em que começam. */
export default function ViagensMesCard({ mes }: { mes: string }) {
  const [a, m] = mes.split("-").map(Number);
  const inicio = `${mes}-01`;
  const fim = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
  const { data, isLoading } = useQuery({
    queryKey: ["viagens-mes", mes],
    queryFn: async () => {
      const db = supabase as any;
      const { data: rotas, error } = await db.from("rotas").select("id,vendedor_id,status,data_rota,data_inicio,data_fim,prestacao_concluida_em,custo_total_est,paradas:rota_paradas(tipo,visitada)").gte("data_inicio", inicio).lte("data_inicio", fim);
      if (error) throw error;
      const ids = (rotas ?? []).map((r: any) => r.id);
      const ate = `${fim}T23:59:59.999-03:00`, de = `${inicio}T00:00:00-03:00`;
      const [g, h, o, p] = await Promise.all([
        ids.length ? db.from("rota_gastos").select("rota_id,valor").in("rota_id", ids) : { data: [] },
        db.from("historico_oportunidade").select("usuario_id,oportunidade_id").eq("tipo_mudanca", "etapa").gte("created_at", de).lte("created_at", ate),
        db.from("orcamentos").select("responsavel_id").gte("created_at", de).lte("created_at", ate),
        supabase.from("profiles").select("user_id,nome,email"),
      ]);
      const linhas = resumoViagensMes({
        rotas: (rotas ?? []) as RotaResumo[], gastos: g.data ?? [], dealsAvancados: h.data ?? [],
        orcamentos: (o.data ?? []).map((x: any) => ({ user_id: x.responsavel_id })),
      });
      const nome = (id: string) => { const pp = (p.data ?? []).find((x: any) => x.user_id === id); return pp?.nome || pp?.email || "—"; };
      return linhas.map((l) => ({ ...l, nome: nome(l.vendedor_id) })).sort((x, y) => y.investido - x.investido);
    },
  });
  return (
    <Card className="p-4">
      <h3 className="font-semibold mb-1">Viagens do mês</h3>
      <p className="text-xs text-muted-foreground mb-3">Investido = gastos reais lançados; sem gastos, usa o estimado (*). Deals = oportunidades que mudaram de etapa no mês.</p>
      <Table>
        <TableHeader><TableRow>
          <TableHead>Vendedor</TableHead><TableHead className="text-right">Investido</TableHead><TableHead className="text-right">Viagens</TableHead><TableHead className="text-right">Dias em campo</TableHead>
          <TableHead className="text-right">Visitas (feitas/plan.)</TableHead><TableHead className="text-right">Custo por visita</TableHead><TableHead className="text-right">Deals avançados</TableHead><TableHead className="text-right">Orçamentos</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {(data ?? []).map((l) => (
            <TableRow key={l.vendedor_id}>
              <TableCell className="font-medium">{l.nome}</TableCell>
              <TableCell className="text-right">{formatBRL(l.investido)}{l.investidoEstimado ? " *" : ""}</TableCell>
              <TableCell className="text-right">{l.viagens}</TableCell>
              <TableCell className="text-right">{l.dias}</TableCell>
              <TableCell className="text-right">{l.visitasFeitas}/{l.visitasPlanejadas}</TableCell>
              <TableCell className="text-right">{l.custoPorVisita == null ? "—" : formatBRL(l.custoPorVisita)}</TableCell>
              <TableCell className="text-right">{l.dealsAvancados}</TableCell>
              <TableCell className="text-right">{l.orcamentos}</TableCell>
            </TableRow>
          ))}
          {!isLoading && !data?.length && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">Sem viagens neste mês</TableCell></TableRow>}
        </TableBody>
      </Table>
    </Card>
  );
}
