import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ArrowLeft, LayoutGrid, Plus, Loader2, FileText, Receipt, Search, Trash2, Check, ChevronsUpDown, Layers } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

import AppHeader from "@/components/AppHeader";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { listLayouts, LayoutRow } from "@/lib/layouts";
import type { ItemProjeto } from "@/lib/equipamentos";

type OrigemTipo = "proposta" | "orcamento";

interface OrigemOption {
  id: string;
  tipo: OrigemTipo;
  numero: string | null;
  cliente: string;
  endereco: string | null;
  telefone: string | null;
  itens: ItemProjeto[];
}

const STATUS_LABEL: Record<LayoutRow["status"], { label: string; cls: string }> = {
  rascunho: { label: "Rascunho", cls: "bg-muted text-muted-foreground" },
  aprovado: { label: "Aprovado", cls: "bg-primary/10 text-primary" },
  arquivado: { label: "Arquivado", cls: "bg-amber-500/10 text-amber-700" },
};

export default function Layouts() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [layouts, setLayouts] = useState<LayoutRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [novoOpen, setNovoOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [excluindo, setExcluindo] = useState<LayoutRow | null>(null);
  const [deletando, setDeletando] = useState(false);

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    setLoading(true);
    try {
      setLayouts(await listLayouts());
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao carregar layouts";
      toast({ title: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function handleExcluir() {
    if (!excluindo) return;
    setDeletando(true);
    try {
      await supabase.from("layout_conexoes").delete().eq("layout_id", excluindo.id);
      await supabase.from("layout_equipamentos").delete().eq("layout_id", excluindo.id);
      const { error } = await supabase.from("layouts").delete().eq("id", excluindo.id);
      if (error) throw error;
      toast({ title: "Layout excluído" });
      setExcluindo(null);
      await refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao excluir";
      toast({ title: msg, variant: "destructive" });
    } finally {
      setDeletando(false);
    }
  }


  return (
    <div className="min-h-screen bg-muted/20">
      <header className="bg-background border-b sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="gap-1">
              <ArrowLeft className="w-4 h-4" /> Início
            </Button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-md bg-teal-500/10 text-teal-600 flex items-center justify-center">
                <LayoutGrid className="w-4 h-4" />
              </div>
              <div>
                <div className="font-semibold leading-tight">Layouts</div>
                <div className="text-xs text-muted-foreground leading-tight">Vista em planta dos projetos</div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setTemplateOpen(true)} className="gap-1">
              <Layers className="w-4 h-4" /> Layout Padrão
            </Button>
            <Button size="sm" onClick={() => setNovoOpen(true)} className="gap-1">
              <Plus className="w-4 h-4" /> Novo Layout
            </Button>
            <AppHeader />
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : layouts.length === 0 ? (
          <Card className="p-12 text-center">
            <div className="w-16 h-16 rounded-xl bg-teal-500/10 text-teal-600 flex items-center justify-center mx-auto mb-4">
              <LayoutGrid className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold mb-1">Nenhum layout ainda</h2>
            <p className="text-muted-foreground mb-4">Crie um layout a partir de uma proposta de aluguel ou de um orçamento.</p>
            <Button onClick={() => setNovoOpen(true)} className="gap-1">
              <Plus className="w-4 h-4" /> Criar primeiro layout
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {layouts.map((l) => (
              <div key={l.id} className="relative group">
                <Link to={`/layouts/${l.id}`}>
                  <Card className="p-4 cursor-pointer hover:shadow-md hover:border-primary/40 transition-all h-full">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {l.origem_tipo === "proposta" ? <FileText className="w-3.5 h-3.5" /> : <Receipt className="w-3.5 h-3.5" />}
                        <span className="capitalize">{l.origem_tipo}</span>
                        <span>·</span>
                        <span>{l.revisao}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_LABEL[l.status].cls}`}>
                        {STATUS_LABEL[l.status].label}
                      </span>
                    </div>
                    <div className="font-semibold mb-0.5 truncate pr-8">{l.cliente || "Sem cliente"}</div>
                    <div className="text-xs text-muted-foreground mb-3 truncate">
                      {[l.unidade, l.cidade].filter(Boolean).join(" · ") || "—"}
                    </div>
                    <div className="aspect-[4/3] rounded-md bg-muted/40 border border-dashed flex items-center justify-center text-xs text-muted-foreground">
                      {(l.piso_largura_mm / 1000).toFixed(1)}m × {(l.piso_comprimento_mm / 1000).toFixed(1)}m
                    </div>
                    <div className="text-xs text-muted-foreground mt-2">
                      Atualizado {new Date(l.updated_at).toLocaleDateString("pt-BR")}
                    </div>
                  </Card>
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-2 right-2 h-7 w-7 opacity-0 group-hover:opacity-100 hover:bg-destructive hover:text-destructive-foreground transition-opacity"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setExcluindo(l); }}
                  title="Excluir layout"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </main>

      <NovoLayoutModal
        open={novoOpen}
        onOpenChange={setNovoOpen}
        onCreated={(id) => navigate(`/layouts/${id}`)}
      />

      <UsarTemplateModal
        open={templateOpen}
        onOpenChange={setTemplateOpen}
        onCreated={(id) => navigate(`/layouts/${id}`)}
      />

      <AlertDialog open={!!excluindo} onOpenChange={(o) => !o && setExcluindo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir layout?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o layout de "{excluindo?.cliente || "—"}"? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleExcluir} disabled={deletando} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deletando ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}


/* ---------------- modal ---------------- */

const MODELOS_MAQUINA = ["LSB130", "LSB150", "LSB300S", "LSB300D"] as const;
const TIPOS_INSTALACAO = ["Chão", "Torre"] as const;

interface OrgOption {
  id: string;
  nome: string;
  nome_fantasia: string | null;
  cnpj: string | null;
  cidade: string | null;
}

interface PessoaOption {
  id: string;
  nome: string;
  cargo: string | null;
}

function NovoLayoutModal({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const { toast } = useToast();
  const [tab, setTab] = useState<"origem" | "branco">("origem");

  const [pisoLarguraM, setPisoLarguraM] = useState("20");
  const [pisoComprimentoM, setPisoComprimentoM] = useState("15");
  const [modelo, setModelo] = useState<string>("");
  const [tipoInst, setTipoInst] = useState<string>("");
  const [observacoes, setObservacoes] = useState("");
  const [criando, setCriando] = useState(false);

  useEffect(() => {
    if (modelo === "LSB130") setTipoInst("Chão");
  }, [modelo]);

  const [origens, setOrigens] = useState<OrigemOption[]>([]);
  const [loadingOrigens, setLoadingOrigens] = useState(false);
  const [busca, setBusca] = useState("");
  const [selecionado, setSelecionado] = useState<OrigemOption | null>(null);

  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [orgOpen, setOrgOpen] = useState(false);
  const [orgSel, setOrgSel] = useState<OrgOption | null>(null);
  const [pessoas, setPessoas] = useState<PessoaOption[]>([]);
  const [pessoaSel, setPessoaSel] = useState<PessoaOption | null>(null);

  useEffect(() => {
    if (!open) {
      setSelecionado(null);
      setBusca("");
      setOrgSel(null);
      setPessoaSel(null);
      setPessoas([]);
      setModelo("");
      setTipoInst("");
      setObservacoes("");
      setTab("origem");
      return;
    }
    void loadOrigens();
    void loadOrgs();
  }, [open]);

  useEffect(() => {
    if (!orgSel) {
      setPessoas([]);
      setPessoaSel(null);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("pessoas")
        .select("id, nome, cargo")
        .eq("organizacao_id", orgSel.id)
        .order("nome");
      setPessoas((data ?? []) as PessoaOption[]);
    })();
  }, [orgSel]);

  async function loadOrgs() {
    const { data } = await supabase
      .from("organizacoes")
      .select("id, nome, nome_fantasia, cnpj, cidade")
      .order("nome")
      .limit(1000);
    setOrgs((data ?? []) as OrgOption[]);
  }

  async function loadOrigens() {
    setLoadingOrigens(true);
    const [props, orcs] = await Promise.all([
      supabase
        .from("propostas")
        .select("id, numero_proposta, nome_cliente, cliente_endereco, cliente_telefone, itens_projeto, organizacao_id")
        .order("created_at", { ascending: false }),
      supabase
        .from("orcamentos")
        .select("id, numero_orcamento, nome_cliente, cliente_endereco, cliente_telefone, itens, organizacao_id")
        .order("created_at", { ascending: false }),
    ]);

    const orgIds = new Set<string>();
    for (const p of props.data ?? []) if (p.organizacao_id) orgIds.add(p.organizacao_id);
    for (const o of orcs.data ?? []) if (o.organizacao_id) orgIds.add(o.organizacao_id);
    const orgMap = new Map<string, string>();
    if (orgIds.size > 0) {
      const { data: orgsData } = await (supabase as any)
        .from("organizacoes")
        .select("id, nome")
        .in("id", Array.from(orgIds));
      for (const o of orgsData ?? []) orgMap.set(o.id, o.nome);
    }
    const resolveNome = (nome: string | null | undefined, orgId: string | null | undefined) => {
      const n = (nome ?? "").trim();
      if (n && n !== "—") return n;
      if (orgId && orgMap.get(orgId)) return orgMap.get(orgId)!;
      return n || "—";
    };

    const lista: OrigemOption[] = [];
    for (const p of props.data ?? []) {
      lista.push({
        id: p.id,
        tipo: "proposta",
        numero: p.numero_proposta,
        cliente: resolveNome(p.nome_cliente, (p as any).organizacao_id),
        endereco: p.cliente_endereco,
        telefone: p.cliente_telefone,
        itens: Array.isArray(p.itens_projeto) ? (p.itens_projeto as unknown as ItemProjeto[]) : [],
      });
    }
    for (const o of orcs.data ?? []) {
      lista.push({
        id: o.id,
        tipo: "orcamento",
        numero: o.numero_orcamento,
        cliente: resolveNome(o.nome_cliente, (o as any).organizacao_id),
        endereco: o.cliente_endereco,
        telefone: o.cliente_telefone,
        itens: Array.isArray(o.itens) ? (o.itens as unknown as ItemProjeto[]) : [],
      });
    }
    setOrigens(lista);
    setLoadingOrigens(false);
  }

  const filtradas = useMemo(() => origens.filter((o) => {
    const q = busca.trim().toLowerCase();
    if (!q) return true;
    return (o.cliente || "").toLowerCase().includes(q) || (o.numero || "").toLowerCase().includes(q);
  }), [origens, busca]);

  function validarPiso(): { pLarg: number; pComp: number } | null {
    const pLarg = Math.round(parseFloat(pisoLarguraM.replace(",", ".")) * 1000);
    const pComp = Math.round(parseFloat(pisoComprimentoM.replace(",", ".")) * 1000);
    if (!pLarg || !pComp || pLarg < 5000 || pComp < 5000 || pLarg > 50000 || pComp > 50000) {
      toast({ title: "Dimensões do piso inválidas", description: "Mínimo 5m × 5m, máximo 50m × 50m.", variant: "destructive" });
      return null;
    }
    return { pLarg, pComp };
  }

  function baseInsert(pLarg: number, pComp: number) {
    return {
      piso_largura_mm: pLarg,
      piso_comprimento_mm: pComp,
      modelo_maquina: modelo || null,
      tipo_instalacao: tipoInst || null,
      observacoes: observacoes || null,
    } as Record<string, unknown>;
  }

  async function handleCriarOrigem() {
    if (!selecionado) {
      toast({ title: "Escolha uma proposta ou orçamento", variant: "destructive" });
      return;
    }
    const piso = validarPiso();
    if (!piso) return;

    setCriando(true);

    const { data: layoutData, error: layoutErr } = await supabase
      .from("layouts")
      .insert({
        ...baseInsert(piso.pLarg, piso.pComp),
        origem_tipo: selecionado.tipo,
        origem_id: selecionado.id,
        cliente: selecionado.cliente,
        cidade: null,
        unidade: null,
      } as any)
      .select("id")
      .maybeSingle();

    if (layoutErr || !layoutData) {
      setCriando(false);
      toast({ title: "Erro ao criar layout", description: layoutErr?.message, variant: "destructive" });
      return;
    }

    const layoutId = layoutData.id;

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const equipamentoIds = Array.from(new Set(selecionado.itens.map((i) => i.equipamento_id).filter((id): id is string => !!id && UUID_RE.test(id))));
    let equipamentos: { id: string; codigo: string; largura_mm: number | null; imagem_url: string | null }[] = [];
    if (equipamentoIds.length > 0) {
      const { data: eqData } = await supabase
        .from("equipamentos")
        .select("id, codigo, largura_mm, imagem_url")
        .in("id", equipamentoIds);
      equipamentos = (eqData ?? []) as typeof equipamentos;
    }
    const equipMap = new Map(equipamentos.map((e) => [e.id, e]));

    const { listContidos, buildPaiParaFilhos, calcularOcultos } = await import("@/lib/equipamentoContidos");
    let ocultos = new Set<string>();
    let codigosOcultos: string[] = [];
    try {
      const pares = await listContidos();
      const paiParaFilhos = buildPaiParaFilhos(pares);
      ocultos = calcularOcultos(equipamentoIds, paiParaFilhos);
      codigosOcultos = Array.from(ocultos).map((id) => equipMap.get(id)?.codigo).filter(Boolean) as string[];
    } catch { /* ignore */ }

    const inserts: Array<{ layout_id: string; equipamento_id: string; pos_x_mm: number; pos_y_mm: number; ordem: number; }> = [];
    const naoEncontrados: string[] = [];
    const semImagem: string[] = [];

    let xCursor = 1000;
    const yPos = 1000;
    let ordem = 0;
    const espacamento = 500;

    for (const item of selecionado.itens) {
      const eq = equipMap.get(item.equipamento_id);
      if (!eq) { naoEncontrados.push(item.codigo); continue; }
      if (ocultos.has(eq.id)) continue;
      if (!eq.imagem_url) semImagem.push(eq.codigo);
      const qtd = Math.max(1, Number(item.quantidade) || 1);
      const w = eq.largura_mm ?? 1000;
      for (let i = 0; i < qtd; i++) {
        inserts.push({ layout_id: layoutId, equipamento_id: eq.id, pos_x_mm: xCursor + w / 2, pos_y_mm: yPos, ordem: ordem++ });
        xCursor += w + espacamento;
      }
    }

    if (inserts.length > 0) {
      const { error: insErr } = await supabase.from("layout_equipamentos").insert(inserts);
      if (insErr) toast({ title: "Erro ao adicionar equipamentos", description: insErr.message, variant: "destructive" });
    }

    setCriando(false);
    onOpenChange(false);

    if (naoEncontrados.length > 0 || semImagem.length > 0 || codigosOcultos.length > 0) {
      const partes: string[] = [];
      if (naoEncontrados.length > 0) partes.push(`${naoEncontrados.length} item(s) sem cadastro: ${naoEncontrados.join(", ")}`);
      if (semImagem.length > 0) partes.push(`${semImagem.length} sem imagem: ${semImagem.join(", ")}`);
      if (codigosOcultos.length > 0) partes.push(`${codigosOcultos.length} já representado(s): ${codigosOcultos.join(", ")}`);
      toast({ title: "Layout criado com avisos", description: partes.join(" · ") });
    } else {
      toast({ title: "Layout criado!" });
    }
    onCreated(layoutId);
  }

  async function handleCriarBranco() {
    if (!orgSel) {
      toast({ title: "Selecione uma organização", variant: "destructive" });
      return;
    }
    if (!modelo) {
      toast({ title: "Selecione o modelo da máquina", variant: "destructive" });
      return;
    }
    const piso = validarPiso();
    if (!piso) return;

    setCriando(true);
    const { data, error } = await supabase
      .from("layouts")
      .insert({
        ...baseInsert(piso.pLarg, piso.pComp),
        organizacao_id: orgSel.id,
        pessoa_id: pessoaSel?.id ?? null,
        cliente: orgSel.nome,
        cidade: orgSel.cidade,
      } as any)
      .select("id")
      .maybeSingle();
    setCriando(false);

    if (error || !data) {
      toast({ title: "Erro ao criar layout", description: error?.message, variant: "destructive" });
      return;
    }
    toast({ title: "Layout criado!" });
    onOpenChange(false);
    onCreated(data.id);
  }

  const podeCriarBranco = !!orgSel && !!modelo && !!tipoInst;
  const lsb130 = modelo === "LSB130";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Novo Layout</DialogTitle>
          <DialogDescription>Escolha como deseja iniciar.</DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "origem" | "branco")} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid grid-cols-2">
            <TabsTrigger value="origem">A partir de proposta/orçamento</TabsTrigger>
            <TabsTrigger value="branco">Em branco</TabsTrigger>
          </TabsList>

          <TabsContent value="origem" className="space-y-3 flex-1 overflow-y-auto m-0 pt-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por cliente ou número..."
                className="w-full h-9 pl-9 pr-3 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="border rounded-md max-h-[260px] overflow-y-auto">
              {loadingOrigens ? (
                <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
              ) : filtradas.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">Nenhum item encontrado.</p>
              ) : (
                <ul className="divide-y">
                  {filtradas.map((o) => {
                    const isSel = selecionado?.id === o.id && selecionado.tipo === o.tipo;
                    return (
                      <li key={`${o.tipo}-${o.id}`}>
                        <button
                          type="button"
                          onClick={() => setSelecionado(o)}
                          className={`w-full text-left px-3 py-2.5 hover:bg-muted/50 flex items-start gap-3 transition-colors ${isSel ? "bg-primary/10" : ""}`}
                        >
                          {o.tipo === "proposta" ? <FileText className="w-4 h-4 mt-0.5 text-primary shrink-0" /> : <Receipt className="w-4 h-4 mt-0.5 text-amber-600 shrink-0" />}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{o.cliente}</div>
                            <div className="text-xs text-muted-foreground">{o.numero || "—"} · {o.itens.length} item(s)</div>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <CamposComuns
              modelo={modelo} setModelo={setModelo}
              tipoInst={tipoInst} setTipoInst={setTipoInst}
              observacoes={observacoes} setObservacoes={setObservacoes}
              pisoLarguraM={pisoLarguraM} setPisoLarguraM={setPisoLarguraM}
              pisoComprimentoM={pisoComprimentoM} setPisoComprimentoM={setPisoComprimentoM}
              lsb130={lsb130}
            />
          </TabsContent>

          <TabsContent value="branco" className="space-y-3 flex-1 overflow-y-auto m-0 pt-3">
            <div className="space-y-1.5">
              <Label>Organização *</Label>
              <Popover open={orgOpen} onOpenChange={setOrgOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                    <span className="truncate text-left">
                      {orgSel ? orgSel.nome : <span className="text-muted-foreground">Selecione uma organização…</span>}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command filter={(val, search) => {
                    const o = orgs.find((x) => x.id === val);
                    if (!o) return 0;
                    const hay = `${o.nome} ${o.nome_fantasia ?? ""} ${o.cnpj ?? ""}`.toLowerCase();
                    return hay.includes(search.toLowerCase()) ? 1 : 0;
                  }}>
                    <CommandInput placeholder="Buscar por nome ou CNPJ…" />
                    <CommandList>
                      <CommandEmpty>Nenhuma organização encontrada.</CommandEmpty>
                      <CommandGroup>
                        {orgs.map((o) => (
                          <CommandItem key={o.id} value={o.id} onSelect={() => { setOrgSel(o); setOrgOpen(false); }}>
                            <Check className={cn("mr-2 h-4 w-4", orgSel?.id === o.id ? "opacity-100" : "opacity-0")} />
                            <div className="flex flex-col min-w-0">
                              <span className="truncate">{o.nome}{o.nome_fantasia && <span className="text-muted-foreground"> · {o.nome_fantasia}</span>}</span>
                              {o.cidade && <span className="text-xs text-muted-foreground">{o.cidade}</span>}
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-1.5">
              <Label>Contato</Label>
              <Select
                disabled={!orgSel || pessoas.length === 0}
                value={pessoaSel?.id ?? ""}
                onValueChange={(v) => setPessoaSel(pessoas.find((p) => p.id === v) ?? null)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={!orgSel ? "Selecione a organização primeiro" : pessoas.length === 0 ? "Sem contatos cadastrados" : "Selecione um contato…"} />
                </SelectTrigger>
                <SelectContent>
                  {pessoas.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.nome}{p.cargo ? ` · ${p.cargo}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <CamposComuns
              modelo={modelo} setModelo={setModelo}
              tipoInst={tipoInst} setTipoInst={setTipoInst}
              observacoes={observacoes} setObservacoes={setObservacoes}
              pisoLarguraM={pisoLarguraM} setPisoLarguraM={setPisoLarguraM}
              pisoComprimentoM={pisoComprimentoM} setPisoComprimentoM={setPisoComprimentoM}
              lsb130={lsb130}
            />
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          {tab === "origem" ? (
            <Button onClick={handleCriarOrigem} disabled={!selecionado || criando} className="gap-1">
              {criando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Criar layout
            </Button>
          ) : (
            <Button onClick={handleCriarBranco} disabled={!podeCriarBranco || criando} className="gap-1">
              {criando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Criar layout
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CamposComuns({
  modelo, setModelo, tipoInst, setTipoInst, observacoes, setObservacoes,
  pisoLarguraM, setPisoLarguraM, pisoComprimentoM, setPisoComprimentoM, lsb130,
}: {
  modelo: string; setModelo: (v: string) => void;
  tipoInst: string; setTipoInst: (v: string) => void;
  observacoes: string; setObservacoes: (v: string) => void;
  pisoLarguraM: string; setPisoLarguraM: (v: string) => void;
  pisoComprimentoM: string; setPisoComprimentoM: (v: string) => void;
  lsb130: boolean;
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Modelo da máquina *</Label>
          <Select value={modelo} onValueChange={setModelo}>
            <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
            <SelectContent>
              {MODELOS_MAQUINA.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Tipo de instalação {lsb130 && <span className="text-xs text-muted-foreground">(travado p/ LSB130)</span>}</Label>
          <Select value={tipoInst} onValueChange={setTipoInst} disabled={lsb130}>
            <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
            <SelectContent>
              {TIPOS_INSTALACAO.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="piso-w">Largura do piso (m)</Label>
          <Input id="piso-w" type="number" min={5} max={50} step={0.5} value={pisoLarguraM} onChange={(e) => setPisoLarguraM(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="piso-h">Comprimento do piso (m)</Label>
          <Input id="piso-h" type="number" min={5} max={50} step={0.5} value={pisoComprimentoM} onChange={(e) => setPisoComprimentoM(e.target.value)} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Observações</Label>
        <Textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} placeholder="Notas internas…" rows={2} />
      </div>
    </>
  );
}

/* ---------------- Modal: Usar Template ---------------- */

interface TemplateOption {
  id: string;
  template_nome: string | null;
  modelo_maquina: string | null;
  tipo_instalacao: string | null;
  piso_largura_mm: number;
  piso_comprimento_mm: number;
}

function UsarTemplateModal({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const { toast } = useToast();
  const [step, setStep] = useState<"select" | "org">("select");
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [busca, setBusca] = useState("");
  const [tplSel, setTplSel] = useState<TemplateOption | null>(null);

  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [orgOpen, setOrgOpen] = useState(false);
  const [orgSel, setOrgSel] = useState<OrgOption | null>(null);
  const [pessoas, setPessoas] = useState<PessoaOption[]>([]);
  const [pessoaSel, setPessoaSel] = useState<PessoaOption | null>(null);
  const [observacoes, setObservacoes] = useState("");
  const [criando, setCriando] = useState(false);

  useEffect(() => {
    if (!open) {
      setStep("select");
      setTplSel(null);
      setOrgSel(null);
      setPessoaSel(null);
      setPessoas([]);
      setBusca("");
      setObservacoes("");
      return;
    }
    void loadTemplates();
    void loadOrgs();
  }, [open]);

  useEffect(() => {
    if (!orgSel) { setPessoas([]); setPessoaSel(null); return; }
    (async () => {
      const { data } = await supabase
        .from("pessoas")
        .select("id, nome, cargo")
        .eq("organizacao_id", orgSel.id)
        .order("nome");
      setPessoas((data ?? []) as PessoaOption[]);
    })();
  }, [orgSel]);

  async function loadTemplates() {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("layouts")
      .select("id, template_nome, modelo_maquina, tipo_instalacao, piso_largura_mm, piso_comprimento_mm")
      .eq("is_template", true)
      .order("modelo_maquina", { ascending: true })
      .order("template_nome", { ascending: true });
    setTemplates((data ?? []) as TemplateOption[]);
    setLoading(false);
  }

  async function loadOrgs() {
    const { data } = await supabase
      .from("organizacoes")
      .select("id, nome, nome_fantasia, cnpj, cidade")
      .order("nome")
      .limit(1000);
    setOrgs((data ?? []) as OrgOption[]);
  }

  const templatesFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter((t) =>
      (t.template_nome || "").toLowerCase().includes(q) ||
      (t.modelo_maquina || "").toLowerCase().includes(q)
    );
  }, [templates, busca]);

  const agrupados = useMemo(() => {
    return templatesFiltrados.reduce<Record<string, TemplateOption[]>>((acc, t) => {
      const m = t.modelo_maquina || "Sem modelo";
      (acc[m] ||= []).push(t);
      return acc;
    }, {});
  }, [templatesFiltrados]);

  async function handleCriar() {
    if (!tplSel || !orgSel) return;
    setCriando(true);
    try {
      // 1) cria layout copiando metadados do template
      const { data: novo, error: errCreate } = await supabase
        .from("layouts")
        .insert({
          piso_largura_mm: tplSel.piso_largura_mm,
          piso_comprimento_mm: tplSel.piso_comprimento_mm,
          modelo_maquina: tplSel.modelo_maquina,
          tipo_instalacao: tplSel.tipo_instalacao,
          observacoes: observacoes || null,
          organizacao_id: orgSel.id,
          pessoa_id: pessoaSel?.id ?? null,
          cliente: orgSel.nome,
          cidade: orgSel.cidade,
        } as any)
        .select("id")
        .maybeSingle();
      if (errCreate || !novo) throw errCreate ?? new Error("Falha ao criar layout");
      const novoId = novo.id;

      // 2) copia equipamentos do template
      const { data: tplItens } = await supabase
        .from("layout_equipamentos")
        .select("id, equipamento_id, pos_x_mm, pos_y_mm, pos_z_mm, rotacao, ordem, rotulo_customizado")
        .eq("layout_id", tplSel.id)
        .order("ordem");

      const idMap = new Map<string, string>(); // old item_id -> placeholder (será preenchido após insert)
      const inserts = (tplItens ?? []).map((it: any) => ({
        layout_id: novoId,
        equipamento_id: it.equipamento_id,
        pos_x_mm: it.pos_x_mm,
        pos_y_mm: it.pos_y_mm,
        pos_z_mm: it.pos_z_mm ?? 0,
        rotacao: it.rotacao,
        ordem: it.ordem,
        rotulo_customizado: it.rotulo_customizado,
      }));

      let novosItens: { id: string; ordem: number }[] = [];
      if (inserts.length > 0) {
        const { data: ins, error: insErr } = await supabase
          .from("layout_equipamentos")
          .insert(inserts)
          .select("id, ordem");
        if (insErr) throw insErr;
        novosItens = (ins ?? []) as typeof novosItens;

        // mapeia old id -> new id via ordem
        const newByOrdem = new Map(novosItens.map((n) => [n.ordem, n.id]));
        for (const it of tplItens ?? []) {
          const newId = newByOrdem.get((it as any).ordem);
          if (newId) idMap.set((it as any).id, newId);
        }
      }

      // 3) copia conexões do template
      const { data: tplConex } = await supabase
        .from("layout_conexoes")
        .select("item_origem_id, item_destino_id, ponto_origem_x, ponto_origem_y, ponto_origem_z, ponto_destino_x, ponto_destino_y, ponto_destino_z, tipo, cor")
        .eq("layout_id", tplSel.id);

      const conexInserts = (tplConex ?? [])
        .map((c: any) => {
          const origem = idMap.get(c.item_origem_id);
          const destino = idMap.get(c.item_destino_id);
          if (!origem || !destino) return null;
          return {
            layout_id: novoId,
            item_origem_id: origem,
            item_destino_id: destino,
            ponto_origem_x: c.ponto_origem_x,
            ponto_origem_y: c.ponto_origem_y,
            ponto_origem_z: c.ponto_origem_z,
            ponto_destino_x: c.ponto_destino_x,
            ponto_destino_y: c.ponto_destino_y,
            ponto_destino_z: c.ponto_destino_z,
            tipo: c.tipo,
            cor: c.cor,
          };
        })
        .filter(Boolean);

      if (conexInserts.length > 0) {
        await supabase.from("layout_conexoes").insert(conexInserts as any);
      }

      toast({ title: "Layout criado a partir do template!" });
      onOpenChange(false);
      onCreated(novoId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao criar layout";
      toast({ title: msg, variant: "destructive" });
    } finally {
      setCriando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {step === "select" ? "Escolher Layout Padrão" : "Vincular Organização"}
          </DialogTitle>
          <DialogDescription>
            {step === "select"
              ? "Selecione um template para iniciar um novo layout."
              : tplSel ? (
                <span>Template: <b>{tplSel.template_nome || "Sem nome"}</b>{tplSel.modelo_maquina && ` · ${tplSel.modelo_maquina}`}{tplSel.tipo_instalacao && ` · ${tplSel.tipo_instalacao}`}</span>
              ) : null}
          </DialogDescription>
        </DialogHeader>

        {step === "select" ? (
          <div className="flex-1 overflow-hidden flex flex-col gap-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por nome ou modelo..."
                className="w-full h-9 pl-9 pr-3 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="border rounded-md flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
              ) : templatesFiltrados.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">
                  {templates.length === 0
                    ? "Nenhum template salvo ainda. Crie um layout e use 'Salvar como Template' no editor."
                    : "Nenhum template corresponde à busca."}
                </p>
              ) : (
                <div className="divide-y">
                  {Object.entries(agrupados).map(([mod, lista]) => (
                    <div key={mod}>
                      <div className="text-xs font-semibold uppercase tracking-wide px-3 py-2 bg-muted/30 text-muted-foreground">{mod}</div>
                      <ul className="divide-y">
                        {lista.map((t) => (
                          <li key={t.id}>
                            <button
                              type="button"
                              onClick={() => { setTplSel(t); setStep("org"); }}
                              className="w-full text-left px-3 py-2.5 hover:bg-muted/50 flex items-start gap-3 transition-colors"
                            >
                              <Layers className="w-4 h-4 mt-0.5 text-primary shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium truncate">{t.template_nome || "Sem nome"}</div>
                                <div className="text-xs text-muted-foreground">
                                  {t.tipo_instalacao || "—"} · {(t.piso_largura_mm / 1000).toFixed(1)}m × {(t.piso_comprimento_mm / 1000).toFixed(1)}m
                                </div>
                              </div>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-end pt-2 border-t">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-3">
            <div className="space-y-1.5">
              <Label>Organização *</Label>
              <Popover open={orgOpen} onOpenChange={setOrgOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                    <span className="truncate text-left">
                      {orgSel ? orgSel.nome : <span className="text-muted-foreground">Selecione uma organização…</span>}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command filter={(val, search) => {
                    const o = orgs.find((x) => x.id === val);
                    if (!o) return 0;
                    const hay = `${o.nome} ${o.nome_fantasia ?? ""} ${o.cnpj ?? ""}`.toLowerCase();
                    return hay.includes(search.toLowerCase()) ? 1 : 0;
                  }}>
                    <CommandInput placeholder="Buscar por nome ou CNPJ…" />
                    <CommandList>
                      <CommandEmpty>Nenhuma organização encontrada.</CommandEmpty>
                      <CommandGroup>
                        {orgs.map((o) => (
                          <CommandItem key={o.id} value={o.id} onSelect={() => { setOrgSel(o); setOrgOpen(false); }}>
                            <Check className={cn("mr-2 h-4 w-4", orgSel?.id === o.id ? "opacity-100" : "opacity-0")} />
                            <div className="flex flex-col min-w-0">
                              <span className="truncate">{o.nome}{o.nome_fantasia && <span className="text-muted-foreground"> · {o.nome_fantasia}</span>}</span>
                              {o.cidade && <span className="text-xs text-muted-foreground">{o.cidade}</span>}
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-1.5">
              <Label>Contato</Label>
              <Select
                disabled={!orgSel || pessoas.length === 0}
                value={pessoaSel?.id ?? ""}
                onValueChange={(v) => setPessoaSel(pessoas.find((p) => p.id === v) ?? null)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={!orgSel ? "Selecione a organização primeiro" : pessoas.length === 0 ? "Sem contatos cadastrados" : "Selecione um contato…"} />
                </SelectTrigger>
                <SelectContent>
                  {pessoas.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.nome}{p.cargo ? ` · ${p.cargo}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} placeholder="Notas internas…" rows={2} />
            </div>

            <div className="flex justify-between gap-2 pt-2 border-t">
              <Button variant="ghost" onClick={() => setStep("select")} disabled={criando} className="gap-1">
                <ArrowLeft className="w-4 h-4" /> Voltar
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)} disabled={criando}>Cancelar</Button>
                <Button onClick={handleCriar} disabled={!orgSel || criando} className="gap-1">
                  {criando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Criar layout
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
