import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import {
  getRota, getParadas, atualizarRota, adicionarParada, removerParada,
  reordenarParadas, criarAtividadeVisita, type RotaParada,
} from "@/lib/rotas";
import { loadGoogleMaps, optimizeRoute, getOrigemVendedor } from "@/lib/maps";
import AppHeader from "@/components/AppHeader";
import AdicionarParadaModal from "@/components/AdicionarParadaModal";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, Trash2, Save, Wand2, GripVertical, MapPin } from "lucide-react";
import { toast } from "sonner";

export default function RotaEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const polylineRef = useRef<any>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [data, setData] = useState("");
  const [obs, setObs] = useState("");

  const { data: rota } = useQuery({
    queryKey: ["rota", id],
    enabled: !!id,
    queryFn: () => getRota(id!),
  });

  const { data: paradas = [] } = useQuery({
    queryKey: ["rota-paradas", id],
    enabled: !!id,
    queryFn: () => getParadas(id!),
  });

  useEffect(() => {
    if (rota) {
      setData(rota.data_rota);
      setObs(rota.observacoes ?? "");
    }
  }, [rota?.id]);

  // Init map
  useEffect(() => {
    if (!mapRef.current) return;
    let cancelled = false;
    (async () => {
      const g = await loadGoogleMaps();
      if (cancelled || !mapRef.current) return;
      mapInstanceRef.current = new g.maps.Map(mapRef.current, {
        center: { lat: -15.78, lng: -47.93 },
        zoom: 4,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
      });
      renderMap();
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { renderMap(); }, [paradas]);

  async function renderMap() {
    const g = (window as any).google;
    if (!g || !mapInstanceRef.current) return;
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    if (polylineRef.current) polylineRef.current.setMap(null);

    const valid = paradas.filter((p) => p.latitude != null && p.longitude != null);

    const bounds = new g.maps.LatLngBounds();
    const path: any[] = [];

    // Marker de origem (Maringá)
    const origemPos = { lat: MARINGA.lat, lng: MARINGA.lng };
    const origemMarker = new g.maps.Marker({
      position: origemPos,
      map: mapInstanceRef.current,
      label: { text: "M", color: "white", fontWeight: "bold" },
      title: "Origem: Maringá - PR",
      icon: {
        path: g.maps.SymbolPath.CIRCLE,
        scale: 14,
        fillColor: "#0f172a",
        fillOpacity: 1,
        strokeColor: "white",
        strokeWeight: 2,
      },
    });
    markersRef.current.push(origemMarker);
    bounds.extend(origemPos);
    path.push(origemPos);

    valid.forEach((p, idx) => {
      const pos = { lat: Number(p.latitude), lng: Number(p.longitude) };
      const marker = new g.maps.Marker({
        position: pos,
        map: mapInstanceRef.current,
        label: { text: String(idx + 1), color: "white", fontWeight: "bold" },
      });
      markersRef.current.push(marker);
      bounds.extend(pos);
      path.push(pos);
    });

    // Fecha o ciclo voltando para Maringá
    if (valid.length > 0) path.push(origemPos);

    polylineRef.current = new g.maps.Polyline({
      path,
      strokeColor: "#059669",
      strokeWeight: 3,
      map: mapInstanceRef.current,
    });

    if (valid.length === 0) {
      mapInstanceRef.current.setCenter(origemPos);
      mapInstanceRef.current.setZoom(7);
    } else {
      mapInstanceRef.current.fitBounds(bounds, 60);
    }
  }

  async function salvarMeta() {
    if (!id) return;
    await atualizarRota(id, { data_rota: data, observacoes: obs || null });
    qc.invalidateQueries({ queryKey: ["rota", id] });
    qc.invalidateQueries({ queryKey: ["rotas-minhas"] });
    toast.success("Rota salva");
  }

  async function onAddOrg(org: any, cidade: any) {
    if (!id || !rota || !user) return;
    try {
      const atividadeId = await criarAtividadeVisita({
        organizacaoId: org.id,
        organizacaoNome: org.nome_fantasia || org.nome,
        responsavelId: rota.vendedor_id,
        dataAtividade: rota.data_rota,
      });
      const nextOrdem = paradas.length;
      await adicionarParada({
        rota_id: id,
        ordem: nextOrdem,
        organizacao_id: org.id,
        oportunidade_id: org.oportunidade_id,
        cidade: org.cidade,
        estado: org.estado,
        latitude: org.latitude,
        longitude: org.longitude,
        tipo: "visita",
        observacoes: null,
        atividade_id: atividadeId,
        concluida: false,
      });
      qc.invalidateQueries({ queryKey: ["rota-paradas", id] });
      toast.success(`${org.nome_fantasia || org.nome} adicionada`);
      setAddOpen(false);
    } catch (e: any) {
      toast.error("Erro ao adicionar", { description: e?.message });
    }
  }

  async function onAddProspeccao(cidade: any) {
    if (!id) return;
    try {
      await adicionarParada({
        rota_id: id,
        ordem: paradas.length,
        organizacao_id: null,
        oportunidade_id: null,
        cidade: cidade.nome,
        estado: cidade.estado,
        latitude: cidade.lat,
        longitude: cidade.lng,
        tipo: "prospeccao",
        observacoes: null,
        atividade_id: null,
        concluida: false,
      });
      qc.invalidateQueries({ queryKey: ["rota-paradas", id] });
      toast.success(`Prospecção em ${cidade.nome} adicionada`);
      setAddOpen(false);
    } catch (e: any) {
      toast.error("Erro", { description: e?.message });
    }
  }

  async function removeParada(p: RotaParada) {
    await removerParada(p.id);
    qc.invalidateQueries({ queryKey: ["rota-paradas", id] });
  }

  async function otimizar() {
    if (!id) return;
    const valid = paradas.filter((p) => p.latitude != null && p.longitude != null);
    if (valid.length < 1) { toast.error("Adicione ao menos 1 parada"); return; }
    try {
      const res = await optimizeRoute(valid.map((p) => ({ lat: Number(p.latitude), lng: Number(p.longitude) })));
      if (!res) return;
      const updates = res.order.map((origIdx, newIdx) => ({ id: valid[origIdx].id, ordem: newIdx }));
      await reordenarParadas(updates);
      await atualizarRota(id, { km_total_estimado: Math.round(res.totalKm * 10) / 10 });
      qc.invalidateQueries({ queryKey: ["rota-paradas", id] });
      qc.invalidateQueries({ queryKey: ["rota", id] });
      toast.success(`Rota otimizada — ${res.totalKm.toFixed(1)} km estimados`);
    } catch (e: any) {
      toast.error("Falha ao otimizar", { description: e?.message });
    }
  }

  async function mover(p: RotaParada, dir: -1 | 1) {
    const sorted = [...paradas].sort((a, b) => a.ordem - b.ordem);
    const idx = sorted.findIndex((x) => x.id === p.id);
    const target = idx + dir;
    if (target < 0 || target >= sorted.length) return;
    [sorted[idx], sorted[target]] = [sorted[target], sorted[idx]];
    const updates = sorted.map((x, i) => ({ id: x.id, ordem: i }));
    await reordenarParadas(updates);
    qc.invalidateQueries({ queryKey: ["rota-paradas", id] });
  }

  if (!rota) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Carregando...</div>;
  }

  return (
    <div className="min-h-screen bg-muted/20 flex flex-col">
      <header className="bg-background border-b">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/rotas")}><ArrowLeft className="w-4 h-4" /></Button>
            <h1 className="font-semibold">Editar Rota</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={otimizar} disabled={paradas.length < 1}>
              <Wand2 className="w-4 h-4 mr-1" /> Otimizar ordem
            </Button>
            <Button onClick={salvarMeta}><Save className="w-4 h-4 mr-1" /> Salvar</Button>
            <AppHeader />
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-3 flex flex-col min-h-0">
          <Card className="p-3 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Data</Label>
                <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
              </div>
              {rota.km_total_estimado != null && (
                <div className="flex items-end">
                  <Badge variant="secondary">{Number(rota.km_total_estimado).toFixed(1)} km estimados</Badge>
                </div>
              )}
            </div>
            <div>
              <Label className="text-xs">Observações</Label>
              <Textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
            </div>
          </Card>

          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm">Paradas ({paradas.length})</h2>
            <Button size="sm" onClick={() => setAddOpen(true)}><Plus className="w-4 h-4 mr-1" /> Adicionar Parada</Button>
          </div>

          <div className="space-y-2 overflow-y-auto pr-1">
            {paradas.length === 0 && (
              <Card className="p-6 text-center text-muted-foreground text-sm">
                <MapPin className="w-6 h-6 mx-auto mb-2 opacity-40" />
                Nenhuma parada. Adicione a primeira.
              </Card>
            )}
            {paradas.map((p, idx) => (
              <Card key={p.id} className="p-3 flex items-center gap-2">
                <div className="flex flex-col gap-0.5">
                  <button onClick={() => mover(p, -1)} disabled={idx === 0} className="text-xs disabled:opacity-30">▲</button>
                  <button onClick={() => mover(p, 1)} disabled={idx === paradas.length - 1} className="text-xs disabled:opacity-30">▼</button>
                </div>
                <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                  {idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {p.cidade ?? "—"}{p.estado ? ` / ${p.estado}` : ""}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <Badge variant={p.tipo === "prospeccao" ? "outline" : "secondary"} className="text-[10px]">
                      {p.tipo === "prospeccao" ? "Prospecção" : "Visita"}
                    </Badge>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => removeParada(p)}>
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </Card>
            ))}
          </div>
        </div>

        <Card className="overflow-hidden min-h-[400px] lg:min-h-0">
          <div ref={mapRef} className="w-full h-full min-h-[400px]" />
        </Card>
      </main>

      <AdicionarParadaModal
        open={addOpen}
        onOpenChange={setAddOpen}
        onSelectOrganizacao={onAddOrg}
        onAddProspeccao={onAddProspeccao}
      />
    </div>
  );
}
