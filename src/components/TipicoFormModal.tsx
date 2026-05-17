import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ChevronsUpDown, X, AlertTriangle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Tipico, TipicoInput, TipicoTipo } from "@/lib/tipicos";
import { useCreateTipico, useUpdateTipico } from "@/hooks/useTipicos";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tipico?: Tipico | null;
}

interface EqLite { codigo: string; descricao: string }

export default function TipicoFormModal({ open, onOpenChange, tipico }: Props) {
  const editing = !!tipico;
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [tipo, setTipo] = useState<TipicoTipo>("orcamento");
  const [codigos, setCodigos] = useState<string[]>([]);
  const [capacidade, setCapacidade] = useState("");
  const [valorRef, setValorRef] = useState("");
  const [destacado, setDestacado] = useState(false);
  const [equipamentos, setEquipamentos] = useState<EqLite[]>([]);
  const [comboOpen, setComboOpen] = useState(false);
  const [codigoLivre, setCodigoLivre] = useState("");

  const create = useCreateTipico();
  const update = useUpdateTipico();
  const saving = create.isPending || update.isPending;

  useEffect(() => {
    if (!open) return;
    supabase.from("equipamentos").select("codigo,descricao").eq("ativo", true).order("codigo").then(({ data }) => {
      if (data) setEquipamentos(data as EqLite[]);
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (tipico) {
      setNome(tipico.nome);
      setDescricao(tipico.descricao ?? "");
      setTipo(tipico.tipo);
      setCodigos(tipico.codigos);
      setCapacidade(String(tipico.capacidade_sacos_ano));
      setValorRef(String(tipico.valor_referencia));
      setDestacado(tipico.destacado);
    } else {
      setNome(""); setDescricao(""); setTipo("orcamento"); setCodigos([]);
      setCapacidade(""); setValorRef(""); setDestacado(false);
    }
    setCodigoLivre("");
  }, [open, tipico]);

  const codigosSet = new Set(equipamentos.map((e) => e.codigo));
  const naoCadastrados = codigos.filter((c) => !codigosSet.has(c));

  function addCodigo(c: string) {
    const code = c.trim();
    if (!code) return;
    if (codigos.includes(code)) return;
    setCodigos([...codigos, code]);
  }
  function removeCodigo(c: string) {
    setCodigos(codigos.filter((x) => x !== c));
  }

  async function handleSubmit() {
    if (!nome.trim()) return toast.error("Nome obrigatório");
    const cap = parseInt(capacidade.replace(/\D/g, ""), 10);
    const val = parseFloat(valorRef.replace(/\./g, "").replace(",", "."));
    if (!cap || cap <= 0) return toast.error("Capacidade deve ser maior que zero");
    if (!val || val <= 0) return toast.error("Valor de referência deve ser maior que zero");
    if (codigos.length === 0) return toast.error("Adicione ao menos um código");

    const payload: TipicoInput = {
      nome: nome.trim(),
      descricao: descricao.trim() || null,
      tipo,
      codigos,
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar Típico" : "Novo Típico"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
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
              <Label>Capacidade (sc/ano) *</Label>
              <Input type="number" min={1} value={capacidade} onChange={(e) => setCapacidade(e.target.value)} placeholder="Ex: 40000" />
            </div>

            <div className="space-y-1.5">
              <Label>Valor de Referência (R$) *</Label>
              <Input value={valorRef} onChange={(e) => setValorRef(e.target.value)} placeholder="Ex: 850000,00" />
            </div>

            <div className="flex items-center gap-2 pt-6">
              <Switch checked={destacado} onCheckedChange={setDestacado} id="destacado" />
              <Label htmlFor="destacado" className="cursor-pointer">Destacar no topo</Label>
            </div>

            <div className="sm:col-span-2 space-y-1.5">
              <Label>Descrição</Label>
              <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2} placeholder="Detalhes do típico..." />
            </div>

            <div className="sm:col-span-2 space-y-1.5">
              <Label>Códigos de equipamentos *</Label>
              <div className="flex gap-2">
                <Popover open={comboOpen} onOpenChange={setComboOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="flex-1 justify-between font-normal">
                      Buscar no catálogo...
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0 bg-popover z-50" align="start">
                    <Command>
                      <CommandInput placeholder="Código ou descrição..." />
                      <CommandList>
                        <CommandEmpty>Nenhum equipamento.</CommandEmpty>
                        <CommandGroup>
                          {equipamentos.map((eq) => (
                            <CommandItem
                              key={eq.codigo}
                              value={`${eq.codigo} ${eq.descricao}`}
                              onSelect={() => { addCodigo(eq.codigo); setComboOpen(false); }}
                            >
                              {eq.codigo} — {eq.descricao}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <Input
                  placeholder="Código livre"
                  value={codigoLivre}
                  onChange={(e) => setCodigoLivre(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); addCodigo(codigoLivre); setCodigoLivre(""); }
                  }}
                  className="w-40"
                />
                <Button type="button" variant="secondary" onClick={() => { addCodigo(codigoLivre); setCodigoLivre(""); }}>+</Button>
              </div>

              {codigos.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-2">
                  {codigos.map((c) => {
                    const naoCad = !codigosSet.has(c);
                    return (
                      <Badge key={c} variant={naoCad ? "outline" : "secondary"} className={naoCad ? "border-amber-500 text-amber-700" : ""}>
                        {c}
                        {naoCad && <AlertTriangle className="w-3 h-3 ml-1 text-amber-600" />}
                        <button onClick={() => removeCodigo(c)} className="ml-1 hover:text-destructive"><X className="w-3 h-3" /></button>
                      </Badge>
                    );
                  })}
                </div>
              )}
              {naoCadastrados.length > 0 && (
                <p className="text-xs text-amber-600 flex items-center gap-1 pt-1">
                  <AlertTriangle className="w-3 h-3" /> {naoCadastrados.length} código(s) não cadastrado(s) no catálogo
                </p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
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
