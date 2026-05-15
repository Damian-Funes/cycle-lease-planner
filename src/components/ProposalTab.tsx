import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { SmartCycleParams, YearProjection, formatBRL, formatNumber, calcDivida, calcVolumeMinimoAnual } from "@/lib/smartcycle";
import { Separator } from "@/components/ui/separator";
import { RefreshCw, ArrowRight, ShoppingCart, Download, Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import EquipmentTable from "./EquipmentTable";
import SeletorOrganizacao from "./SeletorOrganizacao";
import { generateProposalPdf } from "@/lib/generatePdf";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

interface Props {
  params: SmartCycleParams;
  projection: YearProjection[];
  onUpdate: (key: keyof SmartCycleParams, value: number | string) => void;
  onSave?: () => Promise<void>;
  savedId?: string | null;
}

export default function ProposalTab({ params, projection, onUpdate, onSave, savedId }: Props) {
  const [exporting, setExporting] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const { toast } = useToast();

  const volumeMin = calcVolumeMinimoAnual(params);
  const volumeF2 = Math.round(volumeMin * (params.volumeMinF2Pct / 100));
  const mensalidadeF1 = (volumeMin * params.tarifaF1) / 12;
  const mensalidadeF2 = (volumeF2 * params.tarifaF2) / 12;
  const subtotalF1 = projection.filter((r) => r.fase === 1).reduce((s, r) => s + r.receitaAnual, 0);
  const subtotalF2 = projection.filter((r) => r.fase === 2).reduce((s, r) => s + r.receitaAnual, 0);
  const totalGeral = params.entrada + subtotalF1 + subtotalF2;
  const divida = calcDivida(params);

  const tarifaKgF1 = params.pesoPorSaco > 0 ? params.tarifaF1 / params.pesoPorSaco : 0;
  const tarifaKgF2 = params.pesoPorSaco > 0 ? params.tarifaF2 / params.pesoPorSaco : 0;
  const kgF1 = volumeMin * params.pesoPorSaco;
  const kgF2 = volumeF2 * params.pesoPorSaco;
  const entradaPct = params.valorProjeto > 0 ? (params.entrada / params.valorProjeto) * 100 : 0;

  const handleExportPdf = async () => {
    // If proposal hasn't been saved yet (no number), prompt to save first
    if (!params.numeroProposta && onSave) {
      setSaveDialogOpen(true);
      return;
    }
    setExporting(true);
    try {
      console.log("[ProposalTab] Iniciando geração de PDF...");
      await generateProposalPdf(params, projection);
      console.log("[ProposalTab] PDF gerado com sucesso");
      toast({ title: "PDF gerado!", description: "O download deve iniciar em instantes." });
    } catch (e: any) {
      console.error("[ProposalTab] Erro ao gerar PDF:", e);
      toast({ title: "Erro ao gerar PDF", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const handleSaveAndExport = async () => {
    setSaveDialogOpen(false);
    setExporting(true);
    try {
      if (onSave) await onSave();
      // Small delay to let state update with the new numeroProposta
      await new Promise(r => setTimeout(r, 300));
      await generateProposalPdf(params, projection);
      toast({ title: "PDF gerado!", description: "O download deve iniciar em instantes." });
    } catch (e: any) {
      console.error("[ProposalTab] Erro ao salvar e exportar PDF:", e);
      toast({ title: "Erro ao gerar PDF", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 print:space-y-4 animate-fade-in">
      {/* Header + Export */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="text-center flex-1 space-y-2">
          <div className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg">
            <span className="font-bold text-lg">LS</span>
            <Separator orientation="vertical" className="h-5 bg-primary-foreground/30" />
            <span className="font-semibold text-sm">SmartCycle</span>
          </div>
          <h2 className="text-2xl font-bold text-foreground">Aluguel Comercial SmartCycle LS</h2>
          {params.clientName && <p className="text-lg text-muted-foreground">Cliente: <strong className="text-foreground">{params.clientName}</strong></p>}
          {params.numeroProposta && <p className="text-sm text-muted-foreground">Nº {params.numeroProposta}</p>}
          <p className="text-sm text-muted-foreground">Ciclo operacional de 10 anos</p>
        </div>
        <Button
          onClick={handleExportPdf}
          disabled={exporting}
          className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Exportar PDF
        </Button>
      </div>

      {/* Save before export dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Salvar aluguel</DialogTitle>
            <DialogDescription>
              O aluguel precisa ser salvo antes de exportar o PDF para gerar o número automático. Deseja salvar agora?
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveAndExport} className="gap-1">
              Salvar e Exportar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Status + Observações */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-muted-foreground">Status</label>
          <Select value={params.status} onValueChange={(v) => onUpdate("status", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="rascunho">Rascunho</SelectItem>
              <SelectItem value="enviada">Enviada</SelectItem>
              <SelectItem value="aprovada">Aprovada</SelectItem>
              <SelectItem value="recusada">Recusada</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-muted-foreground">Observações</label>
          <textarea
            value={params.observacoes}
            onChange={(e) => onUpdate("observacoes", e.target.value)}
            placeholder="Anotações do comercial..."
            className="w-full h-20 px-3 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          />
        </div>
      </div>

      {/* Dados do cliente para PDF */}
      <Card>
        <CardContent className="pt-5 pb-4 space-y-4">
          <h3 className="font-semibold text-foreground text-sm">Dados do Cliente (para PDF)</h3>
          <SeletorOrganizacao
            value={{ organizacao_id: params.organizacao_id, pessoa_contato_id: params.pessoa_contato_id }}
            onChange={(v) => {
              onUpdate("organizacao_id" as any, (v.organizacao_id ?? "") as any);
              onUpdate("pessoa_contato_id" as any, (v.pessoa_contato_id ?? "") as any);
            }}
            disabled={!!params.dados_congelados}
          />
          <div className="grid md:grid-cols-2 gap-3 pt-2">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Local de entrega</label>
              <Input value={params.localEntrega} onChange={(e) => onUpdate("localEntrega", e.target.value)} placeholder="Endereço de entrega" className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Validade (dias)</label>
              <Input type="number" value={params.validadeDias} onChange={(e) => onUpdate("validadeDias", Number(e.target.value))} className="h-8 text-sm w-24" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Equipamentos do Projeto */}
      <EquipmentTable itens={params.itensProjeto} />

      {/* 4 highlight cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="text-center transition-all duration-300 hover:shadow-md hover:-translate-y-0.5">
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground mb-1">Valor do Projeto</p>
            <p className="text-lg font-bold text-foreground">{formatBRL(params.valorProjeto)}</p>
          </CardContent>
        </Card>
        <Card className="text-center transition-all duration-300 hover:shadow-md hover:-translate-y-0.5">
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground mb-1">Entrada ({entradaPct.toFixed(1)}%)</p>
            <p className="text-lg font-bold text-foreground">{formatBRL(params.entrada)}</p>
          </CardContent>
        </Card>
        <Card className="text-center transition-all duration-300 hover:shadow-md hover:-translate-y-0.5">
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground mb-1">Mensalidade Ano 1</p>
            <p className="text-lg font-bold text-foreground">{formatBRL(mensalidadeF1)}</p>
            <p className="text-[10px] text-muted-foreground">{formatNumber(volumeMin)} × {formatBRL(params.tarifaF1)} ÷ 12</p>
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
          volume={volumeMin}
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
            Volumes acima do mínimo contratado serão cobrados à tarifa de <strong>{formatBRL(params.tarifaExcedente)}/saco</strong> ({formatBRL(params.pesoPorSaco > 0 ? params.tarifaExcedente / params.pesoPorSaco : 0)}/kg), com reajuste anual de {params.reajuste.toLocaleString("pt-BR")}%.
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
              <p>Entrada</p>
              <p className="font-semibold text-primary-foreground">{formatBRL(params.entrada)}</p>
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
