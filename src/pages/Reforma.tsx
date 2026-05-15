import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import {
  ReformaParams,
  ItemReformaSelecionado,
  ItemReformaCatalogo,
  DEFAULT_REFORMA,
  calcSubtotalReforma,
  calcDescontoReforma,
  calcTotalReforma,
} from "@/lib/reforma";
import AppHeader from "@/components/AppHeader";
import SeletorOrganizacao from "@/components/SeletorOrganizacao";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Save, FolderOpen, FileDown, Loader2, FileText, User, Wrench, Receipt, Settings, Trash2, Plus, X, AlertTriangle } from "lucide-react";
import { generateOrcamentoPdf } from "@/lib/generateOrcamentoPdf";
import { OrcamentoParams } from "@/lib/orcamento";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function Reforma() {
  const [params, setParams] = useState<ReformaParams>(DEFAULT_REFORMA);
  const [catalogo, setCatalogo] = useState<ItemReformaCatalogo[]>([]);
  const [loadingCatalogo, setLoadingCatalogo] = useState(true);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [listaOpen, setListaOpen] = useState(false);
  const [orcamentos, setOrcamentos] = useState<any[]>([]);
  const [clientNameError, setClientNameError] = useState(false);
  const clientNameRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const { loading: authLoading, profile } = useAuth();

  const fetchCatalogo = useCallback(async () => {
    setLoadingCatalogo(true);
    const { data } = await supabase
      .from("itens_reforma")
      .select("*")
      .eq("ativo", true)
      .order("ordem");
    if (data) setCatalogo(data as ItemReformaCatalogo[]);
    setLoadingCatalogo(false);
  }, []);

  useEffect(() => {
    fetchCatalogo();
  }, [fetchCatalogo]);

  const fetchOrcamentos = useCallback(async () => {
    const { data } = await supabase
      .from("orcamentos_reforma")
      .select("id, numero_orcamento, nome_cliente, total, status, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (data) setOrcamentos(data);
  }, []);

  const subtotal = useMemo(() => calcSubtotalReforma(params.itens), [params.itens]);
  const desconto = useMemo(
    () => calcDescontoReforma(subtotal, params.descontoTipo, params.descontoValor),
    [subtotal, params.descontoTipo, params.descontoValor]
  );
  const total = useMemo(() => calcTotalReforma(params), [params]);

  const update = <K extends keyof ReformaParams>(key: K, value: ReformaParams[K]) => {
    setParams((prev) => ({ ...prev, [key]: value }));
  };

  // Agrupar catálogo por categoria mantendo ordem
  const catalogoPorCategoria = useMemo(() => {
    const map = new Map<string, ItemReformaCatalogo[]>();
    for (const it of catalogo) {
      if (!map.has(it.categoria)) map.set(it.categoria, []);
      map.get(it.categoria)!.push(it);
    }
    return Array.from(map.entries());
  }, [catalogo]);

  const itemSelecionadoMap = useMemo(() => {
    const m = new Map<string, ItemReformaSelecionado>();
    for (const it of params.itens) m.set(it.item_id, it);
    return m;
  }, [params.itens]);

  function toggleItem(cat: ItemReformaCatalogo, checked: boolean) {
    if (checked) {
      const novo: ItemReformaSelecionado = {
        item_id: cat.id,
        codigo: cat.codigo,
        descricao: cat.descricao,
        categoria: cat.categoria,
        valor_unitario: Number(cat.valor) || 0,
        quantidade: 1,
      };
      update("itens", [...params.itens, novo]);
    } else {
      update("itens", params.itens.filter((i) => i.item_id !== cat.id));
    }
  }

  function updateItem(item_id: string, patch: Partial<ItemReformaSelecionado>) {
    update(
      "itens",
      params.itens.map((it) => (it.item_id === item_id ? { ...it, ...patch } : it))
    );
  }

  function removeItem(item_id: string) {
    update("itens", params.itens.filter((i) => i.item_id !== item_id));
  }

  const handleSave = useCallback(async () => {
    if (!params.organizacao_id) {
      toast({ title: "Selecione uma organização", variant: "destructive" });
      return;
    }
    setSaving(true);

    let numeroOrcamento = params.numeroOrcamento;
    if (!numeroOrcamento) {
      const year = new Date().getFullYear();
      const prefix = `REF${year}-`;
      const { data: last } = await supabase
        .from("orcamentos_reforma")
        .select("numero_orcamento")
        .like("numero_orcamento", `${prefix}%`)
        .order("numero_orcamento", { ascending: false })
        .limit(1)
        .maybeSingle();
      let seq = 1;
      if (last?.numero_orcamento) {
        const lastSeq = parseInt(last.numero_orcamento.replace(prefix, ""), 10);
        if (!isNaN(lastSeq)) seq = lastSeq + 1;
      }
      numeroOrcamento = `${prefix}${String(seq).padStart(3, "0")}`;
      setParams((prev) => ({ ...prev, numeroOrcamento: numeroOrcamento! }));
    }

    const row = {
      numero_orcamento: numeroOrcamento,
      organizacao_id: params.organizacao_id,
      oportunidade_id: params.oportunidade_id || null,
      nome_cliente: params.clientName || "—",
      contato_nome: params.contatoNome || null,
      cliente_endereco: params.clienteEndereco || null,
      cliente_telefone: params.clienteTelefone || null,
      cliente_cnpj: params.clienteCnpj || null,
      cliente_email: params.clienteEmail || null,
      itens: params.itens as any,
      subtotal,
      desconto_tipo: params.descontoTipo,
      desconto_valor: params.descontoValor,
      frete: params.frete,
      total,
      condicoes_pagamento: params.condicoesPagamento || null,
      prazo_entrega: params.prazoEntrega || null,
      validade_dias: params.validadeDias,
      local_entrega: params.localEntrega || null,
      observacoes: params.observacoes || null,
      status: params.status,
    };

    let error;
    if (savedId) {
      const res = await supabase.from("orcamentos_reforma").update(row as any).eq("id", savedId);
      error = res.error;
    } else {
      const res = await supabase.from("orcamentos_reforma").insert(row as any).select("id").maybeSingle();
      error = res.error;
      if (res.data) setSavedId(res.data.id);
    }

    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Orçamento de reforma salvo!" });
    }
  }, [params, savedId, subtotal, total, toast]);

  const loadById = useCallback(
    async (id: string) => {
      const { data, error } = await supabase
        .from("orcamentos_reforma")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error || !data) {
        toast({ title: "Orçamento não encontrado", variant: "destructive" });
        return;
      }
      setParams({
        numeroOrcamento: data.numero_orcamento || "",
        clientName: data.nome_cliente,
        contatoNome: data.contato_nome || "",
        clienteEndereco: data.cliente_endereco || "",
        clienteTelefone: data.cliente_telefone || "",
        clienteCnpj: data.cliente_cnpj || "",
        clienteEmail: data.cliente_email || "",
        itens: Array.isArray(data.itens) ? (data.itens as unknown as ItemReformaSelecionado[]) : [],
        descontoTipo: ((data.desconto_tipo as any) || "percentual"),
        descontoValor: Number(data.desconto_valor) || 0,
        frete: Number(data.frete) || 0,
        condicoesPagamento: data.condicoes_pagamento || "",
        prazoEntrega: data.prazo_entrega || "",
        validadeDias: data.validade_dias ?? 10,
        localEntrega: data.local_entrega || "",
        observacoes: data.observacoes || "",
        status: data.status || "rascunho",
        organizacao_id: (data as any).organizacao_id ?? null,
        pessoa_contato_id: (data as any).pessoa_contato_id ?? null,
        oportunidade_id: (data as any).oportunidade_id ?? null,
        dados_congelados: (data as any).dados_congelados ?? false,
      });
      setSavedId(data.id);
      setListaOpen(false);
      toast({ title: "Orçamento carregado" });
    },
    [toast]
  );

  useEffect(() => {
    if (authLoading || profile?.status !== "approved") return;
    const loadId = searchParams.get("load");
    const novo = searchParams.get("novo");
    const orgId = searchParams.get("organizacao");
    const oppId = searchParams.get("oportunidade");
    if (loadId) {
      void loadById(loadId).finally(() => setSearchParams({}, { replace: true }));
      return;
    }
    if (novo) {
      setParams(DEFAULT_REFORMA);
      setSavedId(null);
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
    if (novo) setSearchParams({}, { replace: true });
  }, [authLoading, profile?.status, searchParams, setSearchParams, loadById, toast]);

  function handleNovo() {
    if (params.clientName || savedId) {
      const ok = window.confirm("Iniciar um novo orçamento? Alterações não salvas serão perdidas.");
      if (!ok) return;
    }
    setParams(DEFAULT_REFORMA);
    setSavedId(null);
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Excluir este orçamento de reforma?")) return;
    const { error } = await supabase.from("orcamentos_reforma").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Orçamento excluído" });
      fetchOrcamentos();
      if (savedId === id) {
        setParams(DEFAULT_REFORMA);
        setSavedId(null);
      }
    }
  }

  async function handlePdf() {
    if (!params.organizacao_id && !params.clientName.trim()) {
      toast({ title: "Selecione uma organização", variant: "destructive" });
      return;
    }
    if (params.itens.length === 0) {
      toast({ title: "Selecione ao menos um item", variant: "destructive" });
      return;
    }
    // Adapta para o gerador de PDF de orçamento existente
    const orc: OrcamentoParams = {
      numeroOrcamento: params.numeroOrcamento || "",
      clientName: params.clientName,
      contatoNome: params.contatoNome,
      clienteEndereco: params.clienteEndereco,
      clienteTelefone: params.clienteTelefone,
      clienteCnpj: params.clienteCnpj,
      clienteEmail: params.clienteEmail,
      itens: params.itens.map((it) => ({
        equipamento_id: it.item_id,
        codigo: it.codigo,
        descricao: `[${it.categoria}] ${it.descricao}`,
        valor_unitario: it.valor_unitario,
        quantidade: it.quantidade,
      })),
      descontoTipo: params.descontoTipo,
      descontoValor: params.descontoValor,
      frete: params.frete,
      condicoesPagamento: params.condicoesPagamento,
      prazoEntrega: params.prazoEntrega,
      validadeDias: params.validadeDias,
      localEntrega: params.localEntrega,
      observacoes: params.observacoes,
      status: params.status,
    };
    await generateOrcamentoPdf(orc);
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="container max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="icon" className="h-9 w-9">
              <Link to="/"><ArrowLeft className="w-4 h-4" /></Link>
            </Button>
            <div className="w-10 h-10 rounded-lg bg-rose-500 flex items-center justify-center">
              <Wrench className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground leading-tight">Orçamento de Reforma</h1>
              <p className="text-xs text-muted-foreground">
                {params.numeroOrcamento || "Nova reforma"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={handleNovo} className="gap-1">
              <Plus className="w-4 h-4" /> Nova
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Salvar
            </Button>
            <Dialog open={listaOpen} onOpenChange={(o) => { setListaOpen(o); if (o) fetchOrcamentos(); }}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1">
                  <FolderOpen className="w-4 h-4" /> Reformas
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl">
                <DialogHeader>
                  <DialogTitle>Orçamentos de Reforma</DialogTitle>
                </DialogHeader>
                <div className="max-h-[60vh] overflow-auto">
                  {orcamentos.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">Nenhum orçamento salvo.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/50 text-muted-foreground">
                          <th className="text-left p-2 font-medium">Número</th>
                          <th className="text-left p-2 font-medium">Cliente</th>
                          <th className="text-right p-2 font-medium">Total</th>
                          <th className="text-left p-2 font-medium">Status</th>
                          <th className="p-2 w-24"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {orcamentos.map((o) => (
                          <tr key={o.id} className="border-t hover:bg-muted/30">
                            <td className="p-2 font-medium">{o.numero_orcamento || "-"}</td>
                            <td className="p-2">{o.nome_cliente}</td>
                            <td className="p-2 text-right tabular-nums">{fmtBRL(Number(o.total) || 0)}</td>
                            <td className="p-2 capitalize text-muted-foreground">{o.status}</td>
                            <td className="p-2 flex gap-1 justify-end">
                              <Button size="sm" variant="outline" onClick={() => loadById(o.id)}>Abrir</Button>
                              <Button size="sm" variant="ghost" onClick={() => handleDelete(o.id)}>
                                <Trash2 className="w-3.5 h-3.5 text-destructive" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </DialogContent>
            </Dialog>
            <Button size="sm" variant="default" onClick={handlePdf} className="gap-1">
              <FileDown className="w-4 h-4" /> Gerar PDF
            </Button>
            <Button asChild size="sm" variant="ghost" className="gap-1">
              <Link to="/reforma/catalogo"><Settings className="w-4 h-4" /> Catálogo</Link>
            </Button>
            <AppHeader />
          </div>
        </div>
      </header>

      <main className="container max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Dados do cliente */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <User className="w-4 h-4 text-primary" /> Dados do Cliente
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {savedId && !params.organizacao_id && (
              <Alert className="bg-amber-50 border-amber-300 text-amber-900">
                <AlertTriangle className="w-4 h-4" />
                <AlertDescription>Este orçamento não está vinculado a uma organização do CRM.</AlertDescription>
              </Alert>
            )}
            <SeletorOrganizacao
              value={{ organizacao_id: params.organizacao_id, pessoa_contato_id: params.pessoa_contato_id }}
              onChange={(v) => setParams((p) => ({
                ...p,
                organizacao_id: v.organizacao_id ?? null,
                pessoa_contato_id: v.pessoa_contato_id ?? null,
              }))}
              disabled={!!params.dados_congelados}
              onDescongelar={savedId ? async () => {
                const { error } = await supabase.from("orcamentos_reforma").update({ dados_congelados: false } as any).eq("id", savedId);
                if (error) throw error;
                setParams((p) => ({ ...p, dados_congelados: false }));
              } : undefined}
            />
          </CardContent>
        </Card>

        {/* Checklist */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Wrench className="w-4 h-4 text-rose-600" /> Checklist de Reforma
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingCatalogo ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : catalogoPorCategoria.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhum item cadastrado. Acesse o <Link to="/reforma/catalogo" className="text-primary underline">catálogo de reforma</Link>.
              </p>
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                {catalogoPorCategoria.map(([categoria, itens]) => (
                  <div key={categoria} className="border rounded-lg p-3">
                    <div className="font-semibold text-sm mb-2 text-rose-600">{categoria}</div>
                    <div className="space-y-2">
                      {itens.map((it) => {
                        const sel = itemSelecionadoMap.get(it.id);
                        const isChecked = !!sel;
                        return (
                          <div key={it.id} className="flex items-center gap-2 text-sm">
                            <Checkbox
                              checked={isChecked}
                              onCheckedChange={(c) => toggleItem(it, !!c)}
                              id={`it-${it.id}`}
                            />
                            <label
                              htmlFor={`it-${it.id}`}
                              className="flex-1 cursor-pointer flex items-baseline gap-2"
                            >
                              <span className="font-mono text-xs text-muted-foreground">{it.codigo}</span>
                              <span>{it.descricao}</span>
                            </label>
                            {isChecked && (
                              <>
                                <Input
                                  type="number"
                                  min={1}
                                  value={sel!.quantidade}
                                  onChange={(e) =>
                                    updateItem(it.id, {
                                      quantidade: Math.max(1, parseInt(e.target.value) || 1),
                                    })
                                  }
                                  className="h-7 w-14 text-center"
                                />
                                <Input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  value={sel!.valor_unitario}
                                  onChange={(e) =>
                                    updateItem(it.id, {
                                      valor_unitario: Math.max(0, parseFloat(e.target.value) || 0),
                                    })
                                  }
                                  className="h-7 w-28 text-right"
                                />
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Selecionados */}
        {params.itens.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" /> Itens Selecionados
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead>
                    <tr className="bg-muted/50 text-muted-foreground">
                      <th className="text-left p-2 font-medium">Código</th>
                      <th className="text-left p-2 font-medium">Categoria</th>
                      <th className="text-left p-2 font-medium">Descrição</th>
                      <th className="text-center p-2 font-medium w-20">Qtd</th>
                      <th className="text-right p-2 font-medium w-32">Valor unit.</th>
                      <th className="text-right p-2 font-medium w-32">Subtotal</th>
                      <th className="p-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {params.itens.map((it) => (
                      <tr key={it.item_id} className="border-t">
                        <td className="p-2 font-mono text-xs">{it.codigo}</td>
                        <td className="p-2 text-muted-foreground">{it.categoria}</td>
                        <td className="p-2">{it.descricao}</td>
                        <td className="p-2 text-center tabular-nums">{it.quantidade}</td>
                        <td className="p-2 text-right tabular-nums">{fmtBRL(it.valor_unitario)}</td>
                        <td className="p-2 text-right font-medium tabular-nums">
                          {fmtBRL(it.valor_unitario * it.quantidade)}
                        </td>
                        <td className="p-2">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeItem(it.item_id)}>
                            <X className="w-3.5 h-3.5 text-destructive" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Totais */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Receipt className="w-4 h-4 text-primary" /> Resumo Financeiro
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label>Tipo de desconto</Label>
                  <Select value={params.descontoTipo} onValueChange={(v) => update("descontoTipo", v as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentual">Percentual (%)</SelectItem>
                      <SelectItem value="valor">Valor fixo (R$)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{params.descontoTipo === "percentual" ? "Desconto (%)" : "Desconto (R$)"}</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={params.descontoValor}
                    onChange={(e) => update("descontoValor", Math.max(0, parseFloat(e.target.value) || 0))}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Frete (R$)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={params.frete}
                  onChange={(e) => update("frete", Math.max(0, parseFloat(e.target.value) || 0))}
                />
              </div>
            </div>
            <div className="bg-muted/30 rounded-lg p-4 space-y-2 text-sm self-start">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium">{fmtBRL(subtotal)}</span>
              </div>
              {desconto > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Desconto</span>
                  <span className="font-medium text-destructive">- {fmtBRL(desconto)}</span>
                </div>
              )}
              {params.frete > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Frete</span>
                  <span className="font-medium">{fmtBRL(params.frete)}</span>
                </div>
              )}
              <div className="flex justify-between pt-2 border-t">
                <span className="font-semibold">Total</span>
                <span className="font-bold text-primary text-lg">{fmtBRL(total)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Condições */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" /> Condições
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5 md:col-span-2">
              <Label>Condições de pagamento</Label>
              <Input value={params.condicoesPagamento} onChange={(e) => update("condicoesPagamento", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Prazo de execução</Label>
              <Input value={params.prazoEntrega} onChange={(e) => update("prazoEntrega", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Validade da oferta (dias)</Label>
              <Input
                type="number"
                min={1}
                value={params.validadeDias}
                onChange={(e) => update("validadeDias", Math.max(1, parseInt(e.target.value) || 10))}
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Local de execução</Label>
              <Input value={params.localEntrega} onChange={(e) => update("localEntrega", e.target.value)} />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Observações</Label>
              <Textarea rows={3} value={params.observacoes} onChange={(e) => update("observacoes", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={params.status} onValueChange={(v) => update("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="rascunho">Rascunho</SelectItem>
                  <SelectItem value="enviado">Enviado</SelectItem>
                  <SelectItem value="aprovado">Aprovado</SelectItem>
                  <SelectItem value="recusado">Recusado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
