import { useState, useMemo, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { DEFAULT_PARAMS, SmartCycleParams, calcProjection, calcVolumeMinimoAnual, calcDivida } from "@/lib/smartcycle";
import ParametersTab from "@/components/ParametersTab";
import ProjectionTab from "@/components/ProjectionTab";
import ProposalTab from "@/components/ProposalTab";
import PropostasModal from "@/components/PropostasModal";
import { Settings, BarChart3, FileText, Save, FolderOpen, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const Index = () => {
  const [params, setParams] = useState<SmartCycleParams>(DEFAULT_PARAMS);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const { toast } = useToast();

  const projection = useMemo(() => calcProjection(params), [params]);

  const update = (key: keyof SmartCycleParams, value: number | string) => {
    setParams((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = useCallback(async () => {
    if (!params.clientName.trim()) {
      toast({ title: "Preencha o nome do cliente", variant: "destructive" });
      return;
    }
    setSaving(true);
    const volumeMin = calcVolumeMinimoAnual(params);
    const volumeF2 = Math.round(volumeMin * (params.volumeMinF2Pct / 100));
    const divida = calcDivida(params);
    const mensalidadeF1 = (volumeMin * params.tarifaF1) / 12;
    const mensalidadeF2 = (volumeF2 * params.tarifaF2) / 12;
    const total10anos = params.entrada + projection.reduce((s, r) => s + r.receitaAnual, 0);

    const row = {
      nome_cliente: params.clientName,
      valor_projeto: params.valorProjeto,
      entrada: params.entrada,
      divida,
      tarifa_f1: params.tarifaF1,
      tarifa_f2: params.tarifaF2,
      tarifa_excedente: params.tarifaExcedente,
      reajuste_anual: params.reajuste,
      peso_saco: params.pesoPorSaco,
      vol_min_f2_pct: params.volumeMinF2Pct,
      volume_minimo_calculado: volumeMin,
      mensalidade_f1: mensalidadeF1,
      mensalidade_f2: mensalidadeF2,
      total_10_anos: total10anos,
      status: params.status,
      observacoes: params.observacoes || null,
    };

    let error;
    if (savedId) {
      const res = await supabase.from("propostas").update(row).eq("id", savedId);
      error = res.error;
    } else {
      const res = await supabase.from("propostas").insert(row).select("id").maybeSingle();
      error = res.error;
      if (res.data) setSavedId(res.data.id);
    }

    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Proposta salva!" });
    }
  }, [params, savedId, projection, toast]);

  const handleLoad = (loadedParams: SmartCycleParams, id: string) => {
    setParams(loadedParams);
    setSavedId(id);
    toast({ title: "Proposta carregada" });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="container max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-sm">LS</span>
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground leading-tight">SmartCycle LS</h1>
              <p className="text-xs text-muted-foreground">Calculadora Comercial</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="text"
              placeholder="Nome do cliente"
              value={params.clientName}
              onChange={(e) => update("clientName", e.target.value)}
              className="h-9 px-3 rounded-md border bg-background text-sm w-48 md:w-64 focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Salvar
            </Button>
            <Button size="sm" variant="outline" onClick={() => setModalOpen(true)} className="gap-1">
              <FolderOpen className="w-4 h-4" /> Propostas
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="container max-w-6xl mx-auto px-4 py-6">
        <Tabs defaultValue="params" className="space-y-6">
          <TabsList className="bg-card border w-full justify-start gap-1 h-auto p-1 flex-wrap">
            <TabsTrigger value="params" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Settings className="w-4 h-4" /> Dimensionamento
            </TabsTrigger>
            <TabsTrigger value="projection" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <BarChart3 className="w-4 h-4" /> Projeção 10 Anos
            </TabsTrigger>
            <TabsTrigger value="proposal" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <FileText className="w-4 h-4" /> Resumo Proposta
            </TabsTrigger>
          </TabsList>

          <TabsContent value="params" className="animate-fade-in">
            <ParametersTab params={params} onUpdate={update} projection={projection} />
          </TabsContent>
          <TabsContent value="projection" className="animate-fade-in">
            <ProjectionTab params={params} projection={projection} />
          </TabsContent>
          <TabsContent value="proposal" className="animate-fade-in">
            <ProposalTab params={params} projection={projection} onUpdate={update} />
          </TabsContent>
        </Tabs>
      </main>

      <PropostasModal open={modalOpen} onOpenChange={setModalOpen} onLoad={handleLoad} />
    </div>
  );
};

export default Index;
