import { Card, CardContent } from "@/components/ui/card";
import { SmartCycleParams, YearProjection, formatBRL, formatNumber } from "@/lib/smartcycle";
import { Separator } from "@/components/ui/separator";
import { RefreshCw, ArrowRight, ShoppingCart } from "lucide-react";

interface Props {
  params: SmartCycleParams;
  projection: YearProjection[];
}

export default function ProposalTab({ params, projection }: Props) {
  const mensalidadeF1 = (params.volumeMinAnual * params.tarifaF1) / 12;
  const volumeF2 = Math.round(params.volumeMinAnual * (params.volumeMinF2Pct / 100));
  const mensalidadeF2 = (volumeF2 * params.tarifaF2) / 12;
  const subtotalF1 = projection.filter((r) => r.fase === 1).reduce((s, r) => s + r.receitaAnual, 0);
  const subtotalF2 = projection.filter((r) => r.fase === 2).reduce((s, r) => s + r.receitaAnual, 0);
  const totalExcedente = projection.reduce((s, r) => s + r.receitaExcedente, 0);
  const totalGeral = params.implantacao + subtotalF1 + subtotalF2;

  const tarifaKgF1 = params.pesoPorSaco > 0 ? params.tarifaF1 / params.pesoPorSaco : 0;
  const tarifaKgF2 = params.pesoPorSaco > 0 ? params.tarifaF2 / params.pesoPorSaco : 0;
  const kgF1 = params.volumeMinAnual * params.pesoPorSaco;
  const kgF2 = volumeF2 * params.pesoPorSaco;

  return (
    <div className="max-w-3xl mx-auto space-y-6 print:space-y-4">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg">
          <span className="font-bold text-lg">LS</span>
          <Separator orientation="vertical" className="h-5 bg-primary-foreground/30" />
          <span className="font-semibold text-sm">SmartCycle</span>
        </div>
        <h2 className="text-2xl font-bold text-foreground">Proposta Comercial SmartCycle LS</h2>
        {params.clientName && <p className="text-lg text-muted-foreground">Cliente: <strong className="text-foreground">{params.clientName}</strong></p>}
        <p className="text-sm text-muted-foreground">Ciclo operacional de 10 anos</p>
      </div>

      {/* 3 highlight cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="text-center transition-all duration-300 hover:shadow-md hover:-translate-y-0.5">
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground mb-1">Implantação</p>
            <p className="text-lg font-bold text-foreground">{formatBRL(params.implantacao)}</p>
          </CardContent>
        </Card>
        <Card className="text-center transition-all duration-300 hover:shadow-md hover:-translate-y-0.5">
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground mb-1">Mensalidade Ano 1</p>
            <p className="text-lg font-bold text-foreground">{formatBRL(mensalidadeF1)}</p>
          </CardContent>
        </Card>
        <Card className="text-center transition-all duration-300 hover:shadow-md hover:-translate-y-0.5">
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground mb-1">Mensalidade Ano 6</p>
            <p className="text-lg font-bold text-foreground">{formatBRL(mensalidadeF2)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Phase comparison */}
      <div className="grid md:grid-cols-2 gap-4">
        <PhaseCard
          title="Fase 1 — Anos 1 a 5"
          tarifaSaco={params.tarifaF1}
          tarifaKg={tarifaKgF1}
          volume={params.volumeMinAnual}
          kgTotal={kgF1}
          receita={subtotalF1}
          colorClass="border-primary/30 bg-secondary/50"
        />
        <PhaseCard
          title="Fase 2 — Anos 6 a 10"
          tarifaSaco={params.tarifaF2}
          tarifaKg={tarifaKgF2}
          volume={volumeF2}
          kgTotal={kgF2}
          receita={subtotalF2}
          colorClass="border-phase2/30 bg-phase2-light/50"
        />
      </div>

      {/* Excedentes */}
      <Card className="border-accent bg-accent/10">
        <CardContent className="pt-5 pb-4">
          <h3 className="font-semibold text-accent-foreground mb-2">📦 Política de Excedentes</h3>
          <p className="text-sm text-accent-foreground/80">
            Volumes acima do mínimo contratado serão cobrados à tarifa de <strong>{formatBRL(params.tarifaExcedente)}/saco</strong>, com reajuste anual de {params.reajuste.toLocaleString("pt-BR")}%.
            {totalExcedente > 0 && <> Receita estimada de excedentes: <strong>{formatBRL(totalExcedente)}</strong> no período.</>}
          </p>
        </CardContent>
      </Card>

      {/* Options */}
      <Card className="bg-muted/50">
        <CardContent className="pt-5 pb-4">
          <h3 className="font-semibold text-foreground mb-3">Ao final do contrato (Ano 10)</h3>
          <div className="grid gap-3">
            <OptionRow icon={<RefreshCw className="w-4 h-4" />} title="Renovar" desc="Renovar o contrato por novo período com condições renegociadas." />
            <OptionRow icon={<ArrowRight className="w-4 h-4" />} title="Continuar" desc="Manter os equipamentos em operação com tarifa de manutenção." />
            <OptionRow icon={<ShoppingCart className="w-4 h-4" />} title="Adquirir" desc="Adquirir os equipamentos pelo valor residual acordado." />
          </div>
        </CardContent>
      </Card>

      {/* Total */}
      <Card className="bg-primary border-primary transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
        <CardContent className="pt-6 pb-6 text-center">
          <p className="text-sm text-primary-foreground/80 mb-1">Valor Total Projetado em 10 Anos</p>
          <p className="text-3xl font-bold text-primary-foreground mb-4">{formatBRL(totalGeral)}</p>
          <div className="grid grid-cols-3 gap-4 text-primary-foreground/80 text-xs">
            <div>
              <p>Implantação</p>
              <p className="font-semibold text-primary-foreground">{formatBRL(params.implantacao)}</p>
            </div>
            <div>
              <p>Fase 1</p>
              <p className="font-semibold text-primary-foreground">{formatBRL(subtotalF1)}</p>
            </div>
            <div>
              <p>Fase 2</p>
              <p className="font-semibold text-primary-foreground">{formatBRL(subtotalF2)}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PhaseCard({ title, tarifaSaco, tarifaKg, volume, kgTotal, receita, colorClass }: {
  title: string; tarifaSaco: number; tarifaKg: number; volume: number; kgTotal: number; receita: number; colorClass: string;
}) {
  return (
    <Card className={`transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 ${colorClass}`}>
      <CardContent className="pt-5 pb-4 space-y-2">
        <h3 className="font-semibold text-foreground">{title}</h3>
        <div className="grid grid-cols-2 gap-y-1 text-sm">
          <span className="text-muted-foreground">Tarifa/saco</span>
          <span className="text-right font-medium">{formatBRL(tarifaSaco)}</span>
          <span className="text-muted-foreground">Tarifa/kg</span>
          <span className="text-right font-medium">{formatBRL(tarifaKg)}</span>
          <span className="text-muted-foreground">Vol. mínimo</span>
          <span className="text-right font-medium">{formatNumber(volume)} sacos</span>
          <span className="text-muted-foreground">Equiv. em kg</span>
          <span className="text-right font-medium">{formatNumber(kgTotal)} kg</span>
        </div>
        <Separator />
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">Receita da fase</span>
          <span className="font-bold text-foreground">{formatBRL(receita)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function OptionRow({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex gap-3 items-start">
      <div className="w-8 h-8 rounded-full bg-background flex items-center justify-center shrink-0 text-primary">{icon}</div>
      <div>
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
    </div>
  );
}
