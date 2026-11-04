import { Card } from "@/components/ui/card";
import { formatBRL } from "@/lib/smartcycle";
import { comparativo, type Estimado, type CategoriaGasto } from "@/lib/viagemDiario";

const v = (n: number | null) => (n == null ? "—" : formatBRL(n));
const dif = (n: number | null) => n == null ? "—" : `${n > 0 ? "+" : ""}${formatBRL(n)}`;

export default function ComparativoCard({ estimado, gastos }: { estimado: Estimado | null; gastos: { categoria: CategoriaGasto; valor: number }[] }) {
  const c = comparativo(estimado, gastos);
  return (
    <Card className="p-3 space-y-2" aria-label="Estimado x real">
      <p className="font-semibold">Estimado x real</p>
      {!c.temGastos && <p className="text-xs text-muted-foreground">Nenhum gasto real lançado ainda.</p>}
      <table className="w-full text-sm">
        <thead><tr className="text-muted-foreground text-left"><th className="font-normal">Categoria</th><th className="font-normal text-right">Estimado</th><th className="font-normal text-right">Real</th><th className="font-normal text-right">Diferença</th></tr></thead>
        <tbody>
          {c.linhas.map((l) => <tr key={l.categoria}><td>{l.nome}</td><td className="text-right">{v(l.estimado)}</td><td className="text-right">{formatBRL(l.real)}</td><td className={`text-right ${l.diferenca != null && l.diferenca > 0 ? "text-destructive" : ""}`}>{dif(l.diferenca)}</td></tr>)}
          <tr className="font-semibold border-t"><td>Total</td><td className="text-right">{v(c.totalEstimado)}</td><td className="text-right">{formatBRL(c.totalReal)}</td><td className={`text-right ${c.diferencaTotal != null && c.diferencaTotal > 0 ? "text-destructive" : ""}`}>{dif(c.diferencaTotal)}</td></tr>
        </tbody>
      </table>
    </Card>
  );
}
