import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SmartCycleParams, YearProjection, formatBRL, formatNumber, calcDivida, calcVolumeMinimoAnual, calcSomaFatores, VOLUME_MINIMO_PISO } from "@/lib/smartcycle";
import { DollarSign, TrendingUp, Calendar, Calculator, Info } from "lucide-react";

interface Props {
  params: SmartCycleParams;
  onUpdate: (key: keyof SmartCycleParams, value: number | string) => void;
  projection: YearProjection[];
}

function formatInputValue(value: number, decimals: number = 0): string {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function parseInputValue(text: string): number {
  // Remove dots (thousand separator), replace comma with dot (decimal separator)
  const cleaned = text.replace(/\./g, "").replace(",", ".");
  return parseFloat(cleaned) || 0;
}

function ParamInput({
  label,
  value,
  onChange,
  prefix,
  suffix,
  decimals = 0,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  hint?: string;
}) {
  const [focused, setFocused] = useState(false);
  const [rawText, setRawText] = useState("");

  const handleFocus = useCallback(() => {
    setFocused(true);
    setRawText(formatInputValue(value, decimals));
  }, [value, decimals]);

  const handleBlur = useCallback(() => {
    setFocused(false);
    onChange(parseInputValue(rawText));
  }, [rawText, onChange]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setRawText(e.target.value);
  }, []);

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-muted-foreground">{label}</label>
      <div className="flex items-center gap-1">
        {prefix && <span className="text-sm text-muted-foreground">{prefix}</span>}
        <input
          type="text"
          inputMode="decimal"
          value={focused ? rawText : formatInputValue(value, decimals)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onChange={handleChange}
          className="w-full h-9 px-3 rounded-md border bg-background text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring text-right"
        />
        {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
      </div>
      {hint && <p className="text-xs text-muted-foreground/70 flex items-center gap-1"><Info className="w-3 h-3" />{hint}</p>}
    </div>
  );
}

export default function ParametersTab({ params, onUpdate, projection }: Props) {
  const divida = calcDivida(params);
  const volumeMin = calcVolumeMinimoAnual(params);
  const volumeF2 = Math.round(volumeMin * (params.volumeMinF2Pct / 100));
  const mensalidadeF1 = (volumeMin * params.tarifaF1) / 12;
  const mensalidadeF2 = (volumeF2 * params.tarifaF2) / 12;
  const total10anos = params.entrada + projection.reduce((s, r) => s + r.receitaAnual, 0);
  const somaFatores = calcSomaFatores(params.reajuste, 5);
  const receitaMinF1 = projection.filter(r => r.fase === 1).reduce((s, r) => s + r.receitaAnual, 0);
  const coberturaF1 = divida > 0 ? (receitaMinF1 / divida) * 100 : 0;
  const entradaPct = params.valorProjeto > 0 ? (params.entrada / params.valorProjeto) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Valor do Projeto + Entrada + Dívida */}
      <div className="grid md:grid-cols-3 gap-4">
        <Card className="transition-all duration-300 hover:shadow-md hover:-translate-y-0.5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-primary" /> Valor Total do Projeto
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ParamInput label="Valor Total (R$)" value={params.valorProjeto} onChange={(v) => onUpdate("valorProjeto", v)} decimals={2} prefix="R$" />
          </CardContent>
        </Card>

        <Card className="transition-all duration-300 hover:shadow-md hover:-translate-y-0.5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-primary" /> Entrada (Implantação)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ParamInput label="Valor da Entrada (R$)" value={params.entrada} onChange={(v) => onUpdate("entrada", v)} decimals={2} prefix="R$" hint="Pago até a entrega da máquina" />
          </CardContent>
        </Card>

        <Card className="border-primary/30 bg-secondary/50 transition-all duration-300 hover:shadow-md hover:-translate-y-0.5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Calculator className="w-4 h-4 text-primary" /> Dívida a Financiar
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-2xl font-bold text-foreground">{formatBRL(divida)}</p>
            <p className="text-xs text-muted-foreground">Será paga em 5 anos pela tarifa por saco</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${Math.min(coberturaF1, 100)}%` }} />
              </div>
              <span className="text-xs font-semibold text-primary">{coberturaF1.toFixed(1)}%</span>
            </div>
            <p className="text-xs text-muted-foreground">Cobertura Fase 1</p>
          </CardContent>
        </Card>
      </div>

      {/* Tarifas + Reajuste + Produção */}
      <div className="grid md:grid-cols-3 gap-4">
        <Card className="transition-all duration-300 hover:shadow-md hover:-translate-y-0.5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" /> Tarifas por Saco
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ParamInput label="Fase 1 — Anos 1 a 5 (R$)" value={params.tarifaF1} onChange={(v) => onUpdate("tarifaF1", v)} prefix="R$" decimals={2} />
            <ParamInput label="Fase 2 — Anos 6 a 10 (R$)" value={params.tarifaF2} onChange={(v) => onUpdate("tarifaF2", v)} prefix="R$" decimals={2} />
            <ParamInput label="Excedente (R$)" value={params.tarifaExcedente} onChange={(v) => onUpdate("tarifaExcedente", v)} prefix="R$" decimals={2} />
          </CardContent>
        </Card>

        <Card className="transition-all duration-300 hover:shadow-md hover:-translate-y-0.5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" /> Reajuste &amp; Peso
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ParamInput label="Reajuste anual estimado (%)" value={params.reajuste} onChange={(v) => onUpdate("reajuste", v)} suffix="%" decimals={1} />
            <ParamInput label="Peso por Saco (kg)" value={params.pesoPorSaco} onChange={(v) => onUpdate("pesoPorSaco", v)} suffix="kg" />
            <ParamInput label="Volume Mínimo Fase 2 (% da Fase 1)" value={params.volumeMinF2Pct} onChange={(v) => onUpdate("volumeMinF2Pct", v)} suffix="%" />
          </CardContent>
        </Card>

        {/* Volume Mínimo Calculado */}
        <Card className="border-primary bg-secondary/30 transition-all duration-300 hover:shadow-md hover:-translate-y-0.5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Calculator className="w-4 h-4 text-primary" /> Volume Mínimo Calculado
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-y-2 text-sm">
              <span className="text-muted-foreground">Fase 1 (sacos/ano)</span>
              <span className="text-right font-bold">{formatNumber(volumeMin)}</span>
              <span className="text-muted-foreground">Fase 1 (kg/ano)</span>
              <span className="text-right font-bold">{formatNumber(volumeMin * params.pesoPorSaco)}</span>
              <span className="text-muted-foreground">Fase 2 (sacos/ano)</span>
              <span className="text-right font-bold">{formatNumber(volumeF2)}</span>
              <span className="text-muted-foreground">Mensalidade Ano 1</span>
              <span className="text-right font-bold text-primary">{formatBRL(mensalidadeF1)}</span>
            </div>
            <div className="mt-2 p-2 bg-muted/50 rounded text-xs text-muted-foreground space-y-1">
              <p className="font-medium">Fórmula: Dívida ÷ (Tarifa F1 × Σ fatores reajuste 5 anos)</p>
              <p>{formatBRL(divida)} ÷ ({formatBRL(params.tarifaF1)} × {somaFatores.toFixed(4)}) = <strong>{formatNumber(volumeMin)} sacos/ano</strong></p>
              {volumeMin === VOLUME_MINIMO_PISO && (
                <p className="text-accent-foreground font-medium flex items-center gap-1">
                  <Info className="w-3 h-3" /> Piso mínimo de {formatNumber(VOLUME_MINIMO_PISO)} sacos/ano aplicado
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard label={`Entrada (${entradaPct.toFixed(1)}% do projeto)`} value={formatBRL(params.entrada)} />
        <SummaryCard label="Mensalidade Fase 1 (Ano 1)" value={formatBRL(mensalidadeF1)} />
        <SummaryCard label="Mensalidade Fase 2 (Ano 6)" value={formatBRL(mensalidadeF2)} />
        <SummaryCard label="Total 10 Anos" value={formatBRL(total10anos)} highlight />
      </div>
    </div>
  );
}

function SummaryCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <Card className={`transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 ${highlight ? "bg-primary border-primary" : ""}`}>
      <CardContent className="pt-4 pb-4">
        <p className={`text-xs font-medium mb-1 ${highlight ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{label}</p>
        <p className={`text-lg font-bold ${highlight ? "text-primary-foreground" : "text-foreground"}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
