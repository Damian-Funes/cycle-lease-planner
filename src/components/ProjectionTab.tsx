import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SmartCycleParams, YearProjection, formatBRL, formatNumber } from "@/lib/smartcycle";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

interface Props {
  params: SmartCycleParams;
  projection: YearProjection[];
}

export default function ProjectionTab({ params, projection }: Props) {
  const chartData = projection.map((r) => ({
    name: `Ano ${r.ano}`,
    "Receita Mínimo": r.receitaAnual,
    fase: r.fase,
  }));

  const subtotalF1 = projection.filter((r) => r.fase === 1).reduce((s, r) => s + r.receitaAnual, 0);
  const subtotalF2 = projection.filter((r) => r.fase === 2).reduce((s, r) => s + r.receitaAnual, 0);
  const totalGeral = params.entrada + subtotalF1 + subtotalF2;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Receita Anual Projetada</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(210, 18%, 90%)" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(value: number) => formatBRL(value)}
                  contentStyle={{ borderRadius: "8px", border: "1px solid hsl(210, 18%, 90%)" }}
                />
                <Legend />
                <Bar dataKey="Receita Mínimo" fill="hsl(160, 84%, 39%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Detalhamento por Ano</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 px-2 font-semibold text-muted-foreground">Ano</th>
                <th className="py-2 px-2 font-semibold text-muted-foreground">Fase</th>
                <th className="py-2 px-2 font-semibold text-muted-foreground text-right">Preço/Saco</th>
                <th className="py-2 px-2 font-semibold text-muted-foreground text-right">Vol. Mínimo</th>
                <th className="py-2 px-2 font-semibold text-muted-foreground text-right">Mensalidade</th>
                <th className="py-2 px-2 font-semibold text-muted-foreground text-right">Receita Anual</th>
              </tr>
            </thead>
            <tbody>
              {projection.map((r) => (
                <tr key={r.ano} className={`border-b last:border-0 ${r.fase === 1 ? "bg-phase1-light/30" : "bg-phase2-light/30"}`}>
                  <td className="py-2 px-2 font-medium">{r.ano}</td>
                  <td className="py-2 px-2">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${r.fase === 1 ? "bg-primary/10 text-primary" : "bg-phase2/10 text-phase2"}`}>
                      Fase {r.fase}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-right">{formatBRL(r.precoSaco)}</td>
                  <td className="py-2 px-2 text-right">{formatNumber(r.volumeMinimo)}</td>
                  <td className="py-2 px-2 text-right">{formatBRL(r.mensalidade)}</td>
                  <td className="py-2 px-2 text-right font-semibold">{formatBRL(r.receitaAnual)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="font-semibold">
              <tr className="border-t-2">
                <td colSpan={5} className="py-2 px-2 text-right">Subtotal Fase 1 (Anos 1–5)</td>
                <td className="py-2 px-2 text-right">{formatBRL(subtotalF1)}</td>
              </tr>
              <tr>
                <td colSpan={5} className="py-2 px-2 text-right">Subtotal Fase 2 (Anos 6–10)</td>
                <td className="py-2 px-2 text-right">{formatBRL(subtotalF2)}</td>
              </tr>
              <tr>
                <td colSpan={5} className="py-2 px-2 text-right">+ Entrada</td>
                <td className="py-2 px-2 text-right">{formatBRL(params.entrada)}</td>
              </tr>
              <tr className="bg-primary text-primary-foreground">
                <td colSpan={5} className="py-3 px-2 text-right font-bold rounded-bl-lg">Total Geral (10 Anos)</td>
                <td className="py-3 px-2 text-right font-bold rounded-br-lg">{formatBRL(totalGeral)}</td>
              </tr>
            </tfoot>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
