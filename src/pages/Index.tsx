import { useState, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DEFAULT_PARAMS, SmartCycleParams, calcProjection } from "@/lib/smartcycle";
import ParametersTab from "@/components/ParametersTab";
import ProjectionTab from "@/components/ProjectionTab";
import ProposalTab from "@/components/ProposalTab";
import { Settings, BarChart3, FileText } from "lucide-react";

const Index = () => {
  const [params, setParams] = useState<SmartCycleParams>(DEFAULT_PARAMS);
  const projection = useMemo(() => calcProjection(params), [params]);

  const update = (key: keyof SmartCycleParams, value: number | string) => {
    setParams((prev) => ({ ...prev, [key]: value }));
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
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-muted-foreground whitespace-nowrap">Cliente:</label>
            <input
              type="text"
              placeholder="Nome do cliente"
              value={params.clientName}
              onChange={(e) => update("clientName", e.target.value)}
              className="h-9 px-3 rounded-md border bg-background text-sm w-48 md:w-64 focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="container max-w-6xl mx-auto px-4 py-6">
        <Tabs defaultValue="params" className="space-y-6">
          <TabsList className="bg-card border w-full justify-start gap-1 h-auto p-1 flex-wrap">
            <TabsTrigger value="params" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Settings className="w-4 h-4" /> Parâmetros
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
            <ProposalTab params={params} projection={projection} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Index;
