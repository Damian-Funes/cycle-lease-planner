import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { ItemOrcamento } from "@/lib/orcamento";
import { Equipamento } from "@/lib/equipamentos";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onAdd: (item: ItemOrcamento, savedEquipamento?: Equipamento) => void;
}

export default function ItemAvulsoModal({ open, onOpenChange, onAdd }: Props) {
  const [codigo, setCodigo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState<number>(0);
  const [quantidade, setQuantidade] = useState(1);
  const [salvarCatalogo, setSalvarCatalogo] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  function reset() {
    setCodigo(""); setDescricao(""); setValor(0); setQuantidade(1); setSalvarCatalogo(false);
  }

  async function handleAdd() {
    const cod = codigo.trim().toUpperCase().slice(0, 100);
    const desc = descricao.trim().toUpperCase().slice(0, 200);
    if (!cod || !desc) {
      toast({ title: "Código e descrição são obrigatórios", variant: "destructive" });
      return;
    }
    if (!valor || valor <= 0) {
      toast({ title: "Valor unitário deve ser maior que zero", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      if (salvarCatalogo) {
        // Verifica duplicidade
        const { data: existente } = await supabase
          .from("equipamentos")
          .select("*")
          .eq("codigo", cod)
          .maybeSingle();

        let eq: Equipamento;
        if (existente) {
          eq = existente as Equipamento;
          toast({ title: "Código já existe no catálogo", description: "Usando o item existente." });
        } else {
          const { data, error } = await supabase
            .from("equipamentos")
            .insert({
              codigo: cod,
              descricao: desc,
              valor_custo: 0,
              valor_venda: valor,
              categoria: "Peças/Partes",
              ativo: true,
            })
            .select()
            .single();
          if (error) throw error;
          eq = data as Equipamento;
        }

        onAdd({
          equipamento_id: eq.id,
          codigo: eq.codigo,
          descricao: eq.descricao,
          valor_unitario: Number(eq.valor_venda) || valor,
          quantidade,
        }, eq);
      } else {
        onAdd({
          equipamento_id: `avulso-${Date.now()}`,
          codigo: cod,
          descricao: desc,
          valor_unitario: valor,
          quantidade,
          avulso: true,
        });
      }
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Adicionar item avulso</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Código *</Label>
            <Input
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.toUpperCase())}
              placeholder="EX: HASTE-AG-01"
              maxLength={100}
            />
          </div>
          <div className="space-y-1">
            <Label>Descrição *</Label>
            <Input
              value={descricao}
              onChange={(e) => setDescricao(e.target.value.toUpperCase())}
              placeholder="EX: HASTE DE AGITADOR INOX 1.5M"
              maxLength={200}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Valor unitário (R$) *</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={valor || ""}
                onChange={(e) => setValor(Math.max(0, parseFloat(e.target.value) || 0))}
              />
            </div>
            <div className="space-y-1">
              <Label>Quantidade</Label>
              <Input
                type="number"
                min={1}
                value={quantidade}
                onChange={(e) => setQuantidade(Math.max(1, parseInt(e.target.value) || 1))}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer pt-2">
            <Checkbox checked={salvarCatalogo} onCheckedChange={(c) => setSalvarCatalogo(!!c)} />
            <span>Salvar no catálogo para reutilizar (categoria: Peças/Partes)</span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleAdd} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            Adicionar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
