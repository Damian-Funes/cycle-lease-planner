import { useState, useEffect, useRef, type WheelEvent } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ChevronsUpDown, Trash2, Plus, AlertTriangle, Loader2, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Tipico, TipicoInput, TipicoItem, TipicoTipo } from "@/lib/tipicos";
import { useCreateTipico, useUpdateTipico } from "@/hooks/useTipicos";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tipico?: Tipico | null;
}

interface EqLite { codigo: string; descricao: string; valor_venda: number | null }

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function TipicoFormModal({ open, onOpenChange, tipico }: Props) {
  const editing = !!tipico;
  const dialogContentRef = useRef<HTMLDivElement | null>(null);
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [tipo, setTipo] = useState<TipicoTipo>("orcamento");
  const [itens, setItens] = useState<TipicoItem[]>([]);
  const [capacidade, setCapacidade] = useState("");
  const [destacado, setDestacado] = useState(false);
  const [equipamentos, setEquipamentos] = useState<EqLite[]>([]);

  // Linha de adição
  const [selectedCodigo, setSelectedCodigo] = useState("");
  const [codigoLivre, setCodigoLivre] = useState("");
  const [novaQtd, setNovaQtd] = useState(1);
  const [comboOpen, setComboOpen] = useState(false);

  const create = useCreateTipico();
  const update = useUpdateTipico();
  const saving = create.isPending || update.isPending;

  useEffect(() => {
    if (!open) return;
    supabase.from("equipamentos").select("codigo,descricao,valor_venda").eq("ativo", true).order("codigo").then(({ data }) => {
      if (data) setEquipamentos(data as EqLite[]);
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (tipico) {
      setNome(tipico.nome);
      setDescricao(tipico.descricao ?? "");
      setTipo(tipico.tipo);
      setItens(Array.isArray(tipico.itens) ? tipico.itens : []);
      setCapacidade(String(tipico.capacidade_sacos_ano ?? 1));
      setDestacado(tipico.destacado);
    } else {
      setNome(""); setDescricao(""); setTipo("orcamento"); setItens([]);
      setCapacidade("1"); setDestacado(false);
    }
    setSelectedCodigo(""); setCodigoLivre(""); setNovaQtd(1);
  }, [open, tipico]);

  const codigosSet = new Set(equipamentos.map((e) => e.codigo));
  const descPorCodigo = new Map(equipamentos.map((e) => [e.codigo, e.descricao]));
  const valorPorCodigo = new Map(equipamentos.map((e) => [e.codigo, Number(e.valor_venda) || 0]));
  const valorRefCalc = itens.reduce((s, i) => s + (valorPorCodigo.get(i.codigo) ?? 0) * i.quantidade, 0);
  const itensSemPreco = itens.filter((i) => !valorPorCodigo.get(i.codigo));

  function addItem(codigo: string, quantidade: number) {
    const c = codigo.trim();
    if (!c) return;
    if (!Number.isInteger(quantidade) || quantidade <= 0) {
      toast.error("Quantidade deve ser inteiro maior que zero");
      return;
    }
    const idx = itens.findIndex((i) => i.codigo === c);
    if (idx >= 0) {
      setItens(itens.map((it, i) => i === idx ? { ...it, quantidade: it.quantidade + quantidade } : it));
    } else {
      setItens([...itens, { codigo: c, quantidade }]);
    }
    setSelectedCodigo(""); setCodigoLivre(""); setNovaQtd(1);
  }

  function removeItem(idx: number) {
    setItens(itens.filter((_, i) => i !== idx));
  }

  function changeQtd(idx: number, q: number) {
    if (!Number.isInteger(q) || q <= 0) return;
    setItens(itens.map((it, i) => i === idx ? { ...it, quantidade: q } : it));
  }

  function releaseWheelFromNumberInput(event: WheelEvent<HTMLInputElement>) {
    event.currentTarget.blur();
  }

  async function handleSubmit() {
    if (!nome.trim()) return toast.error("Nome obrigatório");
    const cap = parseInt(String(capacidade).replace(/\D/g, ""), 10) || 1;
    const val = valorRefCalc;
    if (!val || val <= 0) return toast.error("Valor de referência deve ser maior que zero");
    if (itens.length === 0) return toast.error("Adicione ao menos um equipamento");

    const payload: TipicoInput = {
      nome: nome.trim(),
      descricao: descricao.trim() || null,
      tipo,
      itens,
      capacidade_sacos_ano: cap,
      valor_referencia: val,
      destacado,
    };

    try {
      if (editing && tipico) {
        await update.mutateAsync({ id: tipico.id, patch: payload });
        toast.success("Típico atualizado");
      } else {
        await create.mutateAsync(payload);
        toast.success("Típico criado");
      }
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao salvar");
    }
  }

  const naoCadCount = itens.filter((i) => !codigosSet.has(i.codigo)).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent ref={dialogContentRef} className="flex max-h-[90vh] max-w-2xl flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>{editing ? "Editar Típico" : "Novo Típico"}</DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-2 pr-1" data-tipico-scroll>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Nome *</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Recebimento 500t/h padrão" />
            </div>

            <div className="space-y-1.5">
              <Label>Tipo *{editing && <span className="text-xs text-muted-foreground ml-2">(imutável)</span>}</Label>
              <Select value={tipo} onValueChange={(v: TipicoTipo) => setTipo(v)} disabled={editing}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="orcamento">Orçamento</SelectItem>
                  <SelectItem value="aluguel">Aluguel (SmartCycle)</SelectItem>
                </SelectContent>
              </Select>
            </div>


            <div className="space-y-1.5">
              <Label>Valor de Referência (calculado)</Label>
              <div className="h-9 px-3 flex items-center rounded-md border bg-muted/40 text-sm font-semibold text-primary">
                {formatBRL(valorRefCalc)}
              </div>
              {itensSemPreco.length > 0 && (
                <p className="text-[11px] text-amber-600 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> {itensSemPreco.length} item(ns) sem valor de venda no catálogo
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 pt-6">
              <Switch checked={destacado} onCheckedChange={setDestacado} id="destacado" />
              <Label htmlFor="destacado" className="cursor-pointer">Destacar no topo</Label>
            </div>

            <div className="sm:col-span-2 space-y-1.5">
              <Label>Descrição</Label>
              <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2} placeholder="Detalhes do típico..." />
            </div>

            <div className="sm:col-span-2 space-y-2">
              <Label>Equipamentos *</Label>

              {/* Linha de adição */}
              <div className="flex gap-2 items-end flex-wrap">
                <div className="flex-1 min-w-[200px] space-y-1">
                  <span className="text-xs text-muted-foreground">Catálogo</span>
                  <Popover open={comboOpen} onOpenChange={setComboOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" role="combobox" className="w-full justify-between h-9 font-normal">
                        {selectedCodigo
                          ? `${selectedCodigo} — ${descPorCodigo.get(selectedCodigo) ?? ""}`
                          : "Selecione um equipamento..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      container={dialogContentRef.current}
                      className="w-[--radix-popover-trigger-width] p-0 bg-popover z-[60]"
                      align="start"
                      side="bottom"
                      avoidCollisions={false}
                    >
                      <Command
                        filter={(value, search) => {
                          if (!search) return 1;
                          return value.toLowerCase().includes(search.toLowerCase().trim()) ? 1 : 0;
                        }}
                      >
                        <CommandInput placeholder="Código ou descrição..." />
                        <CommandList className="max-h-[240px] overflow-y-auto overscroll-contain">
                          <CommandEmpty>Nenhum equipamento.</CommandEmpty>
                          <CommandGroup>
                            {equipamentos.map((eq) => (
                              <CommandItem
                                key={eq.codigo}
                                value={`${eq.codigo} ${eq.descricao}`}
                                onSelect={() => { setSelectedCodigo(eq.codigo); setComboOpen(false); }}
                              >
                                <Check className={cn("mr-2 h-4 w-4", selectedCodigo === eq.codigo ? "opacity-100" : "opacity-0")} />
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
                  <span className="text-xs text-muted-foreground">Qtd</span>
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    value={novaQtd}
                    onChange={(e) => setNovaQtd(Math.max(1, parseInt(e.target.value) || 1))}
                    onWheel={releaseWheelFromNumberInput}
                    className="h-9 text-center"
                  />
                </div>
                <Button
                  size="sm"
                  className="gap-1 h-9"
                  onClick={() => addItem(selectedCodigo, novaQtd)}
                  disabled={!selectedCodigo}
                >
                  <Plus className="w-4 h-4" /> Adicionar
                </Button>
              </div>

              {/* Linha de código livre */}
              <div className="flex gap-2 items-end flex-wrap">
                <div className="flex-1 min-w-[200px] space-y-1">
                  <span className="text-xs text-muted-foreground">Código livre (não cadastrado)</span>
                  <Input
                    value={codigoLivre}
                    onChange={(e) => setCodigoLivre(e.target.value)}
                    placeholder="Ex: GLT-9999"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); addItem(codigoLivre, novaQtd); }
                    }}
                  />
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  className="gap-1 h-9"
                  onClick={() => addItem(codigoLivre, novaQtd)}
                  disabled={!codigoLivre.trim()}
                >
                  <Plus className="w-4 h-4" /> Adicionar livre
                </Button>
              </div>

              {/* Tabela de itens */}
              {itens.length > 0 ? (
                <div className="rounded-lg border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50 text-muted-foreground">
                        <th className="text-left p-2 font-medium">Código</th>
                        <th className="text-left p-2 font-medium hidden sm:table-cell">Descrição</th>
                        <th className="text-center p-2 font-medium w-20">Qtd</th>
                        <th className="p-2 w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {itens.map((it, idx) => {
                        const naoCad = !codigosSet.has(it.codigo);
                        return (
                          <tr key={`${it.codigo}-${idx}`} className="border-t">
                            <td className="p-2 font-mono font-medium">
                              <div className="flex items-center gap-1">
                                {it.codigo}
                                {naoCad && <AlertTriangle className="w-3 h-3 text-amber-600" />}
                              </div>
                            </td>
                            <td className="p-2 text-muted-foreground hidden sm:table-cell">
                              {naoCad ? <span className="text-amber-600 text-xs">não cadastrado</span> : (descPorCodigo.get(it.codigo) ?? "—")}
                            </td>
                            <td className="p-2 text-center">
                              <Input
                                type="number"
                                min={1}
                                step={1}
                                value={it.quantidade}
                                onChange={(e) => changeQtd(idx, parseInt(e.target.value) || 1)}
                                onWheel={releaseWheelFromNumberInput}
                                className="w-16 h-7 text-center"
                              />
                            </td>
                            <td className="p-2">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeItem(idx)}>
                                <Trash2 className="w-3.5 h-3.5 text-destructive" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-3 border rounded-lg">
                  Nenhum equipamento adicionado.
                </p>
              )}

              {naoCadCount > 0 && (
                <p className="text-xs text-amber-600 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> {naoCadCount} código(s) não cadastrado(s) no catálogo
                </p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {editing ? "Salvar" : "Criar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
