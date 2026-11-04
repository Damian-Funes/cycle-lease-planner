import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import {
  getRota, getParadas, atualizarRota, adicionarParada, removerParada,
  reordenarParadas, criarAtividadeVisita, atualizarParada, type RotaParada,
} from "@/lib/rotas";
import { loadGoogleMaps, optimizeRoute, getOrigemVendedor, calcularRota, erroRotaMensagem, type RotaCalculada } from "@/lib/maps";
import { linksGoogleMaps, linkWaze, formatarDuracao, formatarKm, rotaLonga, coordenadaValida } from "@/lib/rotaNavegacao";
import { AlertTriangle, Navigation, Loader2 } from "lucide-react";
import { posicaoInsercaoMaisBarata, textoMotivo } from "@/lib/rotaNavegacao";
import { buscarClientesMapa, medirClientes, filtrarNoCaminho, type ClienteMapa } from "@/lib/clientesNoCaminho";
import { agruparPorGrade, categoriaMapa, CATEGORIAS_MAPA, objetivoSugerido, type CategoriaMapa } from "@/lib/rotaNavegacao";
import { formatBRL } from "@/lib/smartcycle";
import ClientesNoCaminho from "@/components/rotas/ClientesNoCaminho";
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
  const directionsRef = useRef<any>(null);
  const [mapaPronto, setMapaPronto] = useState(false);
  const [calculo, setCalculo] = useState<(RotaCalculada & { ids: string[] }) | null>(null);
  const [erroTrajeto, setErroTrajeto] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [novoObjetivo, setNovoObjetivo] = useState('');
  const [data, setData] = useState("");
  const [obs, setObs] = useState("");
  const [objetivos, setObjetivos] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [faltas, setFaltas] = useState<string[]>([]);

  const { data: rota, error: erroRota, isLoading: carregandoRota } = useQuery({
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
            setMapaPronto(true);
          }
        }, 100);
      } catch (e) {
        console.error("[maps init]", e);
      }
    })();
    return () => { cancelled = true; };
  }, [rota?.id]);

  useEffect(() => { renderMap(); }, [paradas, rota?.vendedor_id]);

  // Traçado pelas estradas: recalcula (sem otimizar) sempre que as paradas mudam
  const chaveParadas = paradas.map((p) => `${p.id}:${p.latitude}:${p.longitude}`).join("|");
  useEffect(() => {
    if (!rota) return;
    const valid = paradas.filter((p) => coordenadaValida(p.latitude, p.longitude));
    const invalidas = paradas.map((p, i) => ({ p, i })).filter(({ p }) => !coordenadaValida(p.latitude, p.longitude));
    const nomeParada = (p: RotaParada, i: number) => `parada ${i + 1} (${p.organizacao?.nome_fantasia || p.organizacao?.nome || p.cidade || "sem nome"})`;
    setErroTrajeto(invalidas.length ? `Sem coordenada válida: ${invalidas.map(({ p, i }) => nomeParada(p, i)).join(", ")}. Ela ficou fora do trajeto.` : null);
    if (!valid.length) { setCalculo(null); directionsRef.current?.setMap(null); return; }
    let cancel = false;
    const t = setTimeout(async () => {
      try {
        const origem = getOrigemVendedor(rota.vendedor_id);
        const r = await calcularRota(origem, valid.map((p) => ({ lat: Number(p.latitude), lng: Number(p.longitude) })), false);
        if (cancel || !r) return;
        setCalculo({ ...r, ids: valid.map((p) => p.id) });
        const g = (window as any).google;
        if (g && mapInstanceRef.current) {
          if (!directionsRef.current) directionsRef.current = new g.maps.DirectionsRenderer({ suppressMarkers: true, preserveViewport: true, polylineOptions: { strokeColor: "#059669", strokeWeight: 4, strokeOpacity: 0.85 } });
          directionsRef.current.setMap(mapInstanceRef.current);
          directionsRef.current.setDirections(r.result);
        }
        const km = Math.round(r.totalKm * 10) / 10;
        if (planejamento && id && Number(rota.km_total_estimado ?? -1) !== km) {
          atualizarRota(id, { km_total_estimado: km }).then(() => qc.invalidateQueries({ queryKey: ["rota", id] })).catch(() => {});
        }
      } catch (e) {
        if (cancel) return;
        console.error("[calcularRota]", e);
        setCalculo(null);
        directionsRef.current?.setMap(null);
        setErroTrajeto(erroRotaMensagem(e, valid.map((p) => nomeParada(p, paradas.indexOf(p)))));
      }
    }, 600);
    return () => { cancel = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveParadas, rota?.vendedor_id, mapaPronto]);

  useEffect(() => () => directionsRef.current?.setMap(null), []);

  // ---- Clientes no mapa / no caminho ----
  const [raioKm, setRaioKm] = useState(30);
  const [clientes, setClientes] = useState<ClienteMapa[]>([]);
  const [carregandoSug, setCarregandoSug] = useState(false);
  const [erroSug, setErroSug] = useState<string | null>(null);
  const [selecionadaId, setSelecionadaId] = useState<string | null>(null);
  const [categoriasOn, setCategoriasOn] = useState<Record<CategoriaMapa, boolean>>({ 1: true, 2: true, 3: true, 4: true });
  const [soCaminho, setSoCaminho] = useState(false);
  const [zoom, setZoom] = useState(4);
  const sugMarkersRef = useRef<any[]>([]);
  const infoRef = useRef<any>(null);
  const adicionarRef = useRef<(s: ClienteMapa, objetivo: string) => Promise<void>>();

  // Busca única por abertura da tela
  useEffect(() => {
    const vend = rota?.vendedor_id;
    if (!vend) return;
    let cancel = false;
    setCarregandoSug(true); setErroSug(null);
    buscarClientesMapa(vend)
      .then((r) => { if (!cancel) setClientes(r); })
      .catch((e) => { if (!cancel) setErroSug(e?.message || "Não foi possível carregar os clientes."); })
      .finally(() => { if (!cancel) setCarregandoSug(false); });
    return () => { cancel = true; };
  }, [rota?.vendedor_id]);

  const caminho = useMemo(
    () => (calculo?.result?.routes?.[0]?.overview_path ?? []).map((ll: any) => ({ lat: ll.lat(), lng: ll.lng() })),
    [calculo],
  );
  const paradaOrgIds = useMemo(() => paradas.map((p) => p.organizacao_id).filter(Boolean) as string[], [paradas]);
  const medidos = useMemo(() => medirClientes(clientes, caminho, paradaOrgIds), [clientes, caminho, paradaOrgIds]);
  const sugestoes = useMemo(() => filtrarNoCaminho(medidos, raioKm), [medidos, raioKm]);
  const visiveisMapa = useMemo(() => medidos.filter((c) =>
    categoriasOn[categoriaMapa(c.motivo)] && (!soCaminho || (c.distanciaKm != null && c.distanciaKm <= raioKm)),
  ), [medidos, categoriasOn, soCaminho, raioKm]);

  useEffect(() => {
    const g = (window as any).google;
    const map = mapInstanceRef.current;
    if (!g || !map) return;
    setZoom(map.getZoom() ?? 4);
    const l = map.addListener("zoom_changed", () => setZoom(map.getZoom() ?? 4));
    return () => l.remove();
  }, [mapaPronto]);

  useEffect(() => {
    const g = (window as any).google;
    sugMarkersRef.current.forEach((m) => m.setMap(null));
    sugMarkersRef.current = [];
    const map = mapInstanceRef.current;
    if (!g || !map) return;
    if (!infoRef.current) infoRef.current = new g.maps.InfoWindow();
    const abrirCard = (c: (typeof visiveisMapa)[number], anchor: any) => {
      const div = document.createElement("div");
      div.style.cssText = "font-size:12px;max-width:240px";
      const t = document.createElement("strong"); t.textContent = c.nome;
      const loc = document.createElement("div"); loc.textContent = `${c.cidade ?? "—"}${c.estado ? `/${c.estado}` : ""}${c.aproximada ? " · localização aproximada" : ""}`;
      const mot = document.createElement("div"); mot.style.marginTop = "4px"; mot.textContent = textoMotivo(c.motivo, formatBRL);
      div.append(t, loc, mot);
      if (c.distanciaKm != null) {
        const d = document.createElement("div"); d.textContent = `${Math.round(c.distanciaKm)} km da rota · desvio ≈ ${Math.round(c.distanciaKm * 2)} km (estimativa)`; div.append(d);
      }
      if (planejamento) {
        const inp = document.createElement("input");
        inp.value = objetivoSugerido(c.motivo); inp.placeholder = "Objetivo *"; inp.setAttribute("aria-label", "Objetivo da visita");
        inp.style.cssText = "margin-top:6px;width:100%;border:1px solid #d1d5db;border-radius:4px;padding:2px 4px";
        const b = document.createElement("button"); b.textContent = "Adicionar à rota";
        b.style.cssText = "margin-top:4px;font-weight:600;text-decoration:underline";
        b.onclick = async () => {
          const obj = inp.value.trim();
          if (!obj) { toast.error("Informe o objetivo da visita"); return; }
          b.disabled = true;
          infoRef.current?.close();
          await adicionarRef.current?.(c, obj);
        };
        div.append(inp, b);
      }
      infoRef.current.setContent(div);
      infoRef.current.open({ map, anchor });
    };
    agruparPorGrade(visiveisMapa, zoom).forEach((grp) => {
      if (grp.itens.length === 1) {
        const c = grp.itens[0];
        const cat = CATEGORIAS_MAPA[categoriaMapa(c.motivo)];
        const m = new g.maps.Marker({
          map, position: { lat: c.lat, lng: c.lng }, title: c.nome, zIndex: 5 - categoriaMapa(c.motivo),
          icon: { path: g.maps.SymbolPath.CIRCLE, scale: 6, fillColor: cat.cor, fillOpacity: 0.9, strokeColor: "#ffffff", strokeWeight: 1 },
        });
        m.addListener("click", () => abrirCard(c, m));
        sugMarkersRef.current.push(m);
        return;
      }
      const melhor = Math.min(...grp.itens.map((c) => categoriaMapa(c.motivo))) as CategoriaMapa;
      const n = grp.itens.length;
      const m = new g.maps.Marker({
        map, position: grp.centro, zIndex: 6, title: `${n} clientes`,
        label: { text: String(n), color: "#ffffff", fontSize: "11px", fontWeight: "700" },
        icon: { path: g.maps.SymbolPath.CIRCLE, scale: 11 + Math.min(9, Math.log2(n) * 2), fillColor: CATEGORIAS_MAPA[melhor].cor, fillOpacity: 0.85, strokeColor: "#ffffff", strokeWeight: 2 },
      });
      m.addListener("click", () => { map.setCenter(grp.centro); map.setZoom((map.getZoom() ?? 4) + 2); });
      sugMarkersRef.current.push(m);
    });
    return () => { sugMarkersRef.current.forEach((m) => m.setMap(null)); sugMarkersRef.current = []; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visiveisMapa, zoom, mapaPronto, planejamento]);

  async function adicionarSugestao(s: ClienteMapa, objetivo: string) {
    if (!id || !rota) return;
    await executar(async () => {
      const atividadeId = await criarAtividadeVisita({
        organizacaoId: s.id, organizacaoNome: s.nome, responsavelId: rota.vendedor_id, dataAtividade: rota.data_rota,
      });
      const nova = await adicionarParada({
        rota_id: id, ordem: paradas.length, organizacao_id: s.id, oportunidade_id: s.oportunidadeId,
        cidade: s.cidade, estado: s.estado, latitude: s.lat, longitude: s.lng, tipo: "visita",
        observacoes: null, atividade_id: atividadeId, concluida: false, objetivo,
      });
      const ordenadas = [...paradas].sort((a, b) => a.ordem - b.ordem);
      const validas = ordenadas.filter((p) => coordenadaValida(p.latitude, p.longitude));
      const origem = getOrigemVendedor(rota.vendedor_id);
      const k = posicaoInsercaoMaisBarata({ lat: origem.lat, lng: origem.lng }, validas.map((p) => ({ lat: Number(p.latitude), lng: Number(p.longitude) })), { lat: s.lat, lng: s.lng });
      const antesDe = validas[k];
      const idxFull = antesDe ? ordenadas.findIndex((p) => p.id === antesDe.id) : ordenadas.length;
      const lista = [...ordenadas.slice(0, idxFull), nova, ...ordenadas.slice(idxFull)];
      await reordenarParadas(lista.map((p, i) => ({ id: p.id, ordem: i })).filter((u, i) => lista[i].ordem !== u.ordem));
      toast.success(`${s.nome} adicionada como parada ${idxFull + 1}`);
    });
  }

  adicionarRef.current = adicionarSugestao;

  const trechoPorParada = useMemo(() => {
    const m: Record<string, { distanciaM: number; duracaoS: number; desde: string }> = {};
    if (!calculo) return m;
    calculo.ids.forEach((pid, i) => {
      const anteriorId = i > 0 ? calculo.ids[i - 1] : null;
      const anteriorIdx = anteriorId ? paradas.findIndex((p) => p.id === anteriorId) : -1;
      m[pid] = { ...calculo.trechos[i], desde: anteriorIdx >= 0 ? `desde a parada ${anteriorIdx + 1}` : "desde a base" };
    });
    return m;
  }, [calculo, paradas]);

  const origemNav = getOrigemVendedor(rota?.vendedor_id);
  const linksMaps = linksGoogleMaps(
    { lat: origemNav.lat, lng: origemNav.lng },
    paradas.filter((p) => coordenadaValida(p.latitude, p.longitude)).map((p) => ({ lat: Number(p.latitude), lng: Number(p.longitude) }))
  );

  async function renderMap() {
    const g = (window as any).google;
    if (!g || !mapInstanceRef.current) return;
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    const valid = paradas.filter((p) => coordenadaValida(p.latitude, p.longitude));

    const bounds = new g.maps.LatLngBounds();
    const path: any[] = [];

    // Marker de origem (base do vendedor)
    const origem = getOrigemVendedor(rota?.vendedor_id);
    const origemPos = { lat: origem.lat, lng: origem.lng };
    const origemMarker = new g.maps.Marker({
      position: origemPos,
      map: mapInstanceRef.current,
      zIndex: 1000, label: { text: origem.nome[0], color: "white", fontWeight: "bold" },
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
        zIndex: 1001, label: { text: String(idx + 1), color: "white", fontWeight: "bold" },
      });
      markersRef.current.push(marker);
      bounds.extend(pos);
      path.push(pos);
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
    return <div className="min-h-screen flex flex-col gap-3 items-center justify-center text-muted-foreground"><p>{erroRota ? (erroRota as { message?: string }).message : carregandoRota ? 'Carregando...' : 'Rota não encontrada.'}</p><Button variant="outline" onClick={() => navigate('/rotas')}>Voltar para rotas</Button></div>;
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

          {(calculo || erroTrajeto || linksMaps.length > 0) && (
            <Card className="p-3 space-y-2" aria-label="Resumo da rota">
              {calculo && <p className="font-semibold">{formatarKm(calculo.totalKm * 1000)} · {formatarDuracao(calculo.totalSegundos)} de direção</p>}
              {calculo && rotaLonga(calculo.totalSegundos) && (
                <p className="flex items-center gap-2 text-sm rounded-md border border-warning/40 bg-warning/10 text-warning-foreground p-2"><AlertTriangle className="w-4 h-4 text-warning" /> Rota longa para um dia</p>
              )}
              {erroTrajeto && <p className="text-sm text-destructive">{erroTrajeto}</p>}
              {linksMaps.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {linksMaps.map((url, i) => (
                    <Button key={url} asChild size="sm" variant="outline">
                      <a href={url} target="_blank" rel="noopener noreferrer"><Navigation className="w-4 h-4 mr-1" />Abrir no Google Maps{linksMaps.length > 1 ? ` — Trecho ${i + 1}` : ""}</a>
                    </Button>
                  ))}
                </div>
              )}
            </Card>
          )}

          {planejamento && calculo && (
            <ClientesNoCaminho
              sugestoes={sugestoes} carregando={carregandoSug} erro={erroSug}
              raioKm={raioKm} onRaio={setRaioKm}
              selecionadaId={selecionadaId} onSelecionar={setSelecionadaId}
              onAdicionar={adicionarSugestao} busy={busy}
            />
          )}

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
                  {trechoPorParada[p.id] && (
                    <div className="text-xs text-muted-foreground">+ {formatarKm(trechoPorParada[p.id].distanciaM)} · {formatarDuracao(trechoPorParada[p.id].duracaoS)} {trechoPorParada[p.id].desde}</div>
                  )}
                  <div className="text-xs text-muted-foreground">
                    <Badge variant={p.tipo === "prospeccao" ? "outline" : "secondary"} className="text-[10px]">
                      {p.tipo === "prospeccao" ? "Prospecção" : "Visita"}
                    </Badge>
                  </div>
                </div>
                {coordenadaValida(p.latitude, p.longitude) && (
                  <Button asChild variant="outline" size="sm" aria-label={`Abrir parada ${idx + 1} no Waze`}>
                    <a href={linkWaze({ lat: Number(p.latitude), lng: Number(p.longitude) })} target="_blank" rel="noopener noreferrer">Waze</a>
                  </Button>
                )}
                {planejamento && <Button variant="ghost" size="icon" disabled={busy} aria-label="Remover parada" onClick={() => removeParada(p)}>
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>}
              </div>
              <div className="mt-3 space-y-1"><Label htmlFor={`objetivo-${p.id}`}>Objetivo *</Label><Input id={`objetivo-${p.id}`} value={objetivos[p.id] ?? p.objetivo ?? ''} disabled={!planejamento || busy} onChange={e => setObjetivos(v => ({ ...v, [p.id]: e.target.value }))} placeholder="Ex.: apresentar LSB150" /></div>
              {prestacao && <PrestacaoParada parada={p} onSaved={recarregar} />}
              {rota.status === 'concluida' && <p className="text-sm mt-3">{p.visitada ? `Visitada — ${p.resultado}` : `Não visitada — ${p.motivo_nao_visita}`}</p>}
              </Card>
            ))}
          </div>
        </div>

        <Card className="overflow-hidden min-h-[400px] lg:min-h-0 flex flex-col">
          <div className="flex flex-wrap items-center gap-1.5 p-2 border-b" role="group" aria-label="Filtros de clientes no mapa">
            {([1, 2, 3, 4] as CategoriaMapa[]).map((c) => (
              <Button key={c} size="sm" variant={categoriasOn[c] ? "secondary" : "ghost"} aria-pressed={categoriasOn[c]}
                className={`h-7 px-2 text-xs ${categoriasOn[c] ? "" : "opacity-50"}`}
                onClick={() => setCategoriasOn((v) => ({ ...v, [c]: !v[c] }))}>
                <span className="inline-block w-2.5 h-2.5 rounded-full mr-1.5" style={{ backgroundColor: CATEGORIAS_MAPA[c].cor }} />
                {CATEGORIAS_MAPA[c].rotulo}
              </Button>
            ))}
            <Button size="sm" variant={soCaminho ? "default" : "outline"} aria-pressed={soCaminho} className="h-7 px-2 text-xs ml-auto"
              disabled={!calculo} onClick={() => setSoCaminho((v) => !v)}>
              Só no caminho ({raioKm} km)
            </Button>
            {carregandoSug && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
          </div>
          <div className="relative flex-1 min-h-[400px]">
            <div ref={mapRef} className="absolute inset-0" />
            <div className="absolute bottom-6 left-2 bg-background/95 border rounded-md shadow-sm p-2 text-xs space-y-1 pointer-events-none">
              {([1, 2, 3, 4] as CategoriaMapa[]).map((c) => (
                <div key={c} className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CATEGORIAS_MAPA[c].cor }} />{CATEGORIAS_MAPA[c].rotulo}</div>
              ))}
              <div className="flex items-center gap-1.5"><span className="inline-flex w-3.5 h-3.5 rounded-full bg-primary text-primary-foreground text-[8px] items-center justify-center font-bold">1</span>Paradas da rota</div>
              <div className="text-muted-foreground">{visiveisMapa.length} clientes no mapa</div>
            </div>
          </div>
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
