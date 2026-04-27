import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Stage, Layer, Rect, Line, Image as KonvaImage, Group, Text } from "react-konva";
import useImage from "use-image";
import jsPDF from "jspdf";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  ArrowLeft, Save, Loader2, Trash2, RotateCw, Plus, ImageIcon,
  Download, Box, Search, ZoomIn, ZoomOut, Maximize2,
} from "lucide-react";
import AppHeader from "@/components/AppHeader";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  LayoutItemRow, LayoutRow, listLayoutItems, snap, clampPos,
  PISO_MIN_MM, PISO_MAX_MM, SNAP_MM,
} from "@/lib/layouts";
import type { Equipamento } from "@/lib/equipamentos";
import { CATEGORIAS } from "@/lib/equipamentos";

const GRID_MM = 500;
const PLANTAS_BUCKET = "plantas-cliente";

/* ---------- Equipamento renderizado no canvas ---------- */
function EquipamentoNode({
  item,
  selected,
  onSelect,
  onDragEnd,
  onDblClick,
  pisoW,
  pisoH,
}: {
  item: LayoutItemRow;
  selected: boolean;
  onSelect: () => void;
  onDragEnd: (x: number, y: number) => void;
  onDblClick: () => void;
  pisoW: number;
  pisoH: number;
}) {
  const w = item.largura_mm ?? 1000;
  const h = item.comprimento_mm ?? 1000;
  const [img] = useImage(item.imagem_url ?? "", "anonymous");
  const cor = item.cor_categoria || "hsl(var(--muted-foreground))";

  return (
    <Group
      x={item.pos_x_mm}
      y={item.pos_y_mm}
      rotation={item.rotacao}
      offsetX={w / 2}
      offsetY={h / 2}
      draggable
      onClick={onSelect}
      onTap={onSelect}
      onDblClick={onDblClick}
      onDblTap={onDblClick}
      onDragEnd={(e) => {
        const rawX = e.target.x();
        const rawY = e.target.y();
        const snappedX = snap(rawX);
        const snappedY = snap(rawY);
        const { x, y } = clampPos(snappedX, snappedY, w, h, pisoW, pisoH, item.rotacao);
        e.target.x(x);
        e.target.y(y);
        onDragEnd(x, y);
      }}
    >
      {img ? (
        <KonvaImage image={img} width={w} height={h} />
      ) : (
        <Rect width={w} height={h} fill={cor} opacity={0.85} cornerRadius={50} />
      )}
      {!img && (
        <Text
          text={item.codigo}
          width={w}
          height={h}
          fontSize={Math.min(w, h) * 0.18}
          fill="#fff"
          align="center"
          verticalAlign="middle"
          listening={false}
        />
      )}
      {selected && (
        <Rect
          width={w}
          height={h}
          stroke="#1D9E75"
          strokeWidth={60}
          dash={[120, 80]}
          listening={false}
        />
      )}
    </Group>
  );
}

/* ---------- Background grid (mm) ---------- */
function GridBackground({ pisoW, pisoH }: { pisoW: number; pisoH: number }) {
  const lines: JSX.Element[] = [];
  for (let x = 0; x <= pisoW; x += GRID_MM) {
    lines.push(<Line key={`v${x}`} points={[x, 0, x, pisoH]} stroke="rgba(0,0,0,0.06)" strokeWidth={20} />);
  }
  for (let y = 0; y <= pisoH; y += GRID_MM) {
    lines.push(<Line key={`h${y}`} points={[0, y, pisoW, y]} stroke="rgba(0,0,0,0.06)" strokeWidth={20} />);
  }
  return <>{lines}</>;
}

/* ---------- Página ---------- */
export default function LayoutEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<any>(null);

  const [layout, setLayout] = useState<LayoutRow | null>(null);
  const [items, setItems] = useState<LayoutItemRow[]>([]);
  const [equipamentos, setEquipamentos] = useState<Equipamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [containerSize, setContainerSize] = useState({ w: 800, h: 600 });
  const [pisoBgImg] = useImage(layout?.piso_imagem_url ?? "", "anonymous");

  /* ---- carregar tudo ---- */
  const refreshItems = useCallback(async () => {
    if (!id) return;
    setItems(await listLayoutItems(id));
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
      setLoading(false);
    })();
  }, [id, navigate, refreshItems, toast]);

  /* ---- responsive container ---- */
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setContainerSize({ w: r.width, h: r.height });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const scale = useMemo(() => {
    if (!layout) return 0.05;
    const sx = containerSize.w / layout.piso_largura_mm;
    const sy = containerSize.h / layout.piso_comprimento_mm;
    return Math.min(sx, sy) * 0.95;
  }, [layout, containerSize]);

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
    if (patch.rotacao !== undefined) dbPatch.rotacao = patch.rotacao;
    if (patch.ordem !== undefined) dbPatch.ordem = patch.ordem;
    const { error } = await supabase.from("layout_equipamentos").update(dbPatch).eq("id", itemId);
    if (error) toast({ title: "Erro ao salvar item", description: error.message, variant: "destructive" });
  }

  async function handleDragEnd(itemId: string, x: number, y: number) {
    setItems((cur) => cur.map((i) => (i.item_id === itemId ? { ...i, pos_x_mm: x, pos_y_mm: y } : i)));
    await persistItem(itemId, { pos_x_mm: x, pos_y_mm: y });
  }

  async function rotateSelected() {
    if (!selectedId || !layout) return;
    const item = items.find((i) => i.item_id === selectedId);
    if (!item) return;
    const newRot = (((item.rotacao + 90) % 360) as 0 | 90 | 180 | 270);
    const w = item.largura_mm ?? 1000;
    const h = item.comprimento_mm ?? 1000;
    const { x, y } = clampPos(item.pos_x_mm, item.pos_y_mm, w, h, layout.piso_largura_mm, layout.piso_comprimento_mm, newRot);
    setItems((cur) => cur.map((i) => (i.item_id === selectedId ? { ...i, rotacao: newRot, pos_x_mm: x, pos_y_mm: y } : i)));
    await persistItem(selectedId, { rotacao: newRot, pos_x_mm: x, pos_y_mm: y });
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
    if (!stageRef.current || !layout) return;
    const dataUrl = stageRef.current.toDataURL({ pixelRatio: 3 });
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
            <div ref={containerRef} className="w-full h-full bg-[#F5F5F0]">
              {containerSize.w > 0 && (
                <Stage
                  ref={stageRef}
                  width={containerSize.w}
                  height={containerSize.h}
                  scaleX={scale}
                  scaleY={scale}
                  x={(containerSize.w - layout.piso_largura_mm * scale) / 2}
                  y={(containerSize.h - layout.piso_comprimento_mm * scale) / 2}
                  onMouseDown={(e) => {
                    // clique fora desseleciona
                    if (e.target === e.target.getStage()) setSelectedId(null);
                  }}
                >
                  <Layer>
                    {/* fundo do piso */}
                    <Rect width={layout.piso_largura_mm} height={layout.piso_comprimento_mm} fill="#FAFAF7" />
                    {/* planta cliente */}
                    {pisoBgImg && (
                      <KonvaImage
                        image={pisoBgImg}
                        width={layout.piso_largura_mm}
                        height={layout.piso_comprimento_mm}
                        opacity={layout.piso_imagem_opacidade}
                        listening={false}
                      />
                    )}
                    <GridBackground pisoW={layout.piso_largura_mm} pisoH={layout.piso_comprimento_mm} />
                    {/* borda do piso */}
                    <Rect
                      width={layout.piso_largura_mm}
                      height={layout.piso_comprimento_mm}
                      stroke="#888"
                      strokeWidth={40}
                      dash={[300, 200]}
                      listening={false}
                    />
                    {/* equipamentos */}
                    {items.map((it) => (
                      <EquipamentoNode
                        key={it.item_id}
                        item={it}
                        selected={selectedId === it.item_id}
                        onSelect={() => setSelectedId(it.item_id)}
                        onDragEnd={(x, y) => handleDragEnd(it.item_id, x, y)}
                        onDblClick={() => { setSelectedId(it.item_id); rotateSelected(); }}
                        pisoW={layout.piso_largura_mm}
                        pisoH={layout.piso_comprimento_mm}
                      />
                    ))}
                  </Layer>
                </Stage>
              )}

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
