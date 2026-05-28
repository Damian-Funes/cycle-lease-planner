import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { ItemReformaCatalogo } from "@/lib/reforma";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Link, Navigate } from "react-router-dom";
import { ArrowLeft, Loader2, Plus, Save, X, Pencil, Power, PowerOff, Trash2 } from "lucide-react";

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function ReformaCatalogo() {
  const { isAdmin, loading: authLoading } = useAuth();
  const [itens, setItens] = useState<ItemReformaCatalogo[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({
    codigo: "",
    descricao: "",
    categoria: "",
    valor: "",
    ordem: "0",
  });
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("itens_reforma").select("*").order("ordem");
    if (data) setItens(data as ItemReformaCatalogo[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!isAdmin) return <Navigate to="/reforma" replace />;

  function resetForm() {
    setForm({ codigo: "", descricao: "", categoria: "", valor: "", ordem: "0" });
  }
  function startNew() {
    setEditing("new");
    resetForm();
  }
  function startEdit(it: ItemReformaCatalogo) {
    setEditing(it.id);
    setForm({
      codigo: it.codigo,
      descricao: it.descricao,
      categoria: it.categoria,
      valor: String(it.valor || 0),
      ordem: String(it.ordem || 0),
    });
  }
  function cancelEdit() {
    setEditing(null);
    resetForm();
  }

  async function handleSave() {
    if (!form.codigo.trim() || !form.descricao.trim() || !form.categoria.trim()) {
      toast({ title: "Preencha código, descrição e categoria", variant: "destructive" });
      return;
    }
    setSaving(true);
    const row = {
      codigo: form.codigo.trim(),
      descricao: form.descricao.trim(),
      categoria: form.categoria.trim(),
      valor: parseFloat(form.valor) || 0,
      ordem: parseInt(form.ordem, 10) || 0,
    };
    let error;
    if (editing === "new") {
      const res = await supabase.from("itens_reforma").insert(row);
      error = res.error;
    } else {
      const res = await supabase.from("itens_reforma").update(row).eq("id", editing!);
      error = res.error;
    }
    setSaving(false);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Item salvo" });
      setEditing(null);
      resetForm();
      fetchAll();
    }
  }

  async function toggleAtivo(it: ItemReformaCatalogo) {
    await supabase.from("itens_reforma").update({ ativo: !it.ativo }).eq("id", it.id);
    fetchAll();
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Excluir este item?")) return;
    const { error } = await supabase.from("itens_reforma").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      fetchAll();
    }
  }

  // Agrupar por categoria
  const grupos = itens.reduce<Record<string, ItemReformaCatalogo[]>>((acc, it) => {
    (acc[it.categoria] ||= []).push(it);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="container max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/reforma">
              <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
            </Link>
            <h1 className="text-lg font-bold">Catálogo de Reforma</h1>
          </div>
          <Button size="sm" onClick={startNew} className="gap-1">
            <Plus className="w-4 h-4" /> Novo Item
          </Button>
        </div>
      </header>

      <main className="container max-w-5xl mx-auto px-4 py-6 space-y-4">
        <Dialog open={!!editing} onOpenChange={(o) => { if (!o) cancelEdit(); }}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editing === "new" ? "Novo Item" : "Editar Item"}</DialogTitle>
            </DialogHeader>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Código</Label>
                <Input value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} placeholder="1.1.0" />
              </div>
              <div className="space-y-1">
                <Label>Categoria</Label>
                <Input value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} placeholder="Homogenizador" />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Descrição</Label>
                <Input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Valor (R$)</Label>
                <Input type="number" min={0} step="0.01" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Ordem</Label>
                <Input type="number" value={form.ordem} onChange={(e) => setForm({ ...form, ordem: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button size="sm" variant="outline" onClick={cancelEdit} className="gap-1">
                <X className="w-4 h-4" /> Cancelar
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>


        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : itens.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">Nenhum item cadastrado.</p>
        ) : (
          Object.entries(grupos).map(([cat, lista]) => (
            <Card key={cat}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-rose-600">{cat}</CardTitle>
              </CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 text-muted-foreground">
                      <th className="text-left p-2 font-medium w-24">Código</th>
                      <th className="text-left p-2 font-medium">Descrição</th>
                      <th className="text-right p-2 font-medium w-32">Valor</th>
                      <th className="text-center p-2 font-medium w-20">Ordem</th>
                      <th className="text-center p-2 font-medium w-20">Status</th>
                      <th className="p-2 w-32"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lista.map((it) => (
                      <tr key={it.id} className="border-t">
                        <td className="p-2 font-mono text-xs">{it.codigo}</td>
                        <td className="p-2">{it.descricao}</td>
                        <td className="p-2 text-right tabular-nums">{fmtBRL(Number(it.valor) || 0)}</td>
                        <td className="p-2 text-center text-muted-foreground">{it.ordem}</td>
                        <td className="p-2 text-center">
                          <span className={`text-xs px-2 py-0.5 rounded ${it.ativo ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                            {it.ativo ? "Ativo" : "Inativo"}
                          </span>
                        </td>
                        <td className="p-2 flex gap-1 justify-end">
                          <Button size="sm" variant="ghost" onClick={() => startEdit(it)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => toggleAtivo(it)}>
                            {it.ativo ? <PowerOff className="w-3.5 h-3.5" /> : <Power className="w-3.5 h-3.5" />}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleDelete(it.id)}>
                            <Trash2 className="w-3.5 h-3.5 text-destructive" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ))
        )}
      </main>
    </div>
  );
}
