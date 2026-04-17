import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Equipamento } from "@/lib/equipamentos";
import { formatBRL } from "@/lib/smartcycle";
import { Plus, Pencil, Power, PowerOff, ArrowLeft, Loader2, Save, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link, useNavigate } from "react-router-dom";

export default function Catalogo() {
  const navigate = useNavigate();
  const [equipamentos, setEquipamentos] = useState<Equipamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ codigo: "", descricao: "", valor_custo: "", valor_venda: "" });
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (sessionStorage.getItem("catalogo_auth") !== "true") {
      navigate("/", { replace: true });
      return;
    }
    fetchAll();
  }, [navigate]);

  async function fetchAll() {
    setLoading(true);
    const { data } = await supabase.from("equipamentos").select("*").order("codigo");
    if (data) setEquipamentos(data as Equipamento[]);
    setLoading(false);
  }

  function startNew() {
    setEditing("new");
    setForm({ codigo: "", descricao: "", valor_custo: "", valor_venda: "" });
  }

  function startEdit(eq: Equipamento) {
    setEditing(eq.id);
    setForm({
      codigo: eq.codigo,
      descricao: eq.descricao,
      valor_custo: eq.valor_custo.toString(),
      valor_venda: eq.valor_venda != null ? eq.valor_venda.toString() : "",
    });
  }

  function cancelEdit() {
    setEditing(null);
  }

  function parseMoney(v: string): number | null {
    const s = v.trim();
    if (!s) return null;
    return parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0;
  }

  async function handleSave() {
    if (!form.codigo.trim() || !form.descricao.trim() || !form.valor_custo) {
      toast({ title: "Preencha código, descrição e valor de custo", variant: "destructive" });
      return;
    }
    setSaving(true);
    const row = {
      codigo: form.codigo.trim(),
      descricao: form.descricao.trim(),
      valor_custo: parseMoney(form.valor_custo) ?? 0,
      valor_venda: parseMoney(form.valor_venda),
    };

    if (editing === "new") {
      const { error } = await supabase.from("equipamentos").insert(row);
      if (error) {
        toast({ title: "Erro", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Equipamento adicionado" });
      }
    } else {
      const { error } = await supabase.from("equipamentos").update(row).eq("id", editing!);
      if (error) {
        toast({ title: "Erro", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Equipamento atualizado" });
      }
    }

    setSaving(false);
    setEditing(null);
    fetchAll();
  }

  async function toggleAtivo(eq: Equipamento) {
    await supabase.from("equipamentos").update({ ativo: !eq.ativo }).eq("id", eq.id);
    fetchAll();
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="container max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/">
              <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
            </Link>
            <h1 className="text-lg font-bold text-foreground">Catálogo de Equipamentos</h1>
          </div>
          <Button size="sm" onClick={startNew} className="gap-1">
            <Plus className="w-4 h-4" /> Novo Equipamento
          </Button>
        </div>
      </header>

      <main className="container max-w-5xl mx-auto px-4 py-6 space-y-4">
        {/* Edit/New form */}
        {editing && (
          <Card className="border-primary">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{editing === "new" ? "Novo Equipamento" : "Editar Equipamento"}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-muted-foreground">Código</label>
                  <input
                    value={form.codigo}
                    onChange={(e) => setForm({ ...form, codigo: e.target.value })}
                    className="w-full h-9 px-3 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="EQ-011"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-muted-foreground">Descrição</label>
                  <input
                    value={form.descricao}
                    onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                    className="w-full h-9 px-3 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="Nome do equipamento"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-muted-foreground">Valor de Custo (R$)</label>
                  <input
                    value={form.valor_custo}
                    onChange={(e) => setForm({ ...form, valor_custo: e.target.value })}
                    className="w-full h-9 px-3 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring text-right"
                    placeholder="100000"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-muted-foreground">Valor de Venda (R$)</label>
                  <input
                    value={form.valor_venda}
                    onChange={(e) => setForm({ ...form, valor_venda: e.target.value })}
                    className="w-full h-9 px-3 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring text-right"
                    placeholder="200000"
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Salvar
                </Button>
                <Button size="sm" variant="outline" onClick={cancelEdit} className="gap-1">
                  <X className="w-4 h-4" /> Cancelar
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* List */}
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : equipamentos.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">Nenhum equipamento cadastrado.</p>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 text-muted-foreground">
                  <th className="text-left p-3 font-medium">Código</th>
                  <th className="text-left p-3 font-medium">Descrição</th>
                  <th className="text-right p-3 font-medium">Valor Custo</th>
                  <th className="text-right p-3 font-medium">Valor Venda</th>
                  <th className="text-center p-3 font-medium">Status</th>
                  <th className="p-3 w-24"></th>
                </tr>
              </thead>
              <tbody>
                {equipamentos.map((eq) => (
                  <tr key={eq.id} className={`border-t transition-colors ${eq.ativo ? "hover:bg-muted/30" : "opacity-50"}`}>
                    <td className="p-3 font-medium">{eq.codigo}</td>
                    <td className="p-3 text-muted-foreground">{eq.descricao}</td>
                    <td className="p-3 text-right font-semibold">{formatBRL(Number(eq.valor_custo))}</td>
                    <td className="p-3 text-right font-semibold text-primary">
                      {eq.valor_venda != null ? formatBRL(Number(eq.valor_venda)) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="p-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${eq.ativo ? "bg-green-100 text-green-800" : "bg-muted text-muted-foreground"}`}>
                        {eq.ativo ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(eq)} title="Editar">
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleAtivo(eq)} title={eq.ativo ? "Desativar" : "Ativar"}>
                          {eq.ativo ? <PowerOff className="w-3.5 h-3.5 text-destructive" /> : <Power className="w-3.5 h-3.5 text-primary" />}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
