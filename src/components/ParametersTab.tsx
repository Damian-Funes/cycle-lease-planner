import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SmartCycleParams, YearProjection, formatBRL, formatNumber } from "@/lib/smartcycle";
import { DollarSign, TrendingUp, Calendar, Package } from "lucide-react";

interface Props {
  params: SmartCycleParams;
  onUpdate: (key: keyof SmartCycleParams, value: number | string) => void;
  projection: YearProjection[];
}

function ParamInput({
  label,
  value,
  onChange,
  prefix,
  suffix,
  step,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  prefix?: string;
  suffix?: string;
  step?: number;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-muted-foreground">{label}</label>
      <div className="flex items-center gap-1">
        {prefix && <span className="text-sm text-muted-foreground">{prefix}</span>}
        <input
          type="number"
          value={value}
          step={step || 1}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="w-full h-9 px-3 rounded-md border bg-background text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
      </div>
    </div>
  );
}

export default function ParametersTab({ params, onUpdate, projection }: Props) {
  const mensalidadeF1 = (params.volumeMinAnual * params.tarifaF1) / 12;
  const volumeF2 = Math.round(params.volumeMinAnual * (params.volumeMinF2Pct / 100));
  const mensalidadeF2 = (volumeF2 * params.tarifaF2) / 12;
  const total10anos = params.implantacao + projection.reduce((s, r) => s + r.receitaAnual, 0);

  return (
    <div className="space-y-6">
      {/* Parameter Cards */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-primary" /> Implantação
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ParamInput label="Valor da Implantação (R$)" value={params.implantacao} onChange={(v) => onUpdate("implantacao", v)} step={0.01} prefix="R$" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="w-4 h-4 text-primary" /> Produção
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ParamInput label="Volume Mínimo Anual (sacos)" value={params.volumeMinAnual} onChange={(v) => onUpdate("volumeMinAnual", v)} />
            <ParamInput label="Peso por Saco (kg)" value={params.pesoPorSaco} onChange={(v) => onUpdate("pesoPorSaco", v)} suffix="kg" />
            <ParamInput label="Produção Real Estimada (sacos/ano)" value={params.producaoReal} onChange={(v) => onUpdate("producaoReal", v)} />
            <ParamInput label="Volume Mínimo Fase 2 (% da Fase 1)" value={params.volumeMinF2Pct} onChange={(v) => onUpdate("volumeMinF2Pct", v)} suffix="%" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" /> Tarifas por Saco
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ParamInput label="Fase 1 — Anos 1 a 5 (R$)" value={params.tarifaF1} onChange={(v) => onUpdate("tarifaF1", v)} prefix="R$" step={0.01} />
            <ParamInput label="Fase 2 — Anos 6 a 10 (R$)" value={params.tarifaF2} onChange={(v) => onUpdate("tarifaF2", v)} prefix="R$" step={0.01} />
            <ParamInput label="Excedente (R$)" value={params.tarifaExcedente} onChange={(v) => onUpdate("tarifaExcedente", v)} prefix="R$" step={0.01} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" /> Reajuste
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ParamInput label="Reajuste anual estimado (%)" value={params.reajuste} onChange={(v) => onUpdate("reajuste", v)} suffix="%" step={0.1} />
          </CardContent>
        </Card>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard label="Implantação" value={formatBRL(params.implantacao)} />
        <SummaryCard label="Mensalidade Fase 1 (Ano 1)" value={formatBRL(mensalidadeF1)} />
        <SummaryCard label="Mensalidade Fase 2 (Ano 6)" value={formatBRL(mensalidadeF2)} />
        <SummaryCard label="Total 10 Anos" value={formatBRL(total10anos)} highlight />
      </div>
    </div>
  );
}

function SummaryCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <Card className={highlight ? "bg-primary border-primary" : ""}>
      <CardContent className="pt-4 pb-4">
        <p className={`text-xs font-medium mb-1 ${highlight ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{label}</p>
        <p className={`text-lg font-bold ${highlight ? "text-primary-foreground" : "text-foreground"}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
