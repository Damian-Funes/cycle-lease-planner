import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { DEFAULT_PARAMS, SmartCycleParams, calcProjection, calcVolumeMinimoAnual, calcDivida } from "@/lib/smartcycle";
import { ItemProjeto, calcEntrada } from "@/lib/equipamentos";
import ParametersTab from "@/components/ParametersTab";
import ProjectionTab from "@/components/ProjectionTab";
import ProposalTab from "@/components/ProposalTab";
import PropostasUnificadasModal from "@/components/PropostasUnificadasModal";
import NovaPropostaButton from "@/components/NovaPropostaButton";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/hooks/useAuth";
import { Settings, BarChart3, FileText, Save, FolderOpen, Loader2, Package, Lock, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const Index = () => {
  const [params, setParams] = useState<SmartCycleParams>(DEFAULT_PARAMS);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [catalogoDialogOpen, setCatalogoDialogOpen] = useState(false);
  const [senha, setSenha] = useState("");
  const [senhaError, setSenhaError] = useState(false);
  const [clientNameError, setClientNameError] = useState(false);
  const clientNameRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { loading: authLoading, profile } = useAuth();

  const CATALOGO_SENHA = "36021214Df@";

  const projection = useMemo(() => calcProjection(params), [params]);

  const update = (key: keyof SmartCycleParams, value: number | string) => {
    setParams((prev) => ({ ...prev, [key]: value }));
  };

  const updateItens = useCallback((itens: ItemProjeto[]) => {
    const entrada = calcEntrada(itens);
    setParams((prev) => ({ ...prev, itensProjeto: itens, entrada }));
  }, []);

  const handleSave = useCallback(async () => {
    if (!params.organizacao_id) {
      setClientNameError(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
      toast({ title: "Selecione uma organização", variant: "destructive" });
      return;
    }
    setSaving(true);

    let numeroProposta = params.numeroProposta;
    if (!numeroProposta) {
      const year = new Date().getFullYear();
      const prefix = `SC${year}-`;
      const { data: lastProp } = await supabase
        .from("propostas")
        .select("numero_proposta")
        .like("numero_proposta", `${prefix}%`)
        .order("numero_proposta", { ascending: false })
        .limit(1)
        .maybeSingle();
      let seq = 1;
      if (lastProp?.numero_proposta) {
        const lastSeq = parseInt(lastProp.numero_proposta.replace(prefix, ""), 10);
        if (!isNaN(lastSeq)) seq = lastSeq + 1;
      }
      numeroProposta = `${prefix}${String(seq).padStart(3, "0")}`;
      setParams(prev => ({ ...prev, numeroProposta }));
    }

    const volumeMin = calcVolumeMinimoAnual(params);
    const volumeF2 = Math.round(volumeMin * (params.volumeMinF2Pct / 100));
    const divida = calcDivida(params);
    const mensalidadeF1 = (volumeMin * params.tarifaF1) / 12;
    const mensalidadeF2 = (volumeF2 * params.tarifaF2) / 12;
    const total10anos = params.entrada + projection.reduce((s, r) => s + r.receitaAnual, 0);

    const row = {
      organizacao_id: params.organizacao_id,
      pessoa_contato_id: params.pessoa_contato_id || null,
      oportunidade_id: params.oportunidade_id || null,
      nome_cliente: params.clientName || "—",
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
      itens_projeto: params.itensProjeto as any,
      contato_nome: params.contatoNome || null,
      cliente_endereco: params.clienteEndereco || null,
      cliente_telefone: params.clienteTelefone || null,
      cliente_cnpj: params.clienteCnpj || null,
      cliente_email: params.clienteEmail || null,
      validade_dias: params.validadeDias,
      local_entrega: params.localEntrega || null,
      numero_proposta: numeroProposta || null,
    };

    let error;
    let novoId: string | null = savedId;
    if (savedId) {
      const res = await supabase.from("propostas").update(row as any).eq("id", savedId);
      error = res.error;
    } else {
      const res = await supabase.from("propostas").insert(row as any).select("id").maybeSingle();
      error = res.error;
      if (res.data) {
        novoId = res.data.id;
        setSavedId(res.data.id);
      }
    }

    let criouOpp = false;
    if (!error && novoId && !params.oportunidade_id && params.organizacao_id) {
      const { criarOportunidadeAuto } = await import("@/lib/autoOportunidade");
      const oppId = await criarOportunidadeAuto({
        pipelineNome: "SmartCycle",
        organizacaoId: params.organizacao_id,
        titulo: `Aluguel ${numeroProposta || params.clientName}`,
        valor: Number(params.valorProjeto) || 0,
      });
      if (oppId) {
        await supabase.from("propostas").update({ oportunidade_id: oppId } as any).eq("id", novoId);
        setParams((p) => ({ ...p, oportunidade_id: oppId }));
        criouOpp = true;
      }
    }

    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({
        title: "Aluguel salvo!",
        description: criouOpp ? "Oportunidade criada no funil SmartCycle (etapa Lead)." : undefined,
      });
    }
  }, [params, savedId, projection, toast]);

  const handleLoad = (loadedParams: SmartCycleParams, id: string) => {
    setParams(loadedParams);
    setSavedId(id);
    toast({ title: "Aluguel carregado" });
  };

  const loadPropostaById = useCallback(async (loadId: string) => {
    const { data, error } = await supabase.from("propostas").select("*").eq("id", loadId).maybeSingle();

    if (error || !data) {
      toast({ title: "Aluguel não encontrado", variant: "destructive" });
      return;
    }

    const loaded: SmartCycleParams = {
      clientName: data.nome_cliente,
      valorProjeto: Number(data.valor_projeto),
      entrada: Number(data.entrada),
      tarifaF1: Number(data.tarifa_f1),
      tarifaF2: Number(data.tarifa_f2),
      tarifaExcedente: Number(data.tarifa_excedente),
      reajuste: Number(data.reajuste_anual),
      pesoPorSaco: Number(data.peso_saco),
      volumeMinF2Pct: Number(data.vol_min_f2_pct),
      status: data.status || "rascunho",
      observacoes: data.observacoes || "",
      itensProjeto: Array.isArray(data.itens_projeto) ? (data.itens_projeto as unknown as ItemProjeto[]) : [],
      contatoNome: data.contato_nome || "",
      clienteEndereco: data.cliente_endereco || "",
      clienteTelefone: data.cliente_telefone || "",
      clienteCnpj: data.cliente_cnpj || "",
      clienteEmail: data.cliente_email || "",
      validadeDias: data.validade_dias ?? 10,
      localEntrega: data.local_entrega || "",
      numeroProposta: data.numero_proposta || "",
      organizacao_id: (data as any).organizacao_id ?? null,
      pessoa_contato_id: (data as any).pessoa_contato_id ?? null,
      oportunidade_id: (data as any).oportunidade_id ?? null,
      dados_congelados: (data as any).dados_congelados ?? false,
    };

    handleLoad(loaded, data.id);
  }, [toast]);

  const handleNova = () => {
    if (params.clientName || savedId) {
      const ok = window.confirm("Iniciar um novo aluguel? Alterações não salvas serão perdidas.");
      if (!ok) return;
    }
    setParams(DEFAULT_PARAMS);
    setSavedId(null);
    toast({ title: "Novo aluguel iniciado" });
  };

  // Deep-link: ?load=<id> carrega; ?novo=1 inicia novo; ?organizacao=/?oportunidade= pré-preenche
  useEffect(() => {
    if (authLoading || profile?.status !== "approved") return;

    const loadId = searchParams.get("load");
    const novo = searchParams.get("novo");
    const orgId = searchParams.get("organizacao");
    const oppId = searchParams.get("oportunidade");

    if (loadId) {
      void loadPropostaById(loadId).finally(() => {
        setSearchParams({}, { replace: true });
      });
      return;
    }

    if (novo) {
      setParams(DEFAULT_PARAMS);
      setSavedId(null);
    }

    const tipicoId = searchParams.get("tipico");
    if (tipicoId) {
      (async () => {
        const { carregarTipico, tipicoParaItensProjeto } = await import("@/lib/tipicoLoader");
        const r = await carregarTipico(tipicoId, "aluguel");
        if ("error" in r) {
          toast({ title: r.error, variant: "destructive" });
        } else {
          const itens = tipicoParaItensProjeto(r.resolvidos);
          updateItens(itens);
          if (r.naoEncontrados.length > 0) {
            toast({
              title: `${r.naoEncontrados.length} código(s) não encontrado(s)`,
              description: r.naoEncontrados.join(", "),
            });
          } else {
            toast({ title: `Típico "${r.tipico.nome}" aplicado` });
          }
        }
        setSearchParams({}, { replace: true });
      })();
      return;
    }

    if (oppId) {
      (async () => {
        const { data: opp } = await supabase
          .from("oportunidades")
          .select("organizacao_id")
          .eq("id", oppId)
          .maybeSingle();
        if (opp?.organizacao_id) {
          setParams((p) => ({ ...p, organizacao_id: opp.organizacao_id, oportunidade_id: oppId }));
          toast({ title: "Pré-preenchido a partir da oportunidade" });
        }
        setSearchParams({}, { replace: true });
      })();
      return;
    }

    if (orgId) {
      setParams((p) => ({ ...p, organizacao_id: orgId }));
      setSearchParams({}, { replace: true });
      return;
    }

    if (searchParams.get("propostas")) {
      setModalOpen(true);
      setSearchParams({}, { replace: true });
      return;
    }

    if (novo) setSearchParams({}, { replace: true });
  }, [authLoading, profile?.status, searchParams, setSearchParams, loadPropostaById, toast]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="container max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Voltar">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-sm">LS</span>
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground leading-tight">SmartCycle LS</h1>
              <p className="text-xs text-muted-foreground">Calculadora Comercial</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className={`h-9 px-3 rounded-md border bg-background text-sm flex items-center min-w-[180px] max-w-[280px] truncate ${clientNameError ? "border-destructive ring-2 ring-destructive animate-pulse" : ""}`}>
              <span className={params.clientName ? "text-foreground truncate" : "text-muted-foreground truncate"}>
                {params.clientName || "Selecione organização na aba Resumo"}
              </span>
            </div>
            <NovaPropostaButton onNovoAluguel={handleNova} />
            <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Salvar
            </Button>
            <Button size="sm" variant="outline" onClick={() => setModalOpen(true)} className="gap-1">
              <FolderOpen className="w-4 h-4" /> Propostas
            </Button>
            <Button size="sm" variant="ghost" className="gap-1" onClick={() => navigate("/catalogo")}>
              <Package className="w-4 h-4" /> Catálogo
            </Button>
            <AppHeader />
          </div>
        </div>
      </header>

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
              <FileText className="w-4 h-4" /> Resumo Aluguel
            </TabsTrigger>
          </TabsList>

          <TabsContent value="params" className="animate-fade-in">
            <ParametersTab params={params} onUpdate={update} projection={projection} onItensChange={updateItens} />
          </TabsContent>
          <TabsContent value="projection" className="animate-fade-in">
            <ProjectionTab params={params} projection={projection} />
          </TabsContent>
          <TabsContent value="proposal" className="animate-fade-in">
            <ProposalTab params={params} projection={projection} onUpdate={update} onSave={handleSave} savedId={savedId} />
          </TabsContent>
        </Tabs>
      </main>

      <PropostasUnificadasModal open={modalOpen} onOpenChange={setModalOpen} onLoadAluguel={loadPropostaById} />

      <Dialog open={catalogoDialogOpen} onOpenChange={setCatalogoDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="w-4 h-4" /> Acesso ao Catálogo
            </DialogTitle>
            <DialogDescription>Digite a senha para acessar o catálogo de equipamentos.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => {
            e.preventDefault();
            if (senha === CATALOGO_SENHA) {
              sessionStorage.setItem("catalogo_auth", "true");
              setCatalogoDialogOpen(false);
              navigate("/catalogo");
            } else {
              setSenhaError(true);
            }
          }} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="catalogo-senha">Senha</Label>
              <Input
                id="catalogo-senha"
                type="password"
                value={senha}
                onChange={(e) => { setSenha(e.target.value); setSenhaError(false); }}
                placeholder="Digite a senha"
                autoFocus
              />
              {senhaError && <p className="text-sm text-destructive">Senha incorreta.</p>}
            </div>
            <Button type="submit" className="w-full">Acessar</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Index;
