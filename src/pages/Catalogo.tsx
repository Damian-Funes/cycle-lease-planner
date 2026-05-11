import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Equipamento, EquipamentoCategoria, CATEGORIAS } from "@/lib/equipamentos";
import { formatBRL } from "@/lib/smartcycle";
import { Plus, Pencil, Power, PowerOff, ArrowLeft, Loader2, Save, X, Search, Box, Upload, FileBox } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";
import { GlbOrientationEditor } from "@/components/GlbOrientationEditor";

const BUCKET_MODELOS = "modelos-3d";
const MAX_GLB_MB = 50;

export default function Catalogo() {
  const [equipamentos, setEquipamentos] = useState<Equipamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({
    codigo: "",
    descricao: "",
    valor_custo: "",
    valor_venda: "",
    modelo_3d_url: "",
    glb_rotacao_x: 0,
    glb_rotacao_z: 0,
    categoria: "" as EquipamentoCategoria | "",
    largura_mm: "",
    comprimento_mm: "",
    altura_mm: "",
  });
  const [modeloFile, setModeloFile] = useState<File | null>(null);
  const [modeloFileName, setModeloFileName] = useState<string>("");
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "success" | "error">("idle");
  const [uploadError, setUploadError] = useState<string>("");
  const [uploadingFileSize, setUploadingFileSize] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<"todos" | "ativos" | "inativos">("todos");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const equipamentosFiltrados = equipamentos.filter((eq) => {
    if (filtroStatus === "ativos" && !eq.ativo) return false;
    if (filtroStatus === "inativos" && eq.ativo) return false;
    const q = busca.trim().toLowerCase();
    if (!q) return true;
    return eq.codigo.toLowerCase().includes(q) || eq.descricao.toLowerCase().includes(q);
  });

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    setLoading(true);
    const { data } = await supabase.from("equipamentos").select("*").order("codigo");
    if (data) setEquipamentos(data as Equipamento[]);
    setLoading(false);
  }

  function resetForm() {
    setForm({
      codigo: "",
      descricao: "",
      valor_custo: "",
      valor_venda: "",
      modelo_3d_url: "",
      glb_rotacao_x: 0,
      glb_rotacao_z: 0,
      categoria: "",
      largura_mm: "",
      comprimento_mm: "",
      altura_mm: "",
    });
    setModeloFile(null);
    setModeloFileName("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    setUploadStatus("idle");
    setUploadError("");
    setUploadingFileSize(0);
  }

  function startNew() {
    setEditing("new");
    resetForm();
  }

  function formatMoneyForInput(n: number | null | undefined): string {
    if (n == null || isNaN(n)) return "";
    // Formata em pt-BR (1.234,56) — compatível com parseMoney
    return n.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function startEdit(eq: Equipamento) {
    setEditing(eq.id);
    setForm({
      codigo: eq.codigo,
      descricao: eq.descricao,
      valor_custo: formatMoneyForInput(eq.valor_custo),
      valor_venda: formatMoneyForInput(eq.valor_venda),
      modelo_3d_url: (eq as any).modelo_3d_url || "",
      categoria: (eq.categoria as EquipamentoCategoria) || "",
      largura_mm: eq.largura_mm != null ? String(eq.largura_mm) : "",
      comprimento_mm: eq.comprimento_mm != null ? String(eq.comprimento_mm) : "",
      altura_mm: eq.altura_mm != null ? String(eq.altura_mm) : "",
    });
    setModeloFile(null);
    setModeloFileName((eq as any).modelo_3d_url ? "Modelo atual" : "");
    setUploadStatus((eq as any).modelo_3d_url ? "success" : "idle");
    setUploadError("");
    setUploadingFileSize(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function cancelEdit() {
    setEditing(null);
    resetForm();
  }

  function parseMoney(v: string): number | null {
    const s = v.trim();
    if (!s) return null;
    // Caso pt-BR (com vírgula decimal): remove pontos de milhar e troca vírgula por ponto.
    if (s.includes(",")) {
      return parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0;
    }
    // Sem vírgula: se houver um único ponto seguido de 1-2 dígitos no fim, é decimal (ex.: "59448.3").
    if (/^\d+\.\d{1,2}$/.test(s)) {
      return parseFloat(s) || 0;
    }
    // Caso contrário (ex.: "1.234.567" ou "1234567"), pontos são separador de milhar.
    return parseFloat(s.replace(/\./g, "")) || 0;
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const isGlb = file.name.toLowerCase().endsWith(".glb");
    if (!isGlb) {
      toast({ title: "Arquivo inválido", description: "Envie um arquivo .glb (modelo 3D).", variant: "destructive" });
      return;
    }
    if (file.size > MAX_GLB_MB * 1024 * 1024) {
      toast({ title: "Arquivo muito grande", description: `Máx. ${MAX_GLB_MB}MB.`, variant: "destructive" });
      return;
    }

    setModeloFile(file);
    setModeloFileName(file.name);
    setUploadStatus("uploading");
    setUploadError("");
    setUploadingFileSize(file.size);

    try {
      const safeCodigo = (form.codigo.trim() || "temp").replace(/[^a-zA-Z0-9_-]/g, "_");
      const path = `${safeCodigo}-${Date.now()}.glb`;
      const { error } = await supabase.storage.from(BUCKET_MODELOS).upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: "model/gltf-binary",
      });
      if (error) {
        setUploadStatus("error");
        setUploadError(error.message);
        return;
      }
      const { data } = supabase.storage.from(BUCKET_MODELOS).getPublicUrl(path);
      setForm((f) => ({ ...f, modelo_3d_url: data.publicUrl }));
      setUploadStatus("success");
    } catch (err: any) {
      setUploadStatus("error");
      setUploadError(err?.message || "Erro desconhecido no upload");
    }
  }

  async function handleSave() {
    if (!form.codigo.trim() || !form.descricao.trim() || !form.valor_custo) {
      toast({ title: "Preencha código, descrição e valor de custo", variant: "destructive" });
      return;
    }
    if (uploadStatus === "uploading") {
      toast({ title: "Aguarde", description: "Upload do modelo ainda em andamento.", variant: "destructive" });
      return;
    }
    if (uploadStatus === "error") {
      toast({ title: "Erro no upload", description: "Tente subir o modelo novamente antes de salvar.", variant: "destructive" });
      return;
    }
    setSaving(true);

    const cat = form.categoria || null;
    const corCategoria = cat ? CATEGORIAS.find((c) => c.value === cat)?.cor ?? null : null;
    const toInt = (v: string) => {
      const n = parseInt(v, 10);
      return isNaN(n) ? null : n;
    };
    const row: any = {
      codigo: form.codigo.trim(),
      descricao: form.descricao.trim(),
      valor_custo: parseMoney(form.valor_custo) ?? 0,
      valor_venda: parseMoney(form.valor_venda),
      modelo_3d_url: form.modelo_3d_url || null,
      categoria: cat,
      cor_categoria: corCategoria,
      largura_mm: toInt(form.largura_mm),
      comprimento_mm: toInt(form.comprimento_mm),
      altura_mm: toInt(form.altura_mm),
    };

    if (editing === "new") {
      const { error } = await supabase.from("equipamentos").insert(row);
      if (error) {
        toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
        setSaving(false);
        return;
      }
      toast({ title: "Equipamento adicionado" });
    } else {
      const { error } = await supabase.from("equipamentos").update(row).eq("id", editing!);
      if (error) {
        toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
        setSaving(false);
        return;
      }
      toast({ title: "Equipamento atualizado" });
    }

    setSaving(false);
    setEditing(null);
    resetForm();
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
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por código ou descrição..."
              className="w-full h-10 pl-9 pr-3 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="flex rounded-md border bg-background p-0.5">
            {(["todos", "ativos", "inativos"] as const).map((opt) => (
              <button
                key={opt}
                onClick={() => setFiltroStatus(opt)}
                className={`px-3 h-9 text-sm rounded capitalize transition-colors ${
                  filtroStatus === opt ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        {/* Edit/New form */}
        {editing && (
          <Card className="border-primary">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{editing === "new" ? "Novo Equipamento" : "Editar Equipamento"}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-[120px_1fr] gap-4">
                {/* Upload Modelo 3D */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Modelo 3D (.glb)</label>
                  <div
                    onClick={() => uploadStatus !== "uploading" && fileInputRef.current?.click()}
                    className={`w-[120px] h-[120px] rounded-md border-2 border-dashed flex items-center justify-center overflow-hidden p-2 transition-colors ${
                      uploadStatus === "uploading"
                        ? "border-primary bg-primary/5 cursor-wait"
                        : uploadStatus === "success"
                        ? "border-green-500 bg-green-50 cursor-pointer hover:bg-green-100"
                        : uploadStatus === "error"
                        ? "border-destructive bg-destructive/5 cursor-pointer hover:bg-destructive/10"
                        : "border-border bg-muted/30 cursor-pointer hover:border-primary hover:bg-muted/50"
                    }`}
                  >
                    {uploadStatus === "uploading" ? (
                      <div className="text-center text-foreground">
                        <Loader2 className="w-6 h-6 mx-auto mb-1 animate-spin text-primary" />
                        <span className="text-[10px] leading-tight block">Subindo...</span>
                        <span className="text-[9px] leading-tight block text-muted-foreground">
                          {(uploadingFileSize / (1024 * 1024)).toFixed(1)} MB
                        </span>
                      </div>
                    ) : uploadStatus === "success" && modeloFileName ? (
                      <div className="text-center text-green-700">
                        <FileBox className="w-6 h-6 mx-auto mb-1" />
                        <span className="text-[10px] leading-tight block break-all">{modeloFileName}</span>
                      </div>
                    ) : uploadStatus === "error" ? (
                      <div className="text-center text-destructive p-1">
                        <X className="w-6 h-6 mx-auto mb-1" />
                        <span className="text-[10px] leading-tight block">Erro</span>
                        <span className="text-[9px] leading-tight block">Clique pra tentar</span>
                      </div>
                    ) : (
                      <div className="text-center text-muted-foreground p-2">
                        <Upload className="w-6 h-6 mx-auto mb-1" />
                        <span className="text-xs">Adicionar GLB</span>
                      </div>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".glb,model/gltf-binary"
                    onChange={handleFileChange}
                    className="hidden"
                    disabled={uploadStatus === "uploading"}
                  />
                  {uploadStatus === "uploading" ? (
                    <p className="text-xs text-primary">Aguarde concluir...</p>
                  ) : uploadStatus === "success" ? (
                    <p className="text-xs text-green-600">✓ Modelo carregado</p>
                  ) : uploadStatus === "error" ? (
                    <p className="text-xs text-destructive break-words max-w-[120px]">{uploadError}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">GLB até {MAX_GLB_MB}MB</p>
                  )}
                </div>

                {/* Campos */}
                <div className="grid sm:grid-cols-2 gap-3">
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
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-sm font-medium text-muted-foreground">Categoria (para Layout)</label>
                    <select
                      value={form.categoria}
                      onChange={(e) => setForm({ ...form, categoria: e.target.value as EquipamentoCategoria | "" })}
                      className="w-full h-9 px-3 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="">— Sem categoria —</option>
                      {CATEGORIAS.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-muted-foreground">Largura (mm)</label>
                    <input
                      type="number"
                      min={0}
                      value={form.largura_mm}
                      onChange={(e) => setForm({ ...form, largura_mm: e.target.value })}
                      className="w-full h-9 px-3 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring text-right"
                      placeholder="3000"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-muted-foreground">Comprimento (mm)</label>
                    <input
                      type="number"
                      min={0}
                      value={form.comprimento_mm}
                      onChange={(e) => setForm({ ...form, comprimento_mm: e.target.value })}
                      className="w-full h-9 px-3 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring text-right"
                      placeholder="1500"
                    />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-sm font-medium text-muted-foreground">Altura (mm) — opcional</label>
                    <input
                      type="number"
                      min={0}
                      value={form.altura_mm}
                      onChange={(e) => setForm({ ...form, altura_mm: e.target.value })}
                      className="w-full h-9 px-3 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring text-right"
                      placeholder="1500"
                    />
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                Dimensões e categoria são usadas no <strong>Layout Generator</strong> para renderizar o equipamento em escala.
              </p>
              <div className="flex gap-2 mt-4">
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={saving || uploadStatus === "uploading"}
                  className="gap-1"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {uploadStatus === "uploading" ? "Aguarde upload..." : "Salvar"}
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
        ) : equipamentosFiltrados.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">{busca ? "Nenhum equipamento encontrado." : "Nenhum equipamento cadastrado."}</p>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 text-muted-foreground">
                  <th className="text-left p-3 font-medium w-16">Modelo</th>
                  <th className="text-left p-3 font-medium">Código</th>
                  <th className="text-left p-3 font-medium">Descrição</th>
                  <th className="text-right p-3 font-medium">Valor Custo</th>
                  <th className="text-right p-3 font-medium">Valor Venda</th>
                  <th className="text-center p-3 font-medium">Status</th>
                  <th className="p-3 w-24"></th>
                </tr>
              </thead>
              <tbody>
                {equipamentosFiltrados.map((eq) => (
                  <tr key={eq.id} className={`border-t transition-colors ${eq.ativo ? "hover:bg-muted/30" : "opacity-50"}`}>
                    <td className="p-2">
                      <div
                        className="w-12 h-12 rounded border flex items-center justify-center relative overflow-hidden"
                        style={{
                          backgroundColor: eq.cor_categoria || "#888780",
                          opacity: (eq as any).modelo_3d_url ? 1 : 0.4,
                        }}
                        title={(eq as any).modelo_3d_url ? "Modelo 3D cadastrado" : "Sem modelo 3D"}
                      >
                        <Box className="w-3 h-3 text-white/70 absolute top-1 right-1" />
                        <span className="text-[10px] font-mono font-medium text-white text-center px-0.5 leading-tight break-all">
                          {eq.codigo.slice(0, 8)}
                        </span>
                      </div>
                    </td>
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
