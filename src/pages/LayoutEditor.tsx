import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import jsPDF from "jspdf";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  ArrowLeft, Save, Loader2, Trash2, RotateCw, Plus, ImageIcon,
  Download, Box, Search, Move3d, ArrowUpDown, Link as LinkIcon,
} from "lucide-react";
import AppHeader from "@/components/AppHeader";
import { Layout3DCanvas } from "@/components/Layout3DCanvas";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  LayoutItemRow, LayoutRow, ConexaoRow, listLayoutItems,
  PISO_MIN_MM, PISO_MAX_MM, SNAP_MM,
} from "@/lib/layouts";
import type { Equipamento } from "@/lib/equipamentos";
import { CATEGORIAS } from "@/lib/equipamentos";

const PLANTAS_BUCKET = "plantas-cliente";



/* ---------- Página ---------- */
export default function LayoutEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const containerRef = useRef<HTMLDivElement>(null);

  const [layout, setLayout] = useState<LayoutRow | null>(null);
  const [items, setItems] = useState<LayoutItemRow[]>([]);
  const [equipamentos, setEquipamentos] = useState<Equipamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [transformMode, setTransformMode] = useState<"translate" | "rotate" | "connect">("translate");
  const [alturaLiberada, setAlturaLiberada] = useState(false);
  const [conexoes, setConexoes] = useState<ConexaoRow[]>([]);
  const [conexaoPontoTemp, setConexaoPontoTemp] = useState<{ itemId: string; x: number; y: number; z: number } | null>(null);
  const [selectedConexaoId, setSelectedConexaoId] = useState<string | null>(null);

  /* ---- carregar tudo ---- */
  const refreshItems = useCallback(async () => {
    if (!id) return;
    setItems(await listLayoutItems(id));
  }, [id]);

  const refreshConexoes = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase.from("layout_conexoes").select("*").eq("layout_id", id);
    setConexoes((data as ConexaoRow[]) || []);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      const [{ data: lay }, eqRes] = await Promise.all([
        supabase.from("layouts").select("*").eq("id", id).maybeSingle(),
        supabase.from("equipamentos").select("*").eq("ativo", true).order("codigo"),
      ]);
      if (!lay) {
        toast({ title: "Layout não encontrado", variant: "destructive" });
        navigate("/layouts");
        return;
      }
      setLayout(lay as LayoutRow);
      setEquipamentos((eqRes.data ?? []) as Equipamento[]);
      await refreshItems();
      await refreshConexoes();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);




  /* ---- atalhos teclado ---- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!selectedId) return;
      const tgt = e.target as HTMLElement;
      if (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA") return;
      if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        rotateSelected();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        removeSelected();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, items]);

  /* ---- ações ---- */
  async function persistItem(itemId: string, patch: Partial<LayoutItemRow>) {
    const dbPatch: Record<string, unknown> = {};
    if (patch.pos_x_mm !== undefined) dbPatch.pos_x_mm = patch.pos_x_mm;
    if (patch.pos_y_mm !== undefined) dbPatch.pos_y_mm = patch.pos_y_mm;
    if ((patch as { pos_z_mm?: number }).pos_z_mm !== undefined) dbPatch.pos_z_mm = (patch as { pos_z_mm?: number }).pos_z_mm;
    if (patch.rotacao !== undefined) dbPatch.rotacao = patch.rotacao;
    if (patch.ordem !== undefined) dbPatch.ordem = patch.ordem;
    const { error } = await supabase.from("layout_equipamentos").update(dbPatch).eq("id", itemId);
    if (error) toast({ title: "Erro ao salvar item", description: error.message, variant: "destructive" });
  }

  async function handleTransform(itemId: string, posXmm: number, posYmm: number, posZmm: number, rotacaoDeg: number) {
    const rotInt = ((Math.round(rotacaoDeg / 90) * 90) % 360) as 0 | 90 | 180 | 270;
    setItems((cur) => cur.map((i) => (i.item_id === itemId ? { ...i, pos_x_mm: posXmm, pos_y_mm: posYmm, pos_z_mm: posZmm, rotacao: rotInt } : i)));
    await persistItem(itemId, { pos_x_mm: posXmm, pos_y_mm: posYmm, pos_z_mm: posZmm, rotacao: rotInt } as Partial<LayoutItemRow>);
  }

  async function rotateSelected() {
    if (!selectedId) return;
    const item = items.find((i) => i.item_id === selectedId);
    if (!item) return;
    const newRot = (((item.rotacao + 90) % 360) as 0 | 90 | 180 | 270);
    setItems((cur) => cur.map((i) => (i.item_id === selectedId ? { ...i, rotacao: newRot } : i)));
    await persistItem(selectedId, { rotacao: newRot });
  }

  async function removeSelected() {
    if (!selectedId) return;
    const { error } = await supabase.from("layout_equipamentos").delete().eq("id", selectedId);
    if (error) {
      toast({ title: "Erro ao remover", description: error.message, variant: "destructive" });
      return;
    }
    setItems((cur) => cur.filter((i) => i.item_id !== selectedId));
    setSelectedId(null);
  }

  async function addEquipamento(eq: Equipamento) {
    if (!layout) return;
    if (!eq.largura_mm || !eq.comprimento_mm) {
      toast({
        title: "Dimensões obrigatórias",
        description: "Cadastre largura e comprimento no Catálogo antes de adicionar ao layout.",
        variant: "destructive",
      });
      return;
    }
    const ordem = items.length;
    const x = Math.min(layout.piso_largura_mm / 2, eq.largura_mm / 2 + 1000);
    const y = Math.min(layout.piso_comprimento_mm / 2, eq.comprimento_mm / 2 + 1000);
    const { data, error } = await supabase
      .from("layout_equipamentos")
      .insert({ layout_id: layout.id, equipamento_id: eq.id, pos_x_mm: x, pos_y_mm: y, ordem })
      .select("id")
      .maybeSingle();
    if (error || !data) {
      toast({ title: "Erro ao adicionar", description: error?.message, variant: "destructive" });
      return;
    }
    await refreshItems();
    setSelectedId(data.id);
  }

  async function updateLayoutMeta(patch: Partial<LayoutRow>) {
    if (!layout) return;
    setLayout({ ...layout, ...patch });
    const dbPatch: Record<string, unknown> = {};
    if (patch.cliente !== undefined) dbPatch.cliente = patch.cliente;
    if (patch.cidade !== undefined) dbPatch.cidade = patch.cidade;
    if (patch.unidade !== undefined) dbPatch.unidade = patch.unidade;
    if (patch.revisao !== undefined) dbPatch.revisao = patch.revisao;
    if (patch.status !== undefined) dbPatch.status = patch.status;
    if (patch.piso_largura_mm !== undefined) dbPatch.piso_largura_mm = patch.piso_largura_mm;
    if (patch.piso_comprimento_mm !== undefined) dbPatch.piso_comprimento_mm = patch.piso_comprimento_mm;
    if (patch.piso_imagem_url !== undefined) dbPatch.piso_imagem_url = patch.piso_imagem_url;
    if (patch.piso_imagem_opacidade !== undefined) dbPatch.piso_imagem_opacidade = patch.piso_imagem_opacidade;
    if (patch.observacoes !== undefined) dbPatch.observacoes = patch.observacoes;
    await supabase.from("layouts").update(dbPatch).eq("id", layout.id);
  }

  async function uploadPlanta(file: File) {
    if (!layout) return;
    if (file.size > 8 * 1024 * 1024) {
      toast({ title: "Imagem muito grande", description: "Máx. 8MB.", variant: "destructive" });
      return;
    }
    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const path = `${layout.id}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from(PLANTAS_BUCKET).upload(path, file, { contentType: file.type });
    if (error) {
      toast({ title: "Erro no upload", description: error.message, variant: "destructive" });
      return;
    }
    const { data } = supabase.storage.from(PLANTAS_BUCKET).getPublicUrl(path);
    await updateLayoutMeta({ piso_imagem_url: data.publicUrl });
    toast({ title: "Planta enviada" });
  }

  async function handleSalvarTudo() {
    setSaving(true);
    // updateLayoutMeta já persiste cada mudança; aqui só damos feedback
    setTimeout(() => {
      setSaving(false);
      toast({ title: "Layout salvo" });
    }, 300);
  }

  /* ---- exportar PDF ---- */
  async function handleExportPdf() {
    if (!layout) return;
    const canvas = containerRef.current?.querySelector("canvas") as HTMLCanvasElement | null;
    if (!canvas) {
      toast({ title: "Canvas 3D não encontrado", variant: "destructive" });
      return;
    }
    let dataUrl: string;
    try {
      dataUrl = canvas.toDataURL("image/png");
    } catch (err) {
      console.error("[PDF] toDataURL falhou:", err);
      toast({
        title: "Não foi possível gerar o PDF",
        description: "Falha ao capturar imagem do canvas 3D.",
        variant: "destructive",
      });
      return;
    }
    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a3" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();

    // Cabeçalho
    pdf.setFontSize(16);
    pdf.setFont("helvetica", "bold");
    pdf.text("LS DO BRASIL — FOLHA DE LAYOUT", 15, 15);
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "normal");
    const meta = [
      `Cliente: ${layout.cliente || "—"}`,
      `Cidade: ${layout.cidade || "—"}`,
      `Unidade: ${layout.unidade || "—"}`,
      `Revisão: ${layout.revisao}`,
      `Data: ${new Date().toLocaleDateString("pt-BR")}`,
    ].join("    ");
    pdf.text(meta, 15, 22);

    // Vista em planta
    const drawAreaY = 30;
    const drawAreaH = pageH - drawAreaY - 20;
    const ratio = layout.piso_largura_mm / layout.piso_comprimento_mm;
    let imgW = pageW - 30;
    let imgH = imgW / ratio;
    if (imgH > drawAreaH) {
      imgH = drawAreaH;
      imgW = imgH * ratio;
    }
    const imgX = (pageW - imgW) / 2;
    pdf.addImage(dataUrl, "PNG", imgX, drawAreaY, imgW, imgH);

    pdf.setFontSize(8);
    pdf.text(
      `Escala aprox. 1:${Math.round(layout.piso_largura_mm / imgW)} · Piso ${(layout.piso_largura_mm / 1000).toFixed(1)}m × ${(layout.piso_comprimento_mm / 1000).toFixed(1)}m`,
      15,
      pageH - 10,
    );
    pdf.text("LS do Brasil — Maringá/PR", pageW - 60, pageH - 10);

    // Página 2: lista de equipamentos
    pdf.addPage();
    pdf.setFontSize(14);
    pdf.setFont("helvetica", "bold");
    pdf.text("Equipamentos do Layout", 15, 15);

    const grouped = new Map<string, { codigo: string; nome: string; dim: string; qtd: number }>();
    for (const it of items) {
      const key = it.equipamento_id;
      const dim = `${it.largura_mm ?? "?"} × ${it.comprimento_mm ?? "?"} mm`;
      if (grouped.has(key)) {
        grouped.get(key)!.qtd += 1;
      } else {
        grouped.set(key, { codigo: it.codigo, nome: it.nome, dim, qtd: 1 });
      }
    }
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "bold");
    pdf.text("#", 15, 25);
    pdf.text("Código", 25, 25);
    pdf.text("Equipamento", 60, 25);
    pdf.text("Dimensão", 200, 25);
    pdf.text("Qtd", 270, 25);
    pdf.line(15, 27, pageW - 15, 27);
    pdf.setFont("helvetica", "normal");
    let y = 33;
    let n = 1;
    for (const g of grouped.values()) {
      pdf.text(String(n), 15, y);
      pdf.text(g.codigo, 25, y);
      pdf.text(g.nome.slice(0, 60), 60, y);
      pdf.text(g.dim, 200, y);
      pdf.text(String(g.qtd), 270, y);
      y += 6;
      n += 1;
      if (y > pageH - 15) {
        pdf.addPage();
        y = 15;
      }
    }

    pdf.setFontSize(8);
    pdf.text("LS do Brasil — Maringá/PR", pageW - 60, pageH - 10);

    const fname = `LAYOUT_${(layout.cliente || "cliente").replace(/[^\w]+/g, "_")}_${layout.revisao}_${new Date().toISOString().slice(0, 10)}.pdf`;
    pdf.save(fname);
  }

  /* ---- render ---- */
  if (loading || !layout) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const selectedItem = items.find((i) => i.item_id === selectedId) || null;
  const equipamentosFiltrados = equipamentos.filter((eq) => {
    const q = busca.trim().toLowerCase();
    if (!q) return true;
    return eq.codigo.toLowerCase().includes(q) || eq.descricao.toLowerCase().includes(q);
  });

  // Equipamentos do layout (Aba 1)
  return (
    <div className="h-screen flex flex-col bg-muted/20">
      {/* header */}
      <header className="bg-background border-b shrink-0">
        <div className="max-w-full px-4 py-2 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <Button variant="ghost" size="sm" onClick={() => navigate("/layouts")} className="gap-1 shrink-0">
              <ArrowLeft className="w-4 h-4" /> Voltar
            </Button>
            <div className="min-w-0">
              <input
                value={layout.cliente ?? ""}
                onChange={(e) => updateLayoutMeta({ cliente: e.target.value })}
                placeholder="Cliente"
                className="font-semibold bg-transparent outline-none border-b border-transparent hover:border-border focus:border-primary transition-colors w-48"
              />
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <input
                  value={layout.unidade ?? ""}
                  onChange={(e) => updateLayoutMeta({ unidade: e.target.value })}
                  placeholder="Unidade"
                  className="bg-transparent outline-none border-b border-transparent hover:border-border focus:border-primary transition-colors w-24"
                />
                <span>·</span>
                <input
                  value={layout.cidade ?? ""}
                  onChange={(e) => updateLayoutMeta({ cidade: e.target.value })}
                  placeholder="Cidade"
                  className="bg-transparent outline-none border-b border-transparent hover:border-border focus:border-primary transition-colors w-24"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={layout.revisao}
              onChange={(e) => updateLayoutMeta({ revisao: e.target.value })}
              className="h-8 px-2 rounded-md border bg-background text-sm"
            >
              {["R00", "R01", "R02", "R03", "R04", "R05"].map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <select
              value={layout.status}
              onChange={(e) => updateLayoutMeta({ status: e.target.value as LayoutRow["status"] })}
              className="h-8 px-2 rounded-md border bg-background text-sm"
            >
              <option value="rascunho">Rascunho</option>
              <option value="aprovado">Aprovado</option>
              <option value="arquivado">Arquivado</option>
            </select>
            <Button size="sm" onClick={handleSalvarTudo} disabled={saving} className="gap-1">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar
            </Button>
            <Button size="sm" variant="outline" onClick={handleExportPdf} className="gap-1">
              <Download className="w-4 h-4" /> PDF
            </Button>
            <AppHeader />
          </div>
        </div>
      </header>

      {/* corpo */}
      <div className="flex-1 flex min-h-0">
        {/* canvas */}
        <div className="flex-1 p-3 min-w-0">
          <Card className="h-full overflow-hidden relative">
            <div ref={containerRef} className="w-full h-full bg-muted/30">
              {layout && (
                <Layout3DCanvas
                  items={items}
                  pisoLarguraMm={layout.piso_largura_mm}
                  pisoComprimentoMm={layout.piso_comprimento_mm}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  onTransform={handleTransform}
                  mode={transformMode}
                  alturaLiberada={alturaLiberada}
                />
              )}

              {/* Modo de transformação */}
              <div className="absolute top-3 right-3 bg-background/95 border rounded-lg shadow-md flex items-center gap-1 p-1 z-10">
                <Button
                  size="sm"
                  variant={transformMode === "translate" ? "default" : "ghost"}
                  onClick={() => setTransformMode("translate")}
                  className="h-7 gap-1"
                >
                  <Move3d className="w-3.5 h-3.5" />
                  <span className="text-xs">Mover</span>
                </Button>
                <Button
                  size="sm"
                  variant={transformMode === "rotate" ? "default" : "ghost"}
                  onClick={() => setTransformMode("rotate")}
                  className="h-7 gap-1"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span className="text-xs">Rotacionar</span>
                </Button>
                <Button
                  size="sm"
                  variant={alturaLiberada ? "default" : "ghost"}
                  onClick={() => setAlturaLiberada((v) => !v)}
                  className="h-7 gap-1"
                  title={alturaLiberada ? "Altura liberada — equipamento pode flutuar" : "Altura travada — equipamento fica no chão"}
                >
                  <ArrowUpDown className="w-3.5 h-3.5" />
                  <span className="text-xs">{alturaLiberada ? "Y liberado" : "Y travado"}</span>
                </Button>
              </div>

              {/* HUD ações sobre o item selecionado */}
              {selectedItem && (
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-background border rounded-lg shadow-md px-2 py-1 flex items-center gap-1">
                  <span className="text-xs text-muted-foreground px-2">{selectedItem.codigo} · {selectedItem.nome}</span>
                  <Button size="sm" variant="ghost" className="h-7 gap-1" onClick={rotateSelected} title="Rotacionar (R)">
                    <RotateCw className="w-3.5 h-3.5" /> 90°
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 gap-1 text-destructive" onClick={removeSelected} title="Remover (Del)">
                    <Trash2 className="w-3.5 h-3.5" /> Remover
                  </Button>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* painel lateral */}
        <aside className="w-[340px] shrink-0 border-l bg-background overflow-y-auto">
          <Tabs defaultValue="items" className="w-full">
            <TabsList className="w-full justify-start rounded-none h-10 bg-transparent border-b">
              <TabsTrigger value="items" className="text-xs">Equipamentos ({items.length})</TabsTrigger>
              <TabsTrigger value="catalog" className="text-xs">Catálogo</TabsTrigger>
              <TabsTrigger value="floor" className="text-xs">Piso</TabsTrigger>
            </TabsList>

            {/* Aba 1 */}
            <TabsContent value="items" className="p-3 space-y-2 m-0">
              {items.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Nenhum equipamento. Adicione pela aba Catálogo.</p>
              ) : items.map((it) => (
                <button
                  key={it.item_id}
                  onClick={() => setSelectedId(it.item_id)}
                  className={`w-full text-left p-2 rounded-md border transition-colors ${selectedId === it.item_id ? "bg-primary/10 border-primary" : "hover:bg-muted/50"}`}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded bg-muted/40 flex items-center justify-center overflow-hidden shrink-0">
                      {it.imagem_url ? <img src={it.imagem_url} alt="" className="w-full h-full object-contain" /> : <Box className="w-4 h-4 text-muted-foreground" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{it.codigo}</div>
                      <div className="text-xs text-muted-foreground truncate">{it.nome}</div>
                      <div className="text-xs text-muted-foreground">
                        {Math.round(it.pos_x_mm)}, {Math.round(it.pos_y_mm)} mm · {it.rotacao}°
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </TabsContent>

            {/* Aba 2 */}
            <TabsContent value="catalog" className="p-3 space-y-3 m-0">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar equipamento..."
                  className="w-full h-9 pl-9 pr-3 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              {CATEGORIAS.map((cat) => {
                const lista = equipamentosFiltrados.filter((e) => e.categoria === cat.value);
                if (lista.length === 0) return null;
                return (
                  <div key={cat.value}>
                    <div className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: cat.cor }}>
                      {cat.label} ({lista.length})
                    </div>
                    <div className="space-y-1">
                      {lista.map((eq) => (
                        <button
                          key={eq.id}
                          onClick={() => addEquipamento(eq)}
                          className="w-full text-left p-2 rounded-md border hover:bg-muted/50 transition-colors flex items-center gap-2"
                          title="Adicionar ao layout"
                        >
                          <div className="w-8 h-8 rounded bg-muted/40 flex items-center justify-center overflow-hidden shrink-0">
                            {eq.imagem_url ? <img src={eq.imagem_url} alt="" className="w-full h-full object-contain" /> : <ImageIcon className="w-3.5 h-3.5 text-muted-foreground" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-medium truncate">{eq.codigo}</div>
                            <div className="text-xs text-muted-foreground truncate">{eq.descricao}</div>
                          </div>
                          <Plus className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
              {equipamentosFiltrados.filter((e) => !e.categoria).length > 0 && (
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide mb-1 text-muted-foreground">Sem categoria</div>
                  {equipamentosFiltrados.filter((e) => !e.categoria).map((eq) => (
                    <button
                      key={eq.id}
                      onClick={() => addEquipamento(eq)}
                      className="w-full text-left p-2 rounded-md border hover:bg-muted/50 transition-colors flex items-center gap-2"
                    >
                      <div className="w-8 h-8 rounded bg-muted/40 flex items-center justify-center overflow-hidden shrink-0">
                        {eq.imagem_url ? <img src={eq.imagem_url} alt="" className="w-full h-full object-contain" /> : <ImageIcon className="w-3.5 h-3.5 text-muted-foreground" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium truncate">{eq.codigo}</div>
                        <div className="text-xs text-muted-foreground truncate">{eq.descricao}</div>
                      </div>
                      <Plus className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Aba 3 */}
            <TabsContent value="floor" className="p-3 space-y-4 m-0">
              <div className="space-y-2">
                <Label>Largura do piso: {(layout.piso_largura_mm / 1000).toFixed(1)} m</Label>
                <Slider
                  value={[layout.piso_largura_mm]}
                  min={PISO_MIN_MM}
                  max={PISO_MAX_MM}
                  step={SNAP_MM}
                  onValueChange={(v) => updateLayoutMeta({ piso_largura_mm: v[0] })}
                />
              </div>
              <div className="space-y-2">
                <Label>Comprimento do piso: {(layout.piso_comprimento_mm / 1000).toFixed(1)} m</Label>
                <Slider
                  value={[layout.piso_comprimento_mm]}
                  min={PISO_MIN_MM}
                  max={PISO_MAX_MM}
                  step={SNAP_MM}
                  onValueChange={(v) => updateLayoutMeta({ piso_comprimento_mm: v[0] })}
                />
              </div>

              <div className="space-y-2 pt-2 border-t">
                <Label>Planta do cliente (background)</Label>
                {layout.piso_imagem_url && (
                  <div className="rounded border bg-muted/30 p-2">
                    <img src={layout.piso_imagem_url} alt="Planta" className="w-full h-32 object-contain" />
                    <div className="space-y-1 mt-2">
                      <div className="text-xs text-muted-foreground">Opacidade: {Math.round(layout.piso_imagem_opacidade * 100)}%</div>
                      <Slider
                        value={[layout.piso_imagem_opacidade]}
                        min={0}
                        max={1}
                        step={0.05}
                        onValueChange={(v) => updateLayoutMeta({ piso_imagem_opacidade: v[0] })}
                      />
                    </div>
                    <Button size="sm" variant="ghost" className="w-full mt-2 text-destructive" onClick={() => updateLayoutMeta({ piso_imagem_url: null })}>
                      <Trash2 className="w-3.5 h-3.5 mr-1" /> Remover planta
                    </Button>
                  </div>
                )}
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadPlanta(f); e.currentTarget.value = ""; }}
                />
                <p className="text-xs text-muted-foreground">PNG/JPG até 8MB. A imagem cobre o piso inteiro.</p>
              </div>
            </TabsContent>
          </Tabs>
        </aside>
      </div>
    </div>
  );
}
