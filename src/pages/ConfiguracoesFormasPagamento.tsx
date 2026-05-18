import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Plus, Pencil, Power } from "lucide-react";
import AppHeader from "@/components/AppHeader";

interface Forma {
  id: string;
  nome: string;
  descricao_proposta: string;
  ordem: number;
  ativo: boolean;
  desconto_padrao_pct: number | null;
}

const truncate = (s: string, n = 80) => (s.length > n ? s.slice(0, n) + "..." : s);

export default function ConfiguracoesFormasPagamento() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Forma[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Forma | null>(null);

  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [ordem, setOrdem] = useState<string>("100");
  const [ativo, setAtivo] = useState(true);
  const [desconto, setDesconto] = useState<string>("");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("formas_pagamento")
      .select("*")
      .order("ordem", { ascending: true });
    if (error) toast.error("Erro ao carregar: " + error.message);
    else setRows((data || []) as Forma[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditing(null);
    setNome(""); setDescricao(""); setOrdem("100"); setAtivo(true); setDesconto("");
    setOpen(true);
  };

  const openEdit = (f: Forma) => {
    setEditing(f);
    setNome(f.nome);
    setDescricao(f.descricao_proposta);
    setOrdem(String(f.ordem ?? 100));
    setAtivo(f.ativo);
    setDesconto(f.desconto_padrao_pct != null ? String(f.desconto_padrao_pct).replace(".", ",") : "");
    setOpen(true);
  };

  const handleSave = async () => {
    const n = nome.trim();
    const d = descricao.trim();
    if (!n) return toast.error("Nome é obrigatório");
    if (d.length < 20) return toast.error("Descrição deve ter no mínimo 20 caracteres");
    const ord = parseInt(ordem, 10);
    if (isNaN(ord)) return toast.error("Ordem inválida");
    const descNum = desconto.trim() ? Number(desconto.replace(",", ".")) : null;
    if (descNum !== null && (isNaN(descNum) || descNum < 0 || descNum > 100)) {
      return toast.error("Desconto deve estar entre 0 e 100");
    }

    setSaving(true);
    const payload = {
      nome: n,
      descricao_proposta: d,
      ordem: ord,
      ativo,
      desconto_padrao_pct: descNum,
    };

    const { error } = editing
      ? await supabase.from("formas_pagamento").update(payload).eq("id", editing.id)
      : await supabase.from("formas_pagamento").insert(payload);

    setSaving(false);
    if (error) {
      if (error.code === "23505" || /unique|duplicate/i.test(error.message)) {
        toast.error("Já existe uma forma de pagamento com esse nome");
      } else {
        toast.error("Erro ao salvar: " + error.message);
      }
      return;
    }
    toast.success(editing ? "Forma atualizada" : "Forma criada");
    setOpen(false);
    load();
  };

  const toggleAtivo = async (f: Forma) => {
    const { error } = await supabase
      .from("formas_pagamento")
      .update({ ativo: !f.ativo })
      .eq("id", f.id);
    if (error) toast.error("Erro: " + error.message);
    else {
      toast.success(!f.ativo ? "Forma ativada" : "Forma inativada");
      load();
    }
  };

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="bg-background border-b">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-2">
            <ArrowLeft className="w-4 h-4" /> Voltar
          </Button>
          <AppHeader />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-start justify-between mb-6 gap-4">
          <div>
            <h1 className="text-2xl font-bold mb-1">Formas de Pagamento</h1>
            <p className="text-sm text-muted-foreground">
              Gerencie as formas de pagamento disponíveis no orçamento.
            </p>
          </div>
          <Button onClick={openNew} className="gap-2">
            <Plus className="w-4 h-4" /> Nova forma de pagamento
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium w-16">Ordem</th>
                  <th className="px-4 py-3 font-medium">Nome</th>
                  <th className="px-4 py-3 font-medium">Descrição na proposta</th>
                  <th className="px-4 py-3 font-medium w-24">Status</th>
                  <th className="px-4 py-3 font-medium w-32 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    Nenhuma forma de pagamento cadastrada
                  </td></tr>
                )}
                {rows.map((f) => (
                  <tr key={f.id} className="border-t">
                    <td className="px-4 py-3 text-muted-foreground">{f.ordem}</td>
                    <td className="px-4 py-3 font-medium">{f.nome}</td>
                    <td className="px-4 py-3 text-muted-foreground">{truncate(f.descricao_proposta)}</td>
                    <td className="px-4 py-3">
                      <Badge variant={f.ativo ? "default" : "secondary"} className={f.ativo ? "bg-emerald-600 hover:bg-emerald-600" : ""}>
                        {f.ativo ? "Ativa" : "Inativa"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(f)} className="gap-1">
                          <Pencil className="w-3.5 h-3.5" /> Editar
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => toggleAtivo(f)} className="gap-1">
                          <Power className="w-3.5 h-3.5" /> {f.ativo ? "Inativar" : "Ativar"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </main>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar forma de pagamento" : "Nova forma de pagamento"}</DialogTitle>
            <DialogDescription>
              Configure como esta forma de pagamento aparece no orçamento e na proposta.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nome curto *</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Entrada 30% + 30/60/90" maxLength={120} />
              <p className="text-xs text-muted-foreground">
                Aparece no modal de seleção do orçamento. Ex: "Entrada 30% + 30/60/90"
              </p>
            </div>

            <div className="space-y-2">
              <Label>Descrição completa para a proposta *</Label>
              <Textarea
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                rows={5}
                placeholder="Texto que aparecerá na proposta enviada ao cliente"
              />
              <p className="text-xs text-muted-foreground">
                Texto exato que aparece na proposta ao cliente. <strong>Atenção: este texto é contratual.</strong> ({descricao.trim().length}/20 min)
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Ordem de exibição</Label>
                <Input type="number" value={ordem} onChange={(e) => setOrdem(e.target.value)} />
                <p className="text-xs text-muted-foreground">Menor número aparece primeiro</p>
              </div>

              <div className="space-y-2">
                <Label>Desconto padrão (%)</Label>
                <Input
                  inputMode="decimal"
                  value={desconto}
                  onChange={(e) => setDesconto(e.target.value.replace(/[^\d,.]/g, ""))}
                  placeholder="opcional"
                />
                <p className="text-xs text-muted-foreground">Vazio = negociação caso a caso</p>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label className="text-sm">Ativa</Label>
                <p className="text-xs text-muted-foreground">
                  Inativar mantém para orçamentos antigos, mas remove do modal de seleção.
                </p>
              </div>
              <Switch checked={ativo} onCheckedChange={setAtivo} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {editing ? "Salvar alterações" : "Criar forma"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
