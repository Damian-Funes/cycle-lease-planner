import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { supabase } from "@/integrations/supabase/client";
import { Equipamento, ItemProjeto, calcEntrada, calcValorVendaSugerido } from "@/lib/equipamentos";
import { formatBRL } from "@/lib/smartcycle";
import { Wrench, Plus, Trash2, AlertTriangle, ChevronsUpDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
interface Props {
  itens: ItemProjeto[];
  onItensChange: (itens: ItemProjeto[]) => void;
  valorProjeto: number;
  onValorProjetoChange: (v: number) => void;
}


export default function EquipmentSelector({ itens, onItensChange, valorProjeto, onValorProjetoChange }: Props) {
  const [equipamentos, setEquipamentos] = useState<Equipamento[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [quantidade, setQuantidade] = useState(1);
  const [comboOpen, setComboOpen] = useState(false);

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

  const entrada = calcEntrada(itens);
  const sugerido = calcValorVendaSugerido(itens);
  const projetoMenorQueCusto = valorProjeto > 0 && valorProjeto < entrada;

  // Sempre que os itens mudarem, sincroniza o valorProjeto com a soma dos valores de venda
  useEffect(() => {
    if (sugerido !== valorProjeto) {
      onValorProjetoChange(sugerido);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sugerido]);

  function autoFillProjeto(_newItens: ItemProjeto[]) {
    // No-op: a sincronização é feita pelo useEffect acima
  }

  function aplicarSugerido() {
    onValorProjetoChange(sugerido);
  }

  function handleAdd() {
    if (!selectedId || quantidade < 1) return;
    const eq = equipamentos.find((e) => e.id === selectedId);
    if (!eq) return;

    const existing = itens.findIndex((i) => i.equipamento_id === eq.id);
    let newItens: ItemProjeto[];
    if (existing >= 0) {
      newItens = itens.map((item, idx) => {
        if (idx !== existing) return item;
        const newQtd = item.quantidade + quantidade;
        return { ...item, quantidade: newQtd, subtotal: newQtd * item.valor_custo };
      });
    } else {
      newItens = [
        ...itens,
        {
          equipamento_id: eq.id,
          codigo: eq.codigo,
          descricao: eq.descricao,
          valor_custo: eq.valor_custo,
          valor_venda: eq.valor_venda ?? null,
          quantidade,
          subtotal: quantidade * eq.valor_custo,
        },
      ];
    }
    onItensChange(newItens);
    autoFillProjeto(newItens);
    setSelectedId("");
    setQuantidade(1);
  }

  function handleRemove(idx: number) {
    const newItens = itens.filter((_, i) => i !== idx);
    onItensChange(newItens);
    autoFillProjeto(newItens);
  }

  function handleQtdChange(idx: number, newQtd: number) {
    if (newQtd < 1) return;
    const newItens = itens.map((item, i) =>
      i === idx ? { ...item, quantidade: newQtd, subtotal: newQtd * item.valor_custo } : item
    );
    onItensChange(newItens);
    autoFillProjeto(newItens);
  }

  return (
    <div className="space-y-4">
      {/* Equipment selection card */}
      <Card className="transition-all duration-300 hover:shadow-md hover:-translate-y-0.5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Wrench className="w-4 h-4 text-primary" /> Composição do Projeto
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add row */}
          <div className="flex gap-2 items-end flex-wrap">
            <div className="flex-1 min-w-[200px] space-y-1">
              <label className="text-sm font-medium text-muted-foreground">Equipamento</label>
              <Popover open={comboOpen} onOpenChange={setComboOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={comboOpen}
                    className="w-full justify-between h-9 font-normal"
                  >
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
              <label className="text-sm font-medium text-muted-foreground">Qtd</label>
              <input
                type="number"
                min={1}
                value={quantidade}
                onChange={(e) => setQuantidade(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full h-9 px-3 rounded-md border bg-background text-sm font-medium text-center focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <Button size="sm" onClick={handleAdd} disabled={!selectedId} className="gap-1 h-9">
              <Plus className="w-4 h-4" /> Adicionar
            </Button>
          </div>

          {/* Items list */}
          {itens.length > 0 && (
            <div className="border rounded-lg overflow-hidden">
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
                  {itens.map((item, idx) => (
                    <tr key={item.equipamento_id} className="border-t hover:bg-muted/30 transition-colors">
                      <td className="p-2 font-medium">{item.codigo}</td>
                      <td className="p-2 text-muted-foreground hidden sm:table-cell">{item.descricao}</td>
                      <td className="p-2 text-center">
                        <input
                          type="number"
                          min={1}
                          value={item.quantidade}
                          onChange={(e) => handleQtdChange(idx, parseInt(e.target.value) || 1)}
                          className="w-16 h-7 px-1 rounded border bg-background text-sm text-center focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                      </td>
                      <td className="p-2">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleRemove(idx)}>
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-secondary/50">
                    <td colSpan={2} className="p-2 font-semibold text-right">Entrada:</td>
                    <td className="p-2 text-right font-bold text-primary text-base">{formatBRL(entrada)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {itens.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhum equipamento adicionado. Selecione acima para compor o projeto.
            </p>
          )}

          {/* Valor Total do Projeto — calculado automaticamente */}
          <div className="space-y-1.5 pt-2 border-t">
            <label className="text-sm font-medium text-muted-foreground">
              Valor Total do Projeto (R$)
            </label>
            <div className="flex items-center justify-between bg-muted/30 border rounded-md h-11 px-3">
              <span className="text-xs text-muted-foreground">Calculado automaticamente</span>
              <span className="text-base font-bold text-primary">
                {valorProjeto > 0 ? formatBRL(valorProjeto) : "—"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Soma dos valores de venda dos equipamentos selecionados (planilha oficial).
            </p>
            {projetoMenorQueCusto && (
              <div className="flex items-center gap-1.5 text-destructive text-xs font-medium mt-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                Valor do projeto deve ser maior que o custo ({formatBRL(entrada)})
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
