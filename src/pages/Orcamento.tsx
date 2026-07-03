import { useState, useEffect, useMemo, useCallback, useRef } from "react";
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
import ItemAvulsoModal from "@/components/ItemAvulsoModal";
import FreteCalculatorModal from "@/components/FreteCalculatorModal";
import AppHeader from "@/components/AppHeader";
import SeletorOrganizacao from "@/components/SeletorOrganizacao";
import FormaPagamentoSelector from "@/components/FormaPagamentoSelector";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Plus, Trash2, Save, FolderOpen, FileDown, Loader2, ChevronsUpDown, Check, FileText, User, Wrench, Receipt, AlertTriangle, HardHat, Info } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
  const [avulsoOpen, setAvulsoOpen] = useState(false);
  const [freteOpen, setFreteOpen] = useState(false);
  const [clientNameError, setClientNameError] = useState(false);
  const clientNameRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const { loading: authLoading, profile, isAdmin, user } = useAuth();

  // Taxas de montagem (config global)
  const [taxasMontagem, setTaxasMontagem] = useState<{
    valor_dia_colaborador: number;
    valor_km: number;
    diaria_hospedagem: number;
    diaria_alimentacao: number;
    margem_percentual: number;
  } | null>(null);

  // Pessoas da organização selecionada (para auto-seleção / validações)
  const [pessoasOrg, setPessoasOrg] = useState<Array<{ id: string; nome: string }>>([]);
  const pessoasCount = pessoasOrg.length;

  useEffect(() => {
    if (!params.organizacao_id) {
      setPessoasOrg([]);
      return;
    }
    let cancel = false;
    (async () => {
      const { data } = await supabase
        .from("pessoas")
        .select("id, nome")
        .eq("organizacao_id", params.organizacao_id)
        .order("nome");
      if (cancel) return;
      const list = (data || []) as Array<{ id: string; nome: string }>;
      setPessoasOrg(list);
      // Auto-seleção quando só há 1 pessoa e nenhuma está selecionada
      if (list.length === 1 && !params.pessoa_contato_id && !params.dados_congelados) {
        setParams((p) => ({ ...p, pessoa_contato_id: list[0].id }));
      }
    })();
    return () => { cancel = true; };
  }, [params.organizacao_id, params.dados_congelados]);


  // Dias de montagem sugeridos (view)
  useEffect(() => {
    supabase
      .from("equipamentos")
      .select("*")
      .eq("ativo", true)
      .order("codigo")
      .then(({ data }) => {
        if (data) setEquipamentos(data as Equipamento[]);
      });

    supabase
      .from("config_montagem" as any)
      .select("valor_dia_colaborador, valor_km, diaria_hospedagem, diaria_alimentacao, margem_percentual")
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setTaxasMontagem(data as any);
      });
  }, []);

  // Calcula dias sugeridos em tempo real a partir dos itens selecionados (sem precisar salvar)
  const diasSugerido = useMemo(() => {
    const detalhe: Array<{ codigo: string; descricao: string; quantidade: number; dias_padrao: number; dias_total: number }> = [];
    let total = 0;
    for (const it of params.itens) {
      const eq = equipamentos.find((e) => e.id === it.equipamento_id);
      const diasPadrao = Number((eq as any)?.dias_montagem_padrao) || 0;
      if (eq && diasPadrao > 0) {
        const qtd = Number(it.quantidade) || 0;
        const diasTotal = qtd * diasPadrao;
        total += diasTotal;
        detalhe.push({
          codigo: eq.codigo,
          descricao: eq.descricao,
          quantidade: qtd,
          dias_padrao: diasPadrao,
          dias_total: diasTotal,
        });
      }
    }
    return {
      dias_sugeridos: total,
      tem_maquina_tratamento: detalhe.length > 0,
      detalhe_maquinas: detalhe,
    };
  }, [params.itens, equipamentos]);

  const subtotal = useMemo(() => calcSubtotal(params.itens), [params.itens]);
  const desconto = useMemo(
    () => calcDescontoAplicado(subtotal, params.descontoTipo, params.descontoValor),
    [subtotal, params.descontoTipo, params.descontoValor]
  );
  // Preço de montagem ao vivo, refletindo inputs atuais + taxas (sem depender do save)
  const montagemPrecoLive = useMemo(() => {
    const autoDias = !!diasSugerido?.tem_maquina_tratamento;
    const dias = autoDias ? Number(diasSugerido?.dias_sugeridos) || 0 : Number(params.montagemDias) || 0;
    const cols = 4;
    const veic = 1;
    const kmOD = Number(params.montagemKmOrigemDestino) || 0;
    const kmHL = Number(params.montagemKmHotelLocal) || 0;
    const t = taxasMontagem ?? { valor_dia_colaborador: 0, valor_km: 0, diaria_hospedagem: 0, diaria_alimentacao: 0, margem_percentual: 0 };
    const custo =
      dias * cols * Number(t.valor_dia_colaborador) +
      2 * kmOD * Number(t.valor_km) * veic +
      (params.montagemEhFazenda ? dias * 2 * kmHL * Number(t.valor_km) * veic : 0) +
      dias * cols * Number(t.diaria_hospedagem) +
      dias * cols * Number(t.diaria_alimentacao);
    return Math.round(custo * (1 + (Number(t.margem_percentual) || 0) / 100) * 100) / 100;
  }, [diasSugerido, params.montagemDias, params.montagemKmOrigemDestino, params.montagemKmHotelLocal, params.montagemEhFazenda, taxasMontagem]);

  const total = useMemo(
    () => calcTotal({ ...params, montagemPrecoTotal: montagemPrecoLive }),
    [params, montagemPrecoLive]
  );


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

  function handleAddAvulso(item: ItemOrcamento, savedEq?: Equipamento) {
    update("itens", [...params.itens, item]);
    if (savedEq) {
      setEquipamentos((prev) =>
        prev.some((e) => e.id === savedEq.id)
          ? prev
          : [...prev, savedEq].sort((a, b) => a.codigo.localeCompare(b.codigo))
      );
    }
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
    if (!params.organizacao_id) {
      toast({ title: "Selecione uma organização", variant: "destructive" });
      return;
    }
    if (params.status && params.status !== "rascunho" && !params.pessoa_contato_id) {
      toast({ title: "Selecione a pessoa de contato antes de marcar como enviado", variant: "destructive" });
      return;
    }
    setSaving(true);


    let numeroOrcamento = params.numeroOrcamento;
    const isRevisao = !!savedId; // se já existe, salvar gera nova revisão (V2, V3...)

    if (!numeroOrcamento) {
      const year = new Date().getFullYear();
      const prefix = `ORC${year}-`;
      const { data: existentes } = await supabase
        .from("orcamentos")
        .select("numero_orcamento")
        .like("numero_orcamento", `${prefix}%`);
      let seq = 1;
      (existentes || []).forEach((r: any) => {
        const base = (r.numero_orcamento || "").replace(/-V\d+$/i, "");
        const n = parseInt(base.replace(prefix, ""), 10);
        if (!isNaN(n) && n >= seq) seq = n + 1;
      });

      numeroOrcamento = `${prefix}${String(seq).padStart(3, "0")}`;
      setParams((prev) => ({ ...prev, numeroOrcamento: numeroOrcamento! }));
    } else if (isRevisao) {
      // Calcula próxima versão: busca todas as revisões com mesma base
      const base = numeroOrcamento.replace(/-V\d+$/i, "");
      const { data: revs } = await supabase
        .from("orcamentos")
        .select("numero_orcamento")
        .or(`numero_orcamento.eq.${base},numero_orcamento.like.${base}-V%`);
      let maxV = 1;
      (revs || []).forEach((r: any) => {
        const m = /-V(\d+)$/i.exec(r.numero_orcamento || "");
        if (m) maxV = Math.max(maxV, parseInt(m[1], 10));
      });
      numeroOrcamento = `${base}-V${maxV + 1}`;
      setParams((prev) => ({ ...prev, numeroOrcamento: numeroOrcamento! }));
    }

    const row = {
      numero_orcamento: numeroOrcamento,
      organizacao_id: params.organizacao_id,
      pessoa_contato_id: params.pessoa_contato_id || null,
      oportunidade_id: params.oportunidade_id || null,
      // Campos texto: o trigger preenche automaticamente quando dados_congelados=false.
      // Em registros congelados, mantemos o snapshot atual.
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
      forma_pagamento_id: params.formaPagamentoId || null,
      // Se há forma selecionada, limpa o legacy. Senão preserva (orçamentos antigos).
      condicoes_pagamento: params.formaPagamentoId ? null : (params.condicoesPagamento || null),
      prazo_entrega: params.prazoEntrega || null,
      validade_dias: params.validadeDias,
      local_entrega: params.localEntrega || null,
      observacoes: params.observacoes || null,
      status: params.status,
      responsavel_id: user?.id ?? null,
      montagem_numero_colaboradores: 4,
      montagem_dias: params.montagemDias ?? 0,
      montagem_km_origem_destino: params.montagemKmOrigemDestino ?? 0,
      montagem_numero_veiculos: 1,
      montagem_eh_fazenda: params.montagemEhFazenda ?? false,
      montagem_km_hotel_local: params.montagemKmHotelLocal ?? 0,
      montagem_observacoes: params.montagemObservacoes || null,
      montagem_tipo: params.montagemTipo || "montagem",
    };

    let error: any;
    let novoId: string | null = isRevisao ? null : savedId;
    if (!isRevisao && savedId) {
      const res = await supabase.from("orcamentos").update(row as any).eq("id", savedId);
      error = res.error;
    } else {
      // Insert com retry em caso de colisão do numero_orcamento (RLS pode esconder números já usados)
      const year = new Date().getFullYear();
      const prefix = `ORC${year}-`;
      let currentNumero = numeroOrcamento!;
      for (let attempts = 0; attempts < 10; attempts++) {
        const attemptRow = { ...row, numero_orcamento: currentNumero };
        const res = await supabase.from("orcamentos").insert(attemptRow as any).select("id").maybeSingle();
        if (!res.error) {
          error = undefined;
          if (res.data) {
            novoId = res.data.id;
            setSavedId(res.data.id);
          }
          numeroOrcamento = currentNumero;
          setParams((prev) => ({ ...prev, numeroOrcamento: currentNumero }));
          break;
        }
        const msg = (res.error as any)?.message || "";
        const isDup = (res.error as any)?.code === "23505" || /orcamentos_numero_unique|duplicate key/i.test(msg);
        error = res.error;
        if (!isDup) break;
        if (isRevisao) {
          const base = currentNumero.replace(/-V\d+$/i, "");
          const m = /-V(\d+)$/i.exec(currentNumero);
          const v = m ? parseInt(m[1], 10) : 1;
          currentNumero = `${base}-V${v + 1}`;
        } else {
          const n = parseInt(currentNumero.replace(prefix, ""), 10) || 1;
          currentNumero = `${prefix}${String(n + 1).padStart(3, "0")}`;
        }
      }
    }

    // Cria oportunidade automaticamente se não houver vínculo
    let criouOpp = false;
    if (!error && novoId && !params.oportunidade_id && params.organizacao_id) {
      const { criarOportunidadeAuto } = await import("@/lib/autoOportunidade");
      const oppId = await criarOportunidadeAuto({
        pipelineNome: "Orçamentos",
        organizacaoId: params.organizacao_id,
        titulo: `Orçamento ${numeroOrcamento}`,
        valor: total,
      });
      if (oppId) {
        await supabase.from("orcamentos").update({ oportunidade_id: oppId } as any).eq("id", novoId);
        setParams((p) => ({ ...p, oportunidade_id: oppId }));
        criouOpp = true;
      }
    }

    // Releitura autoritativa (custo/preço/margem + dias podem ter sido recalculados por trigger)
    if (!error && novoId) {
      const { data: fresh } = await supabase
        .from("orcamentos")
        .select("montagem_custo_total, montagem_preco_total, montagem_margem_aplicada, montagem_dias")
        .eq("id", novoId)
        .maybeSingle();
      if (fresh) {
        const montagemPreco = Number((fresh as any).montagem_preco_total) || 0;
        setParams((p) => ({
          ...p,
          montagemCustoTotal: Number((fresh as any).montagem_custo_total) || 0,
          montagemPrecoTotal: montagemPreco,
          montagemMargemAplicada: Number((fresh as any).montagem_margem_aplicada) || 0,
          montagemDias: Number((fresh as any).montagem_dias) || 0,
        }));
        // Recalcula total incluindo montagem (trigger não atualiza coluna total)
        const desc = calcDescontoAplicado(subtotal, params.descontoTipo, params.descontoValor);
        const totalFinal = Math.max(0, subtotal - desc) + (Number(params.frete) || 0) + montagemPreco;
        await supabase.from("orcamentos").update({ total: totalFinal } as any).eq("id", novoId);
      }
      
    }

    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({
        title: isRevisao ? `Revisão ${numeroOrcamento} salva!` : "Orçamento salvo!",
        description: criouOpp ? "Oportunidade criada no funil Orçamentos (etapa Lead)." : undefined,
      });
    }
  }, [params, savedId, subtotal, total, toast, user?.id]);

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
      formaPagamentoId: (data as any).forma_pagamento_id ?? null,
      prazoEntrega: data.prazo_entrega || "",
      validadeDias: data.validade_dias ?? 10,
      localEntrega: data.local_entrega || "",
      observacoes: data.observacoes || "",
      status: data.status || "rascunho",
      organizacao_id: (data as any).organizacao_id ?? null,
      pessoa_contato_id: (data as any).pessoa_contato_id ?? null,
      oportunidade_id: (data as any).oportunidade_id ?? null,
      dados_congelados: (data as any).dados_congelados ?? false,
      montagemNumeroColaboradores: Number((data as any).montagem_numero_colaboradores) || 0,
      montagemDias: Number((data as any).montagem_dias) || 0,
      montagemKmOrigemDestino: Number((data as any).montagem_km_origem_destino) || 0,
      montagemNumeroVeiculos: Number((data as any).montagem_numero_veiculos) || 1,
      montagemEhFazenda: !!(data as any).montagem_eh_fazenda,
      montagemKmHotelLocal: Number((data as any).montagem_km_hotel_local) || 0,
      montagemObservacoes: (data as any).montagem_observacoes || "",
      montagemCustoTotal: Number((data as any).montagem_custo_total) || 0,
      montagemPrecoTotal: Number((data as any).montagem_preco_total) || 0,
      montagemMargemAplicada: Number((data as any).montagem_margem_aplicada) || 0,
      montagemTipo: ((data as any).montagem_tipo as any) || "montagem",
    };

    handleLoad(loaded, data.id);
  }, [toast]);

  // Deep-link: ?load=<id> carrega orçamento; ?novo=1 inicia novo
  useEffect(() => {
    if (authLoading || profile?.status !== "approved") return;

    const loadId = searchParams.get("load");
    const novo = searchParams.get("novo");
    const tipicoId = searchParams.get("tipico");
    const propostas = searchParams.get("propostas");
    const oppId = searchParams.get("oportunidade");
    const orgId = searchParams.get("organizacao");

    if (!loadId && !novo && !tipicoId && !propostas && !oppId && !orgId) return;

    setSearchParams({}, { replace: true });

    if (loadId) {
      void loadOrcamentoById(loadId);
      return;
    }

    if (novo) {
      setParams(DEFAULT_ORCAMENTO);
      setSavedId(null);
    }

    if (tipicoId) {
      void (async () => {
        const { carregarTipico, tipicoParaItensOrcamento } = await import("@/lib/tipicoLoader");
        const r = await carregarTipico(tipicoId, "orcamento");
        if ("error" in r) {
          toast({ title: r.error, variant: "destructive" });
          return;
        }

        const novosItens = tipicoParaItensOrcamento(r.resolvidos);
        setParams((p) => ({ ...p, itens: novosItens }));

        if (r.naoEncontrados.length > 0) {
          toast({
            title: `${r.naoEncontrados.length} código(s) não encontrado(s)`,
            description: r.naoEncontrados.join(", "),
          });
        } else {
          toast({ title: `Típico "${r.tipico.nome}" aplicado` });
        }

        const semPreco = novosItens.filter((i) => i.sem_preco_venda).length;
        if (semPreco > 0) {
          toast({
            title: `${semPreco} equipamento(s) sem preço de venda cadastrado`,
            description: "Preencha o valor unitário antes de enviar ao cliente.",
            variant: "destructive",
          });
        }
      })();
      return;
    }

    if (novo) return;

    if (propostas) {
      setModalOpen(true);
      return;
    }

    if (oppId) {
      void (async () => {
        const { data: opp } = await supabase
          .from("oportunidades")
          .select("titulo, organizacao_id")
          .eq("id", oppId)
          .maybeSingle();
        if (opp?.organizacao_id) {
          setParams((p) => ({ ...p, organizacao_id: opp.organizacao_id, oportunidade_id: oppId }));
          toast({ title: "Pré-preenchido a partir da oportunidade" });
        }
      })();
      return;
    }

    if (orgId) {
      setParams((p) => ({ ...p, organizacao_id: orgId }));
    }
  }, [authLoading, profile?.status, searchParams, setSearchParams, loadOrcamentoById, toast]);

  async function handlePdf() {
    if (!params.organizacao_id && !params.clientName.trim()) {
      toast({ title: "Selecione uma organização", variant: "destructive" });
      return;
    }
    if (!params.pessoa_contato_id) {
      toast({ title: "Selecione a pessoa de contato antes de gerar o PDF", variant: "destructive" });
      return;
    }
    const temMontagem = (Number(params.montagemPrecoTotal) || 0) > 0 || (Number(params.montagemDias) || 0) > 0;
    const temFrete = (Number(params.frete) || 0) > 0;
    if (params.itens.length === 0 && !temMontagem && !temFrete) {
      toast({ title: "Adicione ao menos um item, montagem/desmontagem ou frete", variant: "destructive" });
      return;
    }
    // Só salva automaticamente na primeira vez (quando ainda não há registro).
    // Em edições subsequentes, gerar PDF NÃO cria nova versão — usuário precisa apertar "Salvar".
    if (!savedId) {
      await handleSave();
    }
    let pdfParams = params;
    if (savedId) {
      const { data: fresh } = await supabase
        .from("orcamentos")
        .select("montagem_custo_total, montagem_preco_total, montagem_margem_aplicada, montagem_dias, frete")
        .eq("id", savedId)
        .maybeSingle();
      if (fresh) {
        pdfParams = {
          ...params,
          frete: Number((fresh as any).frete) || 0,
          montagemDias: Number((fresh as any).montagem_dias) || 0,
          montagemCustoTotal: Number((fresh as any).montagem_custo_total) || 0,
          montagemPrecoTotal: Number((fresh as any).montagem_preco_total) || 0,
          montagemMargemAplicada: Number((fresh as any).montagem_margem_aplicada) || 0,
        };
      }
    }
    await generateOrcamentoPdf(pdfParams);
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
            <Button size="sm" onClick={handleSave} disabled={saving || (!!params.organizacao_id && pessoasCount === 0)} className="gap-1">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Salvar
            </Button>
            <Button size="sm" variant="outline" onClick={() => setModalOpen(true)} className="gap-1">
              <FolderOpen className="w-4 h-4" /> Propostas
            </Button>
            <Button size="sm" variant="default" onClick={handlePdf} disabled={!!params.organizacao_id && pessoasCount === 0} className="gap-1">
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
          <CardContent className="space-y-3">
            {savedId && !params.organizacao_id && (
              <Alert className="bg-amber-50 border-amber-300 text-amber-900">
                <AlertTriangle className="w-4 h-4" />
                <AlertDescription className="flex items-center justify-between gap-2">
                  <span>Este orçamento não está vinculado a uma organização do CRM.</span>
                </AlertDescription>
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
                const { error } = await supabase.from("orcamentos").update({ dados_congelados: false } as any).eq("id", savedId);
                if (error) throw error;
                setParams((p) => ({ ...p, dados_congelados: false }));
              } : undefined}
            />
            {params.organizacao_id && pessoasCount === 0 && (
              <Alert className="bg-amber-50 border-amber-300 text-amber-900">
                <AlertTriangle className="w-4 h-4" />
                <AlertDescription>
                  Nenhum contato cadastrado nesta organização. Cadastre uma pessoa antes de continuar.{" "}
                  <Link to={`/organizacoes/${params.organizacao_id}`} className="underline font-medium">
                    Abrir perfil da organização
                  </Link>
                </AlertDescription>
              </Alert>
            )}

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
                    <Command
                      filter={(value, search) => {
                        if (!search) return 1;
                        return value.toLowerCase().includes(search.toLowerCase().trim()) ? 1 : 0;
                      }}
                    >
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
              <Button size="sm" variant="outline" onClick={() => setAvulsoOpen(true)} className="gap-1 h-9">
                <Plus className="w-4 h-4" /> Item avulso
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
                      <tr
                        key={`${it.equipamento_id}-${idx}`}
                        className={cn(
                          "border-t hover:bg-muted/30 transition-colors",
                          it.sem_preco_venda && "bg-amber-50/60"
                        )}
                      >
                        <td className="p-2 font-medium">
                          {it.codigo}
                          {it.avulso && <span className="ml-2 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground border">avulso</span>}
                        </td>
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
                        <td className={cn("p-2 text-right tabular-nums", it.sem_preco_venda && "text-amber-700 font-semibold")}>
                          {fmtBRL(it.valor_unitario)}
                          {it.sem_preco_venda && <span title="Sem preço de venda cadastrado" className="ml-1">*</span>}
                        </td>
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

        {/* Montagem */}
        {(() => {
          const autoDias = !!diasSugerido?.tem_maquina_tratamento;
          const diasField = autoDias ? Number(diasSugerido?.dias_sugeridos) || 0 : Number(params.montagemDias) || 0;
          const dias = diasField;
          const cols = 4;
          const kmOD = Number(params.montagemKmOrigemDestino) || 0;
          const veic = 1;
          const kmHL = Number(params.montagemKmHotelLocal) || 0;
          const t = taxasMontagem ?? { valor_dia_colaborador: 0, valor_km: 0, diaria_hospedagem: 0, diaria_alimentacao: 0, margem_percentual: 0 };
          const margemPct = Number(t.margem_percentual) || 0;
          const maoObra = dias * cols * Number(t.valor_dia_colaborador);
          const deslocOD = 2 * kmOD * Number(t.valor_km) * veic;
          const deslocDiario = params.montagemEhFazenda ? dias * 2 * kmHL * Number(t.valor_km) * veic : 0;
          const hospedagem = dias * cols * Number(t.diaria_hospedagem);
          const alimentacao = dias * cols * Number(t.diaria_alimentacao);
          const custoPreview = maoObra + deslocOD + deslocDiario + hospedagem + alimentacao;
          const precoPreview = Math.round(custoPreview * (1 + margemPct / 100) * 100) / 100;
          const margemRsPreview = precoPreview - custoPreview;

          const taxasZeradas = taxasMontagem &&
            (!Number(t.valor_dia_colaborador) || !Number(t.valor_km) ||
             !Number(t.diaria_hospedagem) || !Number(t.diaria_alimentacao));
          const margemZerada = taxasMontagem && !margemPct;

          const custoBanco = Number(params.montagemCustoTotal) || 0;
          const precoBanco = Number(params.montagemPrecoTotal) || 0;
          // Sempre exibir o preview (reativo aos inputs). O valor do banco só serve
          // para sinalizar que há mudanças não salvas.
          const custoExib = custoPreview;
          const margemRsExib = margemRsPreview;
          const precoExib = precoPreview;
          const divergencia = !!savedId && precoBanco > 0 && Math.abs(precoBanco - precoPreview) > 0.5;


          const detalheTxt = (diasSugerido?.detalhe_maquinas ?? [])
            .map((m) => {
              const desc = (m.descricao || m.codigo || "").trim();
              const short = desc.length > 60 ? desc.slice(0, 59) + "…" : desc;
              return `${m.quantidade}× ${short} (${m.dias_total} dias)`;
            })
            .join(" + ");

          const tipoMontagem = params.montagemTipo === "desmontagem" ? "Desmontagem" : "Montagem";
          const tipoMontagemLower = tipoMontagem.toLowerCase();
          return (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <CardTitle className="text-base flex items-center gap-2">
                    <HardHat className="w-4 h-4 text-primary" /> {tipoMontagem}
                  </CardTitle>
                  <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-0.5">
                    <button
                      type="button"
                      onClick={() => update("montagemTipo", "montagem")}
                      className={`px-3 py-1 text-xs rounded ${params.montagemTipo !== "desmontagem" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                    >
                      Montagem
                    </button>
                    <button
                      type="button"
                      onClick={() => update("montagemTipo", "desmontagem")}
                      className={`px-3 py-1 text-xs rounded ${params.montagemTipo === "desmontagem" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                    >
                      Desmontagem
                    </button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {margemZerada && (
                  <Alert className="bg-amber-50 border-amber-300 text-amber-900">
                    <AlertTriangle className="w-4 h-4" />
                    <AlertDescription>
                      ⚠ Margem comercial não configurada.{" "}
                      <Link to="/configuracoes/montagem" className="underline font-medium">
                        Acesse Configurações &gt; Montagem
                      </Link>.
                    </AlertDescription>
                  </Alert>
                )}
                {taxasZeradas && (
                  <Alert className="bg-amber-50 border-amber-300 text-amber-900">
                    <AlertTriangle className="w-4 h-4" />
                    <AlertDescription>
                      ⚠ Taxas de montagem incompletas.{" "}
                      <Link to="/configuracoes/montagem" className="underline font-medium">
                        Acesse Configurações &gt; Montagem
                      </Link>.
                    </AlertDescription>
                  </Alert>
                )}

                <TooltipProvider delayDuration={200}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-1">
                        Dias de {tipoMontagemLower}
                        {autoDias && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              Os dias são somados automaticamente das máquinas de tratamento selecionadas no orçamento. Para editar manualmente, remova todas as máquinas de tratamento.
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </Label>
                      <Input
                        type="number" min={0} value={dias}
                        disabled={autoDias}
                        onChange={(e) => update("montagemDias", Math.max(0, parseInt(e.target.value) || 0))}
                      />
                      {autoDias ? (
                        <p className="text-xs text-emerald-700">
                          🔧 Calculado automaticamente: {detalheTxt || `${dias} dias`} {detalheTxt ? `= ${dias} dias` : ""}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Sem máquinas de tratamento no orçamento — digite os dias manualmente
                        </p>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-1">
                        Distância Maringá → local (km, só ida)
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent>Distância apenas de ida. O cálculo já considera ida + volta automaticamente.</TooltipContent>
                        </Tooltip>
                      </Label>
                      <Input
                        type="number" min={0} step="0.1" value={kmOD}
                        onChange={(e) => update("montagemKmOrigemDestino", Math.max(0, parseFloat(e.target.value) || 0))}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between border rounded-md px-3 py-2 bg-muted/30">
                    <div>
                      <div className="text-sm font-medium">É fazenda / equipe retorna ao hotel todos os dias</div>
                    </div>
                    <Switch
                      checked={!!params.montagemEhFazenda}
                      onCheckedChange={(v) => update("montagemEhFazenda", v)}
                    />
                  </div>

                  {params.montagemEhFazenda && (
                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-1">
                        Distância fazenda ↔ hotel (km, só ida)
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent>Distância apenas de ida. O cálculo já considera ida + volta diários.</TooltipContent>
                        </Tooltip>
                      </Label>
                      <Input
                        type="number" min={0} step="0.1" value={kmHL}
                        onChange={(e) => update("montagemKmHotelLocal", Math.max(0, parseFloat(e.target.value) || 0))}
                      />
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label>Observações da {tipoMontagemLower}</Label>
                    <Textarea
                      rows={3}
                      value={params.montagemObservacoes ?? ""}
                      onChange={(e) => update("montagemObservacoes", e.target.value)}
                    />
                  </div>
                </TooltipProvider>

                {/* Breakdown interno LS — visível apenas para admin */}
                {isAdmin ? (
                  <div className="rounded-lg border bg-muted/20 p-4 space-y-1.5 text-sm">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                      Breakdown interno (não aparece na proposta)
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Mão de obra <span className="text-xs">(dias × colab. × R$/dia)</span></span>
                      <span className="font-medium tabular-nums">{fmtBRL(maoObra)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Deslocamento Maringá ↔ local</span>
                      <span className="font-medium tabular-nums">{fmtBRL(deslocOD)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Deslocamento diário (fazenda ↔ hotel)</span>
                      <span className="font-medium tabular-nums">{fmtBRL(deslocDiario)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Hospedagem</span>
                      <span className="font-medium tabular-nums">{fmtBRL(hospedagem)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Alimentação</span>
                      <span className="font-medium tabular-nums">{fmtBRL(alimentacao)}</span>
                    </div>
                    <div className="flex justify-between pt-2 mt-2 border-t">
                      <span className="font-semibold">CUSTO TOTAL</span>
                      <span className="font-semibold tabular-nums">{fmtBRL(custoExib)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Margem aplicada ({margemPct.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%)</span>
                      <span className="font-medium tabular-nums">{fmtBRL(margemRsExib)}</span>
                    </div>
                    <div className="flex justify-between pt-2 mt-2 border-t border-emerald-300">
                      <span className="font-bold text-emerald-700">PREÇO {tipoMontagem.toUpperCase()} <span className="text-xs font-normal">(cliente vê)</span></span>
                      <span className="font-bold text-emerald-700 text-2xl tabular-nums">{fmtBRL(precoExib)}</span>
                    </div>
                    {divergencia && (
                      <div className="text-xs text-amber-700 pt-1">
                        Valor no banco: {fmtBRL(precoBanco)} — clique em Salvar para persistir a atualização.
                      </div>
                    )}

                  </div>
                ) : (
                  <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 flex items-center justify-between">
                    <span className="font-bold text-emerald-700">PREÇO {tipoMontagem.toUpperCase()}</span>
                    <span className="font-bold text-emerald-700 text-2xl tabular-nums">{fmtBRL(precoExib)}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })()}

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
                <Label>Frete</Label>
                <div className="flex gap-2">
                  <Input
                    inputMode="decimal"
                    value={fmtBRL(params.frete)}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, "");
                      update("frete", digits ? Number(digits) / 100 : 0);
                    }}
                  />
                  <Button type="button" variant="outline" onClick={() => setFreteOpen(true)} className="shrink-0">
                    Calcular
                  </Button>
                </div>
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

        <FormaPagamentoSelector
          formaPagamentoId={params.formaPagamentoId}
          legacyText={params.condicoesPagamento}
          onChange={(id) => update("formaPagamentoId", id)}
        />

        {/* Condições */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" /> Condições
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Prazo de entrega</Label>
              {isAdmin ? (
                <Input
                  value={params.prazoEntrega || ""}
                  onChange={(e) => update("prazoEntrega", e.target.value)}
                  placeholder="Ex.: 90 dias, A combinar, 15/12/2026"
                />
              ) : (
                <Select
                  value={params.prazoEntrega || ""}
                  onValueChange={(v) => update("prazoEntrega", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o prazo" />
                  </SelectTrigger>
                  <SelectContent>
                    {["A combinar", "90 dias", "120 dias", "150 dias", "210 dias"].map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
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
      <ItemAvulsoModal open={avulsoOpen} onOpenChange={setAvulsoOpen} onAdd={handleAddAvulso} />
      <FreteCalculatorModal
        open={freteOpen}
        onOpenChange={setFreteOpen}
        destinoInicial={params.localEntrega || params.clienteEndereco || ""}
        onConfirm={(v) => update("frete", v)}
      />
    </div>
  );
}
