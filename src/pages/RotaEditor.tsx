import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import {
  getRota, getParadas, atualizarRota, adicionarParada, removerParada,
  reordenarParadas, criarAtividadeVisita, atualizarParada, type RotaParada,
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
import RotaStatus from '@/components/rotas/RotaStatus';
import PrestacaoParada from '@/components/rotas/PrestacaoParada';
import { hojeRota, paradaInformada, validarEnvio, type StatusRota } from '@/lib/rotasFluxo';
import { useRotasAlertas } from '@/hooks/useRotasAlertas';

export default function RotaEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const { pendentes } = useRotasAlertas();
  const qc = useQueryClient();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const polylineRef = useRef<any>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [novoObjetivo, setNovoObjetivo] = useState('');
  const [data, setData] = useState("");
  const [obs, setObs] = useState("");
  const [objetivos, setObjetivos] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [faltas, setFaltas] = useState<string[]>([]);

  const { data: rota } = useQuery({
    queryKey: ["rota", id],
    enabled: !!id,
    queryFn: () => id ? getRota(id) : Promise.resolve(null),
  });

  const { data: paradas = [] } = useQuery({
    queryKey: ["rota-paradas", id],
    enabled: !!id,
    queryFn: () => id ? getParadas(id) : Promise.resolve([]),
  });

  useEffect(() => {
    if (rota) {
      setData(rota.data_rota);
      setObs(rota.observacoes ?? "");
    }
  }, [rota?.id, rota?.data_rota, rota?.observacoes]);

  const planejamento = Boolean(rota && (rota.status === 'rascunho' || rota.status === 'reprovada' || (rota.status === 'aprovada' && rota.data_rota > hojeRota())));
  const prestacao = rota?.status === 'aprovada' && rota.data_rota <= hojeRota();
  const recarregar = () => {
    qc.invalidateQueries({ queryKey: ['rota', id] });
    qc.invalidateQueries({ queryKey: ['rota-paradas', id] });
    qc.invalidateQueries({ queryKey: ['rotas-minhas'] });
    qc.invalidateQueries({ queryKey: ['rotas-pendencias'] });
    qc.invalidateQueries({ queryKey: ['rotas-aprovacoes'] });
    qc.invalidateQueries({ queryKey: ['rotas-aprovacoes-contagem'] });
  };
  async function executar(fn: () => Promise<void>) {
    setBusy(true);
    try { await fn(); recarregar(); }
    catch (e) { toast.error((e as { message?: string })?.message || 'Não foi possível salvar a rota.'); }
    finally { setBusy(false); }
  }
  async function salvarObjetivos() {
    for (const p of paradas) if (objetivos[p.id] !== undefined && objetivos[p.id] !== (p.objetivo ?? '')) await atualizarParada(p.id, { objetivo: objetivos[p.id].trim() });
    setObjetivos({});
  }
  async function mudarStatus(status: StatusRota) {
    if (!id || !rota) return;
    if (status === 'aguardando_aprovacao') {
      const erros = validarEnvio(data, paradas.map(p => ({ ...p, objetivo: objetivos[p.id] ?? p.objetivo })), pendentes.find(p => p.id !== id));
      setFaltas(erros);
      if (erros.length) return;
    }
    await executar(async () => {
      if (status === 'aguardando_aprovacao') {
        await atualizarRota(id, { data_rota: data, observacoes: obs || null });
        await salvarObjetivos();
      }
      await atualizarRota(id, { status });
      setFaltas([]); toast.success(status === 'concluida' ? 'Prestação de contas concluída' : 'Status atualizado');
    });
  }

  // Init map (re-roda quando o container monta ou a rota carrega)
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const g = await loadGoogleMaps();
        if (cancelled || !mapRef.current) return;
        if (mapInstanceRef.current) return;
        mapInstanceRef.current = new g.maps.Map(mapRef.current, {
          center: { lat: -15.78, lng: -47.93 },
          zoom: 4,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        });
        // Garante que o mapa renderize tiles depois do layout estabilizar
        setTimeout(() => {
          if (mapInstanceRef.current) {
            g.maps.event.trigger(mapInstanceRef.current, "resize");
            renderMap();
          }
        }, 100);
      } catch (e) {
        console.error("[maps init]", e);
      }
    })();
    return () => { cancelled = true; };
  }, [rota?.id]);

  useEffect(() => { renderMap(); }, [paradas, rota?.vendedor_id]);

  async function renderMap() {
    const g = (window as any).google;
    if (!g || !mapInstanceRef.current) return;
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    if (polylineRef.current) polylineRef.current.setMap(null);

    const valid = paradas.filter((p) => p.latitude != null && p.longitude != null);

    const bounds = new g.maps.LatLngBounds();
    const path: any[] = [];

    // Marker de origem (base do vendedor)
    const origem = getOrigemVendedor(rota?.vendedor_id);
    const origemPos = { lat: origem.lat, lng: origem.lng };
    const origemMarker = new g.maps.Marker({
      position: origemPos,
      map: mapInstanceRef.current,
      label: { text: origem.nome[0], color: "white", fontWeight: "bold" },
      title: `Origem: ${origem.nome}`,
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
    await executar(async () => {
    await atualizarRota(id, { data_rota: data, observacoes: obs || null });
    await salvarObjetivos();
    qc.invalidateQueries({ queryKey: ["rota", id] });
    qc.invalidateQueries({ queryKey: ["rotas-minhas"] });
    toast.success("Rota salva");
    });
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
        objetivo: novoObjetivo.trim(),
      });
      qc.invalidateQueries({ queryKey: ["rota-paradas", id] });
      toast.success(`${org.nome_fantasia || org.nome} adicionada`);
      recarregar();
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
        objetivo: novoObjetivo.trim(),
      });
      qc.invalidateQueries({ queryKey: ["rota-paradas", id] });
      toast.success(`Prospecção em ${cidade.nome} adicionada`);
      recarregar();
      setAddOpen(false);
    } catch (e: any) {
      toast.error("Erro", { description: e?.message });
    }
  }

  async function removeParada(p: RotaParada) {
    await executar(async () => {
    await removerParada(p.id);
    qc.invalidateQueries({ queryKey: ["rota-paradas", id] });
    });
  }

  async function otimizar() {
    if (!id) return;
    const valid = paradas.filter((p) => p.latitude != null && p.longitude != null);
    if (valid.length < 1) { toast.error("Adicione ao menos 1 parada"); return; }
    try {
      const origem = getOrigemVendedor(rota?.vendedor_id);
      const res = await optimizeRoute(valid.map((p) => ({ lat: Number(p.latitude), lng: Number(p.longitude) })), origem);
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
    await executar(async () => { await reordenarParadas(updates); });
  }

  if (!rota) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Carregando...</div>;
  }

  return (
    <div className="min-h-screen bg-muted/20 flex flex-col">
      <header className="bg-background border-b">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/rotas")}><ArrowLeft className="w-4 h-4" /></Button>
            <h1 className="font-semibold">{prestacao ? 'Prestação de contas' : 'Rota Comercial'}</h1>
            <RotaStatus status={rota.status} />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => executar(otimizar)} disabled={!planejamento || busy || paradas.length < 1}>
              <Wand2 className="w-4 h-4 mr-1" /> Otimizar ordem
            </Button>
            {planejamento && <Button onClick={salvarMeta} disabled={busy}><Save className="w-4 h-4 mr-1" /> Salvar</Button>}
            <AppHeader />
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-3 flex flex-col min-h-0">
          {rota.status === 'reprovada' && <div className="border border-destructive bg-destructive/10 text-destructive p-3 rounded-md">Reprovada: {rota.motivo_reprovacao}</div>}
          {rota.status === 'aguardando_aprovacao' && <div className="border p-3 rounded-md space-y-2"><p>Aguardando aprovação</p><Button variant="outline" disabled={busy} onClick={() => mudarStatus('rascunho')}>Voltar para rascunho</Button></div>}
          {rota.status === 'aprovada' && !prestacao && <p className="text-sm text-primary">Viagem aprovada. Alterar o plano exigirá nova aprovação.</p>}
          {faltas.length > 0 && <ul className="border border-destructive bg-destructive/10 text-destructive p-3 pl-7 rounded-md list-disc text-sm">{faltas.map(f => <li key={f}>{f}</li>)}</ul>}
          {(rota.status === 'rascunho' || rota.status === 'reprovada') && <Button disabled={busy} onClick={() => mudarStatus('aguardando_aprovacao')}>Enviar para aprovação</Button>}
          {prestacao && <Button disabled={busy || !paradas.length || !paradas.every(paradaInformada)} onClick={() => mudarStatus('concluida')}>Concluir prestação de contas</Button>}
          {isAdmin && rota.status === 'aprovada' && <Button variant="outline" disabled={busy} onClick={() => { if (confirm('Cancelar esta viagem aprovada?')) mudarStatus('cancelada'); }}>Cancelar viagem</Button>}
          <Card className="p-3 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Data</Label>
                <Input type="date" value={data} disabled={!planejamento || busy} onChange={(e) => setData(e.target.value)} />
              </div>
              {rota.km_total_estimado != null && (
                <div className="flex items-end">
                  <Badge variant="secondary">{Number(rota.km_total_estimado).toFixed(1)} km estimados</Badge>
                </div>
              )}
            </div>
            <div>
              <Label className="text-xs">Observações</Label>
              <Textarea rows={2} value={obs} disabled={!planejamento || busy} onChange={(e) => setObs(e.target.value)} />
            </div>
          </Card>

          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm">Paradas ({paradas.length})</h2>
            {planejamento && <Button size="sm" disabled={busy} onClick={() => setAddOpen(true)}><Plus className="w-4 h-4 mr-1" /> Adicionar Parada</Button>}
          </div>

          <div className="space-y-2 overflow-y-auto pr-1">
            {paradas.length === 0 && (
              <Card className="p-6 text-center text-muted-foreground text-sm">
                <MapPin className="w-6 h-6 mx-auto mb-2 opacity-40" />
                Nenhuma parada. Adicione a primeira.
              </Card>
            )}
            {paradas.map((p, idx) => (
              <Card key={p.id} className="p-3">
              <div className="flex items-center gap-2">
                <div className="flex flex-col gap-0.5">
                  {planejamento && <><Button size="icon" variant="ghost" aria-label="Mover parada para cima" onClick={() => mover(p, -1)} disabled={busy || idx === 0} className="h-6 w-6">▲</Button>
                  <Button size="icon" variant="ghost" aria-label="Mover parada para baixo" onClick={() => mover(p, 1)} disabled={busy || idx === paradas.length - 1} className="h-6 w-6">▼</Button></>}
                </div>
                <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                  {idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {p.organizacao?.nome_fantasia || p.organizacao?.nome || ''}
                  </div>
                  <div className="text-sm font-medium truncate">
                    {p.cidade ?? "—"}{p.estado ? ` / ${p.estado}` : ""}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <Badge variant={p.tipo === "prospeccao" ? "outline" : "secondary"} className="text-[10px]">
                      {p.tipo === "prospeccao" ? "Prospecção" : "Visita"}
                    </Badge>
                  </div>
                </div>
                {planejamento && <Button variant="ghost" size="icon" disabled={busy} aria-label="Remover parada" onClick={() => removeParada(p)}>
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>}
              </div>
              <div className="mt-3 space-y-1"><Label htmlFor={`objetivo-${p.id}`}>Objetivo *</Label><Input id={`objetivo-${p.id}`} value={objetivos[p.id] ?? p.objetivo ?? ''} disabled={!planejamento || busy} onChange={e => setObjetivos(v => ({ ...v, [p.id]: e.target.value }))} placeholder="Ex.: apresentar LSB150" /></div>
              {prestacao && <PrestacaoParada key={`${p.id}-${p.informada_em}`} parada={p} onSaved={recarregar} />}
              {rota.status === 'concluida' && <p className="text-sm mt-3">{p.visitada ? `Visitada — ${p.resultado}` : `Não visitada — ${p.motivo_nao_visita}`}</p>}
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
        onObjetivo={setNovoObjetivo}
      />
    </div>
  );
}
