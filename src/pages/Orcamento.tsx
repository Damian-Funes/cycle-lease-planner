import { useState, useEffect, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { Equipamento } from "@/lib/equipamentos";
import { OrcamentoParams, ItemOrcamento, DEFAULT_ORCAMENTO, calcSubtotal, calcDescontoAplicado, calcTotal } from "@/lib/orcamento";
import { generateOrcamentoPdf } from "@/lib/generateOrcamentoPdf";
import PropostasUnificadasModal from "@/components/PropostasUnificadasModal";
import NovaPropostaButton from "@/components/NovaPropostaButton";
import AppHeader from "@/components/AppHeader";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Plus, Trash2, Save, FolderOpen, FileDown, Loader2, ChevronsUpDown, Check, FileText, User, Wrench, Receipt } from "lucide-react";
import { cn } from "@/lib/utils";

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function Orcamento() {
  const [params, setParams] = useState<OrcamentoParams>(DEFAULT_ORCAMENTO);
  const [equipamentos, setEquipamentos] = useState<Equipamento[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [quantidade, setQuantidade] = useState(1);
  const [comboOpen, setComboOpen] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const { loading: authLoading, profile } = useAuth();

  useEffect(() => {
    supabase
      .from("equipamentos")
      .select("*")
      .eq("ativo", true)
      .order("codigo")
      .then(({ data }) => {
        if (data) setEquipamentos(data as Equipamento[]);
      });
  }, []);

  const subtotal = useMemo(() => calcSubtotal(params.itens), [params.itens]);
  const desconto = useMemo(
    () => calcDescontoAplicado(subtotal, params.descontoTipo, params.descontoValor),
    [subtotal, params.descontoTipo, params.descontoValor]
  );
  const total = useMemo(() => calcTotal(params), [params]);

  const update = <K extends keyof OrcamentoParams>(key: K, value: OrcamentoParams[K]) => {
    setParams((prev) => ({ ...prev, [key]: value }));
  };

  function handleAddItem() {
    if (!selectedId || quantidade < 1) return;
    const eq = equipamentos.find((e) => e.id === selectedId);
    if (!eq) return;

    const existing = params.itens.findIndex((i) => i.equipamento_id === eq.id);
    let newItens: ItemOrcamento[];
    if (existing >= 0) {
      newItens = params.itens.map((it, idx) =>
        idx === existing ? { ...it, quantidade: it.quantidade + quantidade } : it
      );
    } else {
      newItens = [
        ...params.itens,
        {
          equipamento_id: eq.id,
          codigo: eq.codigo,
          descricao: eq.descricao,
          valor_unitario: Number(eq.valor_venda) || 0,
          quantidade,
        },
      ];
    }
    update("itens", newItens);
    setSelectedId("");
    setQuantidade(1);
  }

  function updateItem(idx: number, patch: Partial<ItemOrcamento>) {
    update(
      "itens",
      params.itens.map((it, i) => (i === idx ? { ...it, ...patch } : it))
    );
  }

  function removeItem(idx: number) {
    update("itens", params.itens.filter((_, i) => i !== idx));
  }

  const handleSave = useCallback(async () => {
    if (!params.clientName.trim()) {
      toast({ title: "Preencha o nome do cliente", variant: "destructive" });
      return;
    }
    setSaving(true);

    let numeroOrcamento = params.numeroOrcamento;
    if (!numeroOrcamento) {
      const year = new Date().getFullYear();
      const prefix = `ORC${year}-`;
      const { data: last } = await supabase
        .from("orcamentos")
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
      nome_cliente: params.clientName,
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
      const res = await supabase.from("orcamentos").update(row).eq("id", savedId);
      error = res.error;
    } else {
      const res = await supabase.from("orcamentos").insert(row).select("id").maybeSingle();
      error = res.error;
      if (res.data) setSavedId(res.data.id);
    }

    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Orçamento salvo!" });
    }
  }, [params, savedId, subtotal, total, toast]);

  function handleNovo() {
    if (params.clientName || savedId) {
      const ok = window.confirm("Iniciar um novo orçamento? Alterações não salvas serão perdidas.");
      if (!ok) return;
    }
    setParams(DEFAULT_ORCAMENTO);
    setSavedId(null);
    toast({ title: "Novo orçamento iniciado" });
  }

  function handleLoad(loaded: OrcamentoParams, id: string) {
    setParams(loaded);
    setSavedId(id);
    toast({ title: "Orçamento carregado" });
  }

  const loadOrcamentoById = useCallback(async (loadId: string) => {
    const { data, error } = await supabase.from("orcamentos").select("*").eq("id", loadId).maybeSingle();

    if (error || !data) {
      toast({ title: "Orçamento não encontrado", variant: "destructive" });
      return;
    }

    const loaded: OrcamentoParams = {
      numeroOrcamento: data.numero_orcamento || "",
      clientName: data.nome_cliente,
      contatoNome: data.contato_nome || "",
      clienteEndereco: data.cliente_endereco || "",
      clienteTelefone: data.cliente_telefone || "",
      clienteCnpj: data.cliente_cnpj || "",
      clienteEmail: data.cliente_email || "",
      itens: Array.isArray(data.itens) ? (data.itens as unknown as ItemOrcamento[]) : [],
      descontoTipo: ((data.desconto_tipo as any) || "percentual"),
      descontoValor: Number(data.desconto_valor) || 0,
      frete: Number(data.frete) || 0,
      condicoesPagamento: data.condicoes_pagamento || "",
      prazoEntrega: data.prazo_entrega || "",
      validadeDias: data.validade_dias ?? 10,
      localEntrega: data.local_entrega || "",
      observacoes: data.observacoes || "",
      status: data.status || "rascunho",
    };

    handleLoad(loaded, data.id);
  }, [toast]);

  // Deep-link: ?load=<id> carrega orçamento; ?novo=1 inicia novo
  useEffect(() => {
    if (authLoading || profile?.status !== "approved") return;

    const loadId = searchParams.get("load");
    const novo = searchParams.get("novo");

    if (loadId) {
      void loadOrcamentoById(loadId).finally(() => {
        setSearchParams({}, { replace: true });
      });
      return;
    }

    if (novo) {
      setParams(DEFAULT_ORCAMENTO);
      setSavedId(null);
      setSearchParams({}, { replace: true });
      return;
    }

    if (searchParams.get("propostas")) {
      setModalOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [authLoading, profile?.status, searchParams, setSearchParams, loadOrcamentoById]);

  async function handlePdf() {
    if (!params.clientName.trim()) {
      toast({ title: "Preencha o nome do cliente", variant: "destructive" });
      return;
    }
    if (params.itens.length === 0) {
      toast({ title: "Adicione ao menos um item", variant: "destructive" });
      return;
    }
    await generateOrcamentoPdf(params);
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="container max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="icon" className="h-9 w-9">
              <Link to="/"><ArrowLeft className="w-4 h-4" /></Link>
            </Button>
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
              <Receipt className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground leading-tight">Orçamento Comercial</h1>
              <p className="text-xs text-muted-foreground">
                {params.numeroOrcamento || "Novo orçamento"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <NovaPropostaButton onNovoOrcamento={handleNovo} />
            <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Salvar
            </Button>
            <Button size="sm" variant="outline" onClick={() => setModalOpen(true)} className="gap-1">
              <FolderOpen className="w-4 h-4" /> Propostas
            </Button>
            <Button size="sm" variant="default" onClick={handlePdf} className="gap-1">
              <FileDown className="w-4 h-4" /> Gerar PDF
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
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="cli-nome">Nome / Razão social *</Label>
              <Input id="cli-nome" value={params.clientName} onChange={(e) => update("clientName", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cli-contato">Contato (At.:)</Label>
              <Input id="cli-contato" value={params.contatoNome} onChange={(e) => update("contatoNome", e.target.value)} />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="cli-end">Endereço</Label>
              <Input id="cli-end" value={params.clienteEndereco} onChange={(e) => update("clienteEndereco", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cli-tel">Telefone</Label>
              <Input id="cli-tel" value={params.clienteTelefone} onChange={(e) => update("clienteTelefone", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cli-cnpj">CNPJ</Label>
              <Input id="cli-cnpj" value={params.clienteCnpj} onChange={(e) => update("clienteCnpj", e.target.value)} />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="cli-email">E-mail</Label>
              <Input id="cli-email" type="email" value={params.clienteEmail} onChange={(e) => update("clienteEmail", e.target.value)} />
            </div>
          </CardContent>
        </Card>

        {/* Itens */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Wrench className="w-4 h-4 text-primary" /> Itens do Orçamento
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2 items-end flex-wrap">
              <div className="flex-1 min-w-[200px] space-y-1">
                <Label>Equipamento</Label>
                <Popover open={comboOpen} onOpenChange={setComboOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" aria-expanded={comboOpen} className="w-full justify-between h-9 font-normal">
                      {selectedId
                        ? (() => {
                            const eq = equipamentos.find((e) => e.id === selectedId);
                            return eq ? `${eq.codigo} — ${eq.descricao}` : "Selecione...";
                          })()
                        : "Selecione um equipamento..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0 bg-popover z-50" align="start">
                    <Command>
                      <CommandInput placeholder="Digite código ou descrição..." />
                      <CommandList>
                        <CommandEmpty>Nenhum equipamento encontrado.</CommandEmpty>
                        <CommandGroup>
                          {equipamentos.map((eq) => (
                            <CommandItem
                              key={eq.id}
                              value={`${eq.codigo} ${eq.descricao}`}
                              onSelect={() => {
                                setSelectedId(eq.id);
                                setComboOpen(false);
                              }}
                            >
                              <Check className={cn("mr-2 h-4 w-4", selectedId === eq.id ? "opacity-100" : "opacity-0")} />
                              {eq.codigo} — {eq.descricao}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="w-20 space-y-1">
                <Label>Qtd</Label>
                <input
                  type="number"
                  min={1}
                  value={quantidade}
                  onChange={(e) => setQuantidade(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full h-9 px-3 rounded-md border bg-background text-sm font-medium text-center focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <Button size="sm" onClick={handleAddItem} disabled={!selectedId} className="gap-1 h-9">
                <Plus className="w-4 h-4" /> Adicionar
              </Button>
            </div>

            {params.itens.length > 0 ? (
              <div className="border rounded-lg overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead>
                    <tr className="bg-muted/50 text-muted-foreground">
                      <th className="text-left p-2 font-medium">Código</th>
                      <th className="text-left p-2 font-medium">Descrição</th>
                      <th className="text-center p-2 font-medium w-20">Qtd</th>
                      <th className="text-right p-2 font-medium w-32">Valor unit.</th>
                      <th className="text-right p-2 font-medium w-32">Subtotal</th>
                      <th className="p-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {params.itens.map((it, idx) => (
                      <tr key={`${it.equipamento_id}-${idx}`} className="border-t hover:bg-muted/30 transition-colors">
                        <td className="p-2 font-medium">{it.codigo}</td>
                        <td className="p-2 text-muted-foreground">{it.descricao}</td>
                        <td className="p-2 text-center">
                          <input
                            type="number"
                            min={1}
                            value={it.quantidade}
                            onChange={(e) => updateItem(idx, { quantidade: Math.max(1, parseInt(e.target.value) || 1) })}
                            className="w-16 h-7 px-1 rounded border bg-background text-sm text-center focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                        </td>
                        <td className="p-2 text-right tabular-nums">{fmtBRL(it.valor_unitario)}</td>
                        <td className="p-2 text-right font-medium">{fmtBRL(it.valor_unitario * it.quantidade)}</td>
                        <td className="p-2">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeItem(idx)}>
                            <Trash2 className="w-3.5 h-3.5 text-destructive" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhum item adicionado. Selecione um equipamento acima para começar.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Totais e ajustes */}
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
              <Input
                placeholder="Ex.: 30/60/90 dias, à vista com 5% de desconto..."
                value={params.condicoesPagamento}
                onChange={(e) => update("condicoesPagamento", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Prazo de entrega</Label>
              <Input
                placeholder="Ex.: 30 dias após confirmação"
                value={params.prazoEntrega}
                onChange={(e) => update("prazoEntrega", e.target.value)}
              />
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
              <Label>Local de entrega</Label>
              <Input
                value={params.localEntrega}
                onChange={(e) => update("localEntrega", e.target.value)}
                placeholder="Se vazio, será usado o endereço do cliente"
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Observações</Label>
              <Textarea
                rows={3}
                value={params.observacoes}
                onChange={(e) => update("observacoes", e.target.value)}
              />
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

      <PropostasUnificadasModal open={modalOpen} onOpenChange={setModalOpen} onLoadOrcamento={loadOrcamentoById} />
    </div>
  );
}
