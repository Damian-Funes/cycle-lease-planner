import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { jsPDF } from "jspdf";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  ArrowLeft, Save, Loader2, Trash2, RotateCw, Plus, ImageIcon,
  Download, Box, Search, Move3d, ArrowUpDown, Link as LinkIcon, Layers,
} from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import AppHeader from "@/components/AppHeader";
import { Layout3DCanvas, type Layout3DCanvasApi, type ViewName } from "@/components/Layout3DCanvas";
import PlantaImage from "@/components/PlantaImage";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  LayoutItemRow, LayoutRow, ConexaoRow, listLayoutItems,
  PISO_MIN_MM, PISO_MAX_MM, SNAP_MM,
} from "@/lib/layouts";
import type { Equipamento } from "@/lib/equipamentos";
import { CATEGORIAS } from "@/lib/equipamentos";
import { listContidos, buildPaiParaFilhos, buildFilhoParaPais, calcularOcultos, type ContidoRow } from "@/lib/equipamentoContidos";


const PLANTAS_BUCKET = "plantas-cliente";

/* ---------- Planta cotada (2D puro) ---------- */
function renderPlantaCotada(
  items: LayoutItemRow[],
  pisoW: number,
  pisoH: number,
): string | null {
  try {
    // Resolução de saída
    const PAD = 600; // mm de margem extra para cotas externas
    const totalW = pisoW + PAD * 2;
    const totalH = pisoH + PAD * 2;
    const PX_PER_MM = Math.min(2200 / totalW, 1600 / totalH); // alvo ~A3 paisagem
    const cw = Math.round(totalW * PX_PER_MM);
    const ch = Math.round(totalH * PX_PER_MM);
    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // Fundo branco
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cw, ch);

    // Helpers mm→px (origem do piso no canto sup-esq da área do piso)
    const ox = PAD * PX_PER_MM;
    const oy = PAD * PX_PER_MM;
    const mx = (mm: number) => ox + mm * PX_PER_MM;
    const my = (mm: number) => oy + mm * PX_PER_MM;

    // Piso (cimento polido)
    ctx.fillStyle = "#bfbfbf";
    ctx.fillRect(mx(0), my(0), pisoW * PX_PER_MM, pisoH * PX_PER_MM);
    // Grid 1m
    ctx.strokeStyle = "rgba(0,0,0,0.12)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= pisoW; x += 1000) {
      ctx.beginPath(); ctx.moveTo(mx(x), my(0)); ctx.lineTo(mx(x), my(pisoH)); ctx.stroke();
    }
    for (let y = 0; y <= pisoH; y += 1000) {
      ctx.beginPath(); ctx.moveTo(mx(0), my(y)); ctx.lineTo(mx(pisoW), my(y)); ctx.stroke();
    }
    // Contorno do piso
    ctx.strokeStyle = "#222";
    ctx.lineWidth = 2;
    ctx.strokeRect(mx(0), my(0), pisoW * PX_PER_MM, pisoH * PX_PER_MM);

    // Vértice de origem (canto vermelho)
    ctx.fillStyle = "#dc2626";
    ctx.beginPath(); ctx.arc(mx(0), my(0), 8, 0, Math.PI * 2); ctx.fill();

    // Cotas totais do piso
    const dimColor = "#1e3a8a";
    const drawDimLine = (x1: number, y1: number, x2: number, y2: number, label: string) => {
      ctx.strokeStyle = dimColor;
      ctx.fillStyle = dimColor;
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      // Pequenas setas
      const ang = Math.atan2(y2 - y1, x2 - x1);
      const a = 6;
      const draw = (x: number, y: number, dir: number) => {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - a * Math.cos(dir - 0.4), y - a * Math.sin(dir - 0.4));
        ctx.lineTo(x - a * Math.cos(dir + 0.4), y - a * Math.sin(dir + 0.4));
        ctx.closePath(); ctx.fill();
      };
      draw(x1, y1, ang + Math.PI);
      draw(x2, y2, ang);
      // Label
      ctx.font = "bold 14px Inter, Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const lx = (x1 + x2) / 2;
      const ly = (y1 + y2) / 2;
      const horizontal = Math.abs(x2 - x1) > Math.abs(y2 - y1);
      const padBg = 3;
      const m = ctx.measureText(label);
      const tw = m.width + padBg * 2;
      const th = 18;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(lx - tw / 2, ly - th / 2, tw, th);
      ctx.strokeStyle = dimColor;
      ctx.strokeRect(lx - tw / 2, ly - th / 2, tw, th);
      ctx.fillStyle = dimColor;
      ctx.fillText(label, lx, ly);
    };

    // Cotas totais do piso (em cima e à esquerda, fora do piso)
    const totalOffset = 28;
    drawDimLine(mx(0), my(0) - totalOffset, mx(pisoW), my(0) - totalOffset, `${pisoW} mm`);
    drawDimLine(mx(0) - totalOffset, my(0), mx(0) - totalOffset, my(pisoH), `${pisoH} mm`);

    // Para cada equipamento: desenha bbox e cotas até as 2 paredes mais próximas
    items.forEach((it, idx) => {
      const w = it.largura_mm ?? 800;
      const h = it.comprimento_mm ?? 800;
      const rot = ((it.rotacao ?? 0) * Math.PI) / 180;
      const bbW = Math.abs(w * Math.cos(rot)) + Math.abs(h * Math.sin(rot));
      const bbH = Math.abs(w * Math.sin(rot)) + Math.abs(h * Math.cos(rot));
      const cx = it.pos_x_mm;
      const cy = it.pos_y_mm;
      const left = cx - bbW / 2;
      const right = cx + bbW / 2;
      const top = cy - bbH / 2;
      const bottom = cy + bbH / 2;

      // Retângulo do equipamento
      const fill = it.cor_categoria || "#0F6E56";
      ctx.fillStyle = fill + "cc";
      ctx.strokeStyle = "#111";
      ctx.lineWidth = 1.5;
      ctx.fillRect(mx(left), my(top), bbW * PX_PER_MM, bbH * PX_PER_MM);
      ctx.strokeRect(mx(left), my(top), bbW * PX_PER_MM, bbH * PX_PER_MM);

      // Código/etiqueta
      ctx.fillStyle = "#fff";
      ctx.font = "bold 12px Inter, Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const labelTxt = it.codigo || String(idx + 1);
      ctx.fillText(labelTxt, mx(cx), my(cy));

      // Cota horizontal: parede mais próxima (esq vs dir) até a borda do equipamento
      const dLeft = left;
      const dRight = pisoW - right;
      if (dLeft <= dRight) {
        // cota até esquerda, desenhada na metade vertical do equipamento
        const yMid = my((top + bottom) / 2);
        // Linhas de chamada (extensão fina)
        ctx.strokeStyle = dimColor;
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(mx(0), yMid); ctx.lineTo(mx(left), yMid); ctx.stroke();
        ctx.setLineDash([]);
        drawDimLine(mx(0), yMid, mx(left), yMid, `${Math.round(dLeft)} mm`);
      } else {
        const yMid = my((top + bottom) / 2);
        ctx.strokeStyle = dimColor;
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(mx(right), yMid); ctx.lineTo(mx(pisoW), yMid); ctx.stroke();
        ctx.setLineDash([]);
        drawDimLine(mx(right), yMid, mx(pisoW), yMid, `${Math.round(dRight)} mm`);
      }

      // Cota vertical: parede mais próxima (sup vs inf)
      const dTop = top;
      const dBottom = pisoH - bottom;
      if (dTop <= dBottom) {
        const xMid = mx((left + right) / 2);
        ctx.strokeStyle = dimColor;
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(xMid, my(0)); ctx.lineTo(xMid, my(top)); ctx.stroke();
        ctx.setLineDash([]);
        drawDimLine(xMid, my(0), xMid, my(top), `${Math.round(dTop)} mm`);
      } else {
        const xMid = mx((left + right) / 2);
        ctx.strokeStyle = dimColor;
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(xMid, my(bottom)); ctx.lineTo(xMid, my(pisoH)); ctx.stroke();
        ctx.setLineDash([]);
        drawDimLine(xMid, my(bottom), xMid, my(pisoH), `${Math.round(dBottom)} mm`);
      }
    });

    return canvas.toDataURL("image/png");
  } catch (e) {
    console.error("[renderPlantaCotada] falha:", e);
    return null;
  }
}




/* ---------- Página ---------- */
export default function LayoutEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasApiRef = useRef<Layout3DCanvasApi | null>(null);
  const handleCanvasReady = useCallback((api: Layout3DCanvasApi) => {
    console.log("[Layout3D] API pronta");
    canvasApiRef.current = api;
  }, []);

  const [layout, setLayout] = useState<LayoutRow | null>(null);
  const [items, setItems] = useState<LayoutItemRow[]>([]);
  const [equipamentos, setEquipamentos] = useState<Equipamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busca, setBusca] = useState("");
  const [transformMode, setTransformMode] = useState<"translate" | "rotate" | "connect">("translate");
  const [alturaLiberada, setAlturaLiberada] = useState(false);
  const [conexoes, setConexoes] = useState<ConexaoRow[]>([]);
  const [conexaoPontoTemp, setConexaoPontoTemp] = useState<{ itemId: string; x: number; y: number; z: number } | null>(null);
  const [selectedConexaoId, setSelectedConexaoId] = useState<string | null>(null);
  const [contidosPares, setContidosPares] = useState<ContidoRow[]>([]);
  const [orgInfo, setOrgInfo] = useState<{ nome: string; cidade: string | null } | null>(null);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);

  const handleSelect = useCallback((id: string | null, shift?: boolean) => {
    if (id === null) {
      if (!shift) {
        setSelectedId(null);
        setSelectedIds([]);
      }
      return;
    }
    if (shift) {
      setSelectedIds((cur) => {
        if (cur.includes(id)) {
          const next = cur.filter((x) => x !== id);
          setSelectedId(next[next.length - 1] ?? null);
          return next;
        }
        const next = [...cur, id];
        setSelectedId(id);
        return next;
      });
    } else {
      setSelectedId(id);
      setSelectedIds([id]);
    }
  }, []);

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
      const [{ data: lay }, eqRes, paresRes] = await Promise.all([
        supabase.from("layouts").select("*").eq("id", id).maybeSingle(),
        supabase.from("equipamentos").select("*").eq("ativo", true).order("codigo"),
        listContidos().catch(() => [] as ContidoRow[]),
      ]);
      if (!lay) {
        toast({ title: "Layout não encontrado", variant: "destructive" });
        navigate("/layouts");
        return;
      }
      setLayout(lay as LayoutRow);
      setEquipamentos((eqRes.data ?? []) as Equipamento[]);
      setContidosPares(paresRes as ContidoRow[]);
      await refreshItems();
      await refreshConexoes();
      const orgId = (lay as any).organizacao_id as string | null;
      if (orgId) {
        const { data: org } = await supabase.from("organizacoes").select("nome, cidade").eq("id", orgId).maybeSingle();
        if (org) setOrgInfo({ nome: (org as any).nome, cidade: (org as any).cidade });
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function salvarComoTemplate(nome: string, mod: string, tipo: string) {
    if (!layout) return;
    try {
      // 1) cria um NOVO layout independente, sem cliente/organização
      const { data: novo, error: errCreate } = await (supabase as any)
        .from("layouts")
        .insert({
          piso_largura_mm: layout.piso_largura_mm,
          piso_comprimento_mm: layout.piso_comprimento_mm,
          modelo_maquina: mod || null,
          tipo_instalacao: tipo || null,
          is_template: true,
          template_nome: nome,
          organizacao_id: null,
          pessoa_id: null,
          cliente: null,
          cidade: null,
          unidade: null,
          observacoes: null,
        })
        .select("id")
        .maybeSingle();
      if (errCreate || !novo) throw errCreate ?? new Error("Falha ao criar template");
      const tplId = novo.id as string;

      // 2) copia equipamentos do layout atual para o template
      const { data: srcItens } = await supabase
        .from("layout_equipamentos")
        .select("id, equipamento_id, pos_x_mm, pos_y_mm, pos_z_mm, rotacao, ordem, rotulo_customizado")
        .eq("layout_id", layout.id)
        .order("ordem");

      let idMap = new Map<string, string>();
      if (srcItens && srcItens.length > 0) {
        const inserts = srcItens.map((it: any) => ({
          layout_id: tplId,
          equipamento_id: it.equipamento_id,
          pos_x_mm: it.pos_x_mm,
          pos_y_mm: it.pos_y_mm,
          pos_z_mm: it.pos_z_mm ?? 0,
          rotacao: it.rotacao,
          ordem: it.ordem,
          rotulo_customizado: it.rotulo_customizado,
        }));
        const { data: ins, error: insErr } = await supabase
          .from("layout_equipamentos")
          .insert(inserts)
          .select("id, ordem");
        if (insErr) throw insErr;
        const byOrdem = new Map((ins ?? []).map((n: any) => [n.ordem, n.id]));
        for (const it of srcItens) {
          const nid = byOrdem.get((it as any).ordem);
          if (nid) idMap.set((it as any).id, nid);
        }
      }

      // 3) copia conexões
      const { data: srcConex } = await supabase
        .from("layout_conexoes")
        .select("*")
        .eq("layout_id", layout.id);

      if (srcConex && srcConex.length > 0) {
        const conexInserts = srcConex
          .map((c: any) => {
            const o = idMap.get(c.item_origem_id);
            const d = idMap.get(c.item_destino_id);
            if (!o || !d) return null;
            const { id: _id, layout_id: _l, item_origem_id: _o, item_destino_id: _d, ...rest } = c;
            return { ...rest, layout_id: tplId, item_origem_id: o, item_destino_id: d };
          })
          .filter(Boolean);
        if (conexInserts.length > 0) {
          await supabase.from("layout_conexoes").insert(conexInserts as any);
        }
      }

      setSaveTemplateOpen(false);
      toast({ title: "Template salvo!", description: "Um padrão independente foi criado a partir deste layout." });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao salvar template";
      toast({ title: msg, variant: "destructive" });
    }
  }






  /* ---- atalhos teclado ---- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement;
      if (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA") return;

      if (e.key === "Escape" && transformMode === "connect") {
        e.preventDefault();
        setTransformMode("translate");
        setConexaoPontoTemp(null);
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedConexaoId) {
        e.preventDefault();
        handleConexaoDelete(selectedConexaoId);
        return;
      }
      if (!selectedId && selectedIds.length === 0) return;
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
  }, [selectedId, selectedIds, items, selectedConexaoId, transformMode]);

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
    // Snap fino de 15° — permite qualquer ângulo no ciclo completo de 360°.
    const rotInt = ((Math.round(rotacaoDeg / 15) * 15) % 360 + 360) % 360;
    setItems((cur) => cur.map((i) => (i.item_id === itemId ? { ...i, pos_x_mm: posXmm, pos_y_mm: posYmm, pos_z_mm: posZmm, rotacao: rotInt } : i)));
    await persistItem(itemId, { pos_x_mm: posXmm, pos_y_mm: posYmm, pos_z_mm: posZmm, rotacao: rotInt } as Partial<LayoutItemRow>);
  }

  async function rotateSelected() {
    const ids = selectedIds.length > 0 ? selectedIds : (selectedId ? [selectedId] : []);
    if (ids.length === 0) return;
    const updates: { id: string; rot: number }[] = [];
    setItems((cur) => cur.map((i) => {
      if (!ids.includes(i.item_id)) return i;
      // Incremento de 15° para permitir percorrer todos os 360°.
      const newRot = ((i.rotacao + 15) % 360 + 360) % 360;
      updates.push({ id: i.item_id, rot: newRot });
      return { ...i, rotacao: newRot };
    }));
    await Promise.all(updates.map((u) => persistItem(u.id, { rotacao: u.rot })));
  }

  async function removeSelected() {
    const ids = selectedIds.length > 0 ? selectedIds : (selectedId ? [selectedId] : []);
    if (ids.length === 0) return;
    const { error } = await supabase.from("layout_equipamentos").delete().in("id", ids);
    if (error) {
      toast({ title: "Erro ao remover", description: error.message, variant: "destructive" });
      return;
    }
    setItems((cur) => cur.filter((i) => !ids.includes(i.item_id)));
    setSelectedId(null);
    setSelectedIds([]);
  }

  async function handleConectarClick(itemId: string, xmm: number, ymm: number, zmm: number) {
    if (!conexaoPontoTemp) {
      setConexaoPontoTemp({ itemId, x: xmm, y: ymm, z: zmm });
      toast({ title: "Ponto A marcado", description: "Agora clique no segundo equipamento." });
      return;
    }
    if (conexaoPontoTemp.itemId === itemId) {
      toast({ title: "Selecione outro equipamento", variant: "destructive" });
      return;
    }

    // ---- Encaixar fisicamente: mover o 2º equipamento para o ponto A coincidir com o ponto B ----
    const itemOrigem = items.find((i) => i.item_id === conexaoPontoTemp.itemId);
    const itemDestino = items.find((i) => i.item_id === itemId);
    if (!itemOrigem || !itemDestino) {
      toast({ title: "Equipamento não encontrado", variant: "destructive" });
      return;
    }
    // Mapeamento mm->world: world.x = pos_x_mm/1000, world.y = pos_z_mm/1000 (altura), world.z = pos_y_mm/1000.
    // Wrapper só tem yaw (rotacao em graus) ao redor de Y.
    const localToWorld = (it: LayoutItemRow, lxMm: number, lyMm: number, lzMm: number) => {
      const rotY = ((it.rotacao ?? 0) * Math.PI) / 180;
      const lx = lxMm / 1000, ly = lyMm / 1000, lz = lzMm / 1000;
      const cos = Math.cos(rotY), sin = Math.sin(rotY);
      const wx = (it.pos_x_mm ?? 0) / 1000 + cos * lx + sin * lz;
      const wy = (it.pos_z_mm ?? 0) / 1000 + ly;
      const wz = (it.pos_y_mm ?? 0) / 1000 - sin * lx + cos * lz;
      return { wx, wy, wz };
    };
    const A = localToWorld(itemOrigem, conexaoPontoTemp.x, conexaoPontoTemp.y, conexaoPontoTemp.z);
    const B = localToWorld(itemDestino, xmm, ymm, zmm);
    const dWx = A.wx - B.wx;
    const dWy = A.wy - B.wy;
    const dWz = A.wz - B.wz;
    const novoPosXmm = Math.round((itemDestino.pos_x_mm ?? 0) + dWx * 1000);
    const novoPosYmm = Math.round((itemDestino.pos_y_mm ?? 0) + dWz * 1000);
    const novoPosZmm = Math.round((itemDestino.pos_z_mm ?? 0) + dWy * 1000);

    setItems((cur) => cur.map((i) => (i.item_id === itemId
      ? { ...i, pos_x_mm: novoPosXmm, pos_y_mm: novoPosYmm, pos_z_mm: novoPosZmm }
      : i)));
    await persistItem(itemId, { pos_x_mm: novoPosXmm, pos_y_mm: novoPosYmm, pos_z_mm: novoPosZmm } as Partial<LayoutItemRow>);

    const nova = {
      layout_id: id!,
      item_origem_id: conexaoPontoTemp.itemId,
      item_destino_id: itemId,
      ponto_origem_x_mm: conexaoPontoTemp.x,
      ponto_origem_y_mm: conexaoPontoTemp.y,
      ponto_origem_z_mm: conexaoPontoTemp.z,
      ponto_destino_x_mm: xmm,
      ponto_destino_y_mm: ymm,
      ponto_destino_z_mm: zmm,
    };
    const { data, error } = await supabase.from("layout_conexoes").insert(nova).select().single();
    if (error) {
      toast({ title: "Erro ao criar conexão", description: error.message, variant: "destructive" });
      return;
    }
    setConexoes((cur) => [...cur, data as ConexaoRow]);
    setConexaoPontoTemp(null);
    toast({ title: "Equipamentos conectados" });
  }

  async function handleConexaoDelete(conexId: string) {
    const { error } = await supabase.from("layout_conexoes").delete().eq("id", conexId);
    if (error) {
      toast({ title: "Erro ao deletar", description: error.message, variant: "destructive" });
      return;
    }
    setConexoes((cur) => cur.filter((c) => c.id !== conexId));
    setSelectedConexaoId(null);
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
    // Bloqueia se este equipamento já é representado por um pai presente no layout.
    const paiParaFilhos = buildPaiParaFilhos(contidosPares);
    const filhoParaPais = buildFilhoParaPais(contidosPares);
    const presentes = new Set(items.map((i) => i.equipamento_id));
    const ocultos = calcularOcultos(presentes, paiParaFilhos);
    if (ocultos.has(eq.id)) {
      const paisIds = Array.from(filhoParaPais.get(eq.id) ?? []);
      const codigosPais = paisIds
        .map((pid) => equipamentos.find((e) => e.id === pid)?.codigo)
        .filter(Boolean)
        .join(", ");
      toast({
        title: "Já representado",
        description: `Este item já está incluso no desenho de ${codigosPais || "outro equipamento"}.`,
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
    setSelectedIds([data.id]);
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
    if ((patch as any).modelo_maquina !== undefined) dbPatch.modelo_maquina = (patch as any).modelo_maquina;
    if ((patch as any).tipo_instalacao !== undefined) dbPatch.tipo_instalacao = (patch as any).tipo_instalacao;
    if ((patch as any).is_template !== undefined) dbPatch.is_template = (patch as any).is_template;
    if ((patch as any).template_nome !== undefined) dbPatch.template_nome = (patch as any).template_nome;
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
    // Bucket privado: armazenamos apenas o path; URL assinada é gerada na renderização.
    await updateLayoutMeta({ piso_imagem_url: path });
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

  /* ---- exportar PDF (com 5 vistas) ---- */
  async function handleExportPdf() {
    console.log("[PDF] iniciando export, layout?", !!layout, "api?", !!canvasApiRef.current);
    if (!layout) {
      toast({ title: "Layout não carregado", variant: "destructive" });
      return;
    }
    const api = canvasApiRef.current;
    if (!api) {
      toast({ title: "Canvas 3D não está pronto ainda", description: "Aguarde os modelos carregarem e tente novamente.", variant: "destructive" });
      return;
    }

    try {

    // Desseleciona para a captura sair limpa (sem transparência)
    const idSelecionadoAntes = selectedId;
    if (idSelecionadoAntes) {
      setSelectedId(null);
      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    }

    const vistas: { view: ViewName; titulo: string }[] = [
      { view: "top",   titulo: "Vista Superior (Planta)" },
      { view: "iso",   titulo: "Vista Isométrica" },
      { view: "front", titulo: "Vista Frontal" },
      { view: "left",  titulo: "Vista Lateral Esquerda" },
      { view: "right", titulo: "Vista Lateral Direita" },
    ];

    const capturas: { view: ViewName; titulo: string; dataUrl: string }[] = [];
    for (const v of vistas) {
      console.log("[PDF] capturando vista:", v.view);
      const url = api.captureView(v.view);
      console.log("[PDF] dataUrl tamanho:", url?.length ?? 0);
      // pequeno respiro para o navegador
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      if (url) capturas.push({ ...v, titulo: v.titulo, dataUrl: url });
      // Após a vista superior, gera uma "planta cotada" 2D
      if (v.view === "top") {
        const cotada = renderPlantaCotada(items, layout.piso_largura_mm, layout.piso_comprimento_mm);
        if (cotada) {
          capturas.push({ view: "top", titulo: "Planta com Cotas (mm)", dataUrl: cotada });
        }
      }
    }

    if (idSelecionadoAntes) setSelectedId(idSelecionadoAntes);
    // Restaura uma vista útil para o usuário após captura
    api.fitAll();

    console.log("[PDF] total capturas:", capturas.length);
    if (capturas.length === 0) {
      toast({
        title: "Não foi possível gerar o PDF",
        description: "Falha ao capturar imagens do canvas 3D.",
        variant: "destructive",
      });
      return;
    }

    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a3" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();

    const drawHeader = (subtitulo: string) => {
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
      pdf.setFontSize(12);
      pdf.setFont("helvetica", "bold");
      pdf.text(subtitulo, 15, 30);
    };

    const drawFooter = () => {
      pdf.setFontSize(8);
      pdf.setFont("helvetica", "normal");
      pdf.text(
        `Piso ${(layout.piso_largura_mm / 1000).toFixed(1)}m × ${(layout.piso_comprimento_mm / 1000).toFixed(1)}m`,
        15,
        pageH - 10,
      );
      pdf.text("LS do Brasil — Maringá/PR", pageW - 60, pageH - 10);
    };

    // Uma página por vista — imagem ocupa o máximo possível, centralizada
    capturas.forEach((cap, idx) => {
      if (idx > 0) pdf.addPage();
      drawHeader(cap.titulo);

      // Área de desenho
      const drawAreaY = 34;
      const drawAreaH = pageH - drawAreaY - 18;
      const drawAreaW = pageW - 30;

      // Aspect ratio do canvas 3D (todas as capturas têm o mesmo tamanho)
      const canvasEl = containerRef.current?.querySelector("canvas") as HTMLCanvasElement | null;
      const ratio = canvasEl && canvasEl.height > 0
        ? canvasEl.width / canvasEl.height
        : drawAreaW / drawAreaH;

      let imgW = drawAreaW;
      let imgH = imgW / ratio;
      if (imgH > drawAreaH) {
        imgH = drawAreaH;
        imgW = imgH * ratio;
      }
      const imgX = (pageW - imgW) / 2;
      const imgY = drawAreaY + (drawAreaH - imgH) / 2; // centraliza verticalmente também
      pdf.addImage(cap.dataUrl, "PNG", imgX, imgY, imgW, imgH);

      drawFooter();
    });

    // Página final: lista de equipamentos
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
      console.log("[PDF] gerando blob:", fname);

      // Em iframe (preview), pdf.save() pode ser bloqueado. Gera blob e abre/baixa manualmente.
      const blob = pdf.output("blob");
      const url = URL.createObjectURL(blob);

      // Download direto (mesma gestualidade do clique, sem abrir aba nova:
      // no Safari a aba com blob: renderiza em branco e consome a ativação).
      const a = document.createElement("a");
      a.href = url;
      a.download = fname;
      a.rel = "noopener";
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // Fallback acionável pelo usuário caso o navegador não inicie o download.
      setPdfPronto({ url, fname });
      toast({ title: "PDF gerado", description: `Salvando ${fname}. Se não baixar, use o botão "Baixar PDF".` });
      console.log("[PDF] concluído");

    } catch (err) {
      console.error("[PDF] erro inesperado:", err);
      toast({
        title: "Erro ao gerar PDF",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    }
  }

  // Regra "itens contidos": filhos cujos pais já estão no layout são ocultados do desenho.
  const ocultosSet = useMemo(() => {
    const paiParaFilhos = buildPaiParaFilhos(contidosPares);
    const presentes = new Set(items.map((i) => i.equipamento_id));
    return calcularOcultos(presentes, paiParaFilhos);
  }, [contidosPares, items]);
  const itemsVisiveis = useMemo(
    () => items.filter((i) => !ocultosSet.has(i.equipamento_id)),
    [items, ocultosSet],
  );
  const conexoesVisiveis = useMemo(() => {
    const idsVis = new Set(itemsVisiveis.map((i) => i.item_id));
    return conexoes.filter((c) => idsVis.has(c.item_origem_id) && idsVis.has(c.item_destino_id));
  }, [conexoes, itemsVisiveis]);

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
              {(layout as any).organizacao_id && orgInfo ? (
                <>
                  <div className="font-semibold truncate max-w-[420px]">{orgInfo.nome}</div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap">
                    {orgInfo.cidade && <><span>{orgInfo.cidade}</span><span>·</span></>}
                    {(layout as any).modelo_maquina && <><span>{(layout as any).modelo_maquina}</span><span>·</span></>}
                    {(layout as any).tipo_instalacao && <span>{(layout as any).tipo_instalacao}</span>}
                    {(layout as any).is_template && <Badge variant="secondary" className="ml-1 h-5 text-[10px]">Template</Badge>}
                  </div>
                </>
              ) : (
                <>
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
                    {(layout as any).modelo_maquina && <><span>·</span><span>{(layout as any).modelo_maquina}</span></>}
                    {(layout as any).tipo_instalacao && <><span>·</span><span>{(layout as any).tipo_instalacao}</span></>}
                  </div>
                </>
              )}
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
            <Button size="sm" variant="outline" onClick={() => setSaveTemplateOpen(true)} className="gap-1" title="Salvar este layout como template/padrão">
              <Layers className="w-4 h-4" /> Salvar como Template
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
                  items={itemsVisiveis}
                  pisoLarguraMm={layout.piso_largura_mm}
                  pisoComprimentoMm={layout.piso_comprimento_mm}
                  selectedId={selectedId}
                  selectedIds={selectedIds}
                  onSelect={handleSelect}
                  onTransform={handleTransform}
                  mode={transformMode}
                  alturaLiberada={alturaLiberada}
                  conexoes={conexoesVisiveis}
                  modoConexao={transformMode === "connect"}
                  conexaoPontoTemp={conexaoPontoTemp}
                  selectedConexaoId={selectedConexaoId}
                  onConectarClick={handleConectarClick}
                  onConexaoSelect={setSelectedConexaoId}
                  onReady={handleCanvasReady}
                />
              )}

              {/* Modo de transformação */}
              <div className="absolute top-3 right-3 bg-background/95 border rounded-lg shadow-md flex items-center gap-1 p-1 z-10">
                <Button
                  size="sm"
                  variant={transformMode === "translate" ? "default" : "ghost"}
                  onClick={() => { setTransformMode("translate"); setConexaoPontoTemp(null); }}
                  className="h-7 gap-1"
                >
                  <Move3d className="w-3.5 h-3.5" />
                  <span className="text-xs">Mover</span>
                </Button>
                <Button
                  size="sm"
                  variant={transformMode === "rotate" ? "default" : "ghost"}
                  onClick={() => { setTransformMode("rotate"); setConexaoPontoTemp(null); }}
                  className="h-7 gap-1"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span className="text-xs">Rotacionar</span>
                </Button>
                <Button
                  size="sm"
                  variant={transformMode === "connect" ? "default" : "ghost"}
                  onClick={() => {
                    if (transformMode === "connect") {
                      setTransformMode("translate");
                      setConexaoPontoTemp(null);
                    } else {
                      setTransformMode("connect");
                      setSelectedId(null);
                    }
                  }}
                  className="h-7 gap-1"
                >
                  <LinkIcon className="w-3.5 h-3.5" />
                  <span className="text-xs">{transformMode === "connect" ? "Cancelar (ESC)" : "Conectar"}</span>
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
              {(selectedIds.length > 0 || selectedItem) && (
                <div className="absolute bottom-16 left-1/2 -translate-x-1/2 bg-background border rounded-lg shadow-md px-2 py-1 flex items-center gap-1 z-20">
                  <span className="text-xs text-muted-foreground px-2">
                    {selectedIds.length > 1
                      ? `${selectedIds.length} equipamentos selecionados`
                      : selectedItem ? `${selectedItem.codigo} · ${selectedItem.nome}` : ""}
                  </span>
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
              <TabsTrigger value="conexoes" className="text-xs">Conexões ({conexoes.length})</TabsTrigger>
              
            </TabsList>

            {/* Aba 1 */}
            <TabsContent value="items" className="p-3 space-y-2 m-0">
              {items.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Nenhum equipamento. Adicione pela aba Catálogo.</p>
              ) : items.map((it) => {
                const oculto = ocultosSet.has(it.equipamento_id);
                return (
                <button
                  key={it.item_id}
                  onClick={(e) => handleSelect(it.item_id, e.shiftKey)}
                  className={`w-full text-left p-2 rounded-md border transition-colors ${selectedIds.includes(it.item_id) ? "bg-primary/10 border-primary" : "hover:bg-muted/50"} ${oculto ? "opacity-60" : ""}`}
                  title={oculto ? "Oculto no desenho (já representado por outro equipamento)" : undefined}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded bg-muted/40 flex items-center justify-center overflow-hidden shrink-0">
                      {it.imagem_url ? <img src={it.imagem_url} alt="" className="w-full h-full object-contain" /> : <Box className="w-4 h-4 text-muted-foreground" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate flex items-center gap-1">
                        {it.codigo}
                        {oculto && <span className="text-[10px] font-normal px-1 py-0.5 rounded bg-muted text-muted-foreground">oculto</span>}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{it.nome}</div>
                      <div className="text-xs text-muted-foreground">
                        {Math.round(it.pos_x_mm)}, {Math.round(it.pos_y_mm)} mm · {it.rotacao}°
                      </div>
                    </div>
                  </div>
                </button>
                );
              })}
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
                    <PlantaImage source={layout.piso_imagem_url} alt="Planta" className="w-full h-32 object-contain" />
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

            {/* Aba 4 - Conexões */}
            <TabsContent value="conexoes" className="p-3 space-y-2 m-0">
              {conexoes.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  Nenhuma conexão ainda. Clique em "Conectar" no header e selecione dois equipamentos.
                </p>
              ) : (
                conexoes.map((c) => {
                  const origem = items.find((i) => i.item_id === c.item_origem_id);
                  const destino = items.find((i) => i.item_id === c.item_destino_id);
                  const isSel = c.id === selectedConexaoId;
                  return (
                    <div
                      key={c.id}
                      onClick={() => setSelectedConexaoId(c.id === selectedConexaoId ? null : c.id)}
                      className={`p-2 border rounded-md cursor-pointer flex items-center justify-between gap-2 transition-colors ${
                        isSel ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium truncate">
                          {origem?.codigo || "?"} → {destino?.codigo || "?"}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {origem?.nome || ""} → {destino?.nome || ""}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="shrink-0 h-7 w-7 p-0 text-destructive"
                        onClick={(e) => { e.stopPropagation(); handleConexaoDelete(c.id); }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  );
                })
              )}
            </TabsContent>

          </Tabs>
        </aside>
      </div>


      {/* Salvar como template */}
      <SalvarTemplateDialog
        open={saveTemplateOpen}
        onOpenChange={setSaveTemplateOpen}
        initialNome={(layout as any).template_nome || ""}
        initialModelo={(layout as any).modelo_maquina || ""}
        initialTipo={(layout as any).tipo_instalacao || ""}
        onSave={salvarComoTemplate}
      />
    </div>
  );
}

function SalvarTemplateDialog({
  open, onOpenChange, initialNome, initialModelo, initialTipo, onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialNome: string;
  initialModelo: string;
  initialTipo: string;
  onSave: (nome: string, mod: string, tipo: string) => void | Promise<void>;
}) {
  const [nome, setNome] = useState(initialNome);
  const [mod, setMod] = useState(initialModelo);
  const [tipo, setTipo] = useState(initialTipo);

  useEffect(() => {
    if (open) {
      setNome(initialNome);
      setMod(initialModelo);
      setTipo(initialTipo);
    }
  }, [open, initialNome, initialModelo, initialTipo]);

  useEffect(() => { if (mod === "LSB130") setTipo("Chão"); }, [mod]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Salvar como template</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nome do template *</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Linha padrão LSB150 - Torre" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Modelo</Label>
              <Select value={mod} onValueChange={setMod}>
                <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                <SelectContent>
                  {["LSB130","LSB150","LSB300S","LSB300D"].map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tipo {mod === "LSB130" && <span className="text-xs text-muted-foreground">(travado)</span>}</Label>
              <Select value={tipo} onValueChange={setTipo} disabled={mod === "LSB130"}>
                <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Chão">Chão</SelectItem>
                  <SelectItem value="Torre">Torre</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={!nome.trim()} onClick={() => onSave(nome.trim(), mod, tipo)}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

