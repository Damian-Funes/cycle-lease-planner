import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import {
  getRota, getParadas, atualizarRota, adicionarParada, removerParada,
  reordenarParadas, atualizarParada, type RotaParada,
} from "@/lib/rotas";
import { loadGoogleMaps, getOrigemVendedor, calcularRota, erroRotaMensagem } from "@/lib/maps";
import { calcularViagem, type ViagemCalculada } from "@/lib/viagemRota";
import { diasDaViagem, ordenarParadasViagem, custoViagem, assinaturaTrajeto, parseValorBR } from "@/lib/viagem";
import { listVeiculos, getViagemParametros, precoLitro } from "@/lib/rotas";
import { supabase } from "@/integrations/supabase/client";
import CustoViagemCard from "@/components/rotas/CustoViagemCard";
import { Hotel } from "lucide-react";
import { linksGoogleMaps, linkWaze, formatarDuracao, formatarKm, rotaLonga, coordenadaValida } from "@/lib/rotaNavegacao";
import { AlertTriangle, Navigation, Loader2 } from "lucide-react";
import { posicaoInsercaoMaisBarata, textoMotivo } from "@/lib/rotaNavegacao";
import { buscarClientesMapa, medirClientes, filtrarNoCaminho, type ClienteMapa } from "@/lib/clientesNoCaminho";
import { objetivoPernoite } from "@/lib/viagem";
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
import { hojeRota, paradaInformada, validarEnvio, diaRota, paradasParaPrestar, type StatusRota } from '@/lib/rotasFluxo';
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
  const directionsRef = useRef<any[]>([]);
  const [mapaPronto, setMapaPronto] = useState(false);
  const [calculo, setCalculo] = useState<ViagemCalculada | null>(null);
  const [erroTrajeto, setErroTrajeto] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [novoObjetivo, setNovoObjetivo] = useState('');
  const [data, setData] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [veiculoId, setVeiculoId] = useState<string>("");
  const [alimentacao, setAlimentacao] = useState("");
  const [obs, setObs] = useState("");
  const [objetivos, setObjetivos] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [faltas, setFaltas] = useState<string[]>([]);

  const { data: rota, error: erroRota, isLoading: carregandoRota } = useQuery({
    queryKey: ["rota", id],
    enabled: !!id,
    queryFn: () => id ? getRota(id) : Promise.resolve(null),
  });

  const { data: paradasBrutas = [] } = useQuery({
    queryKey: ["rota-paradas", id],
    enabled: !!id,
    queryFn: () => id ? getParadas(id) : Promise.resolve([]),
  });
  const { data: veiculos = [] } = useQuery({ queryKey: ["veiculos"], queryFn: listVeiculos });
  const { data: parametros } = useQuery({ queryKey: ["viagem-parametros"], queryFn: getViagemParametros });

  const inicioRota = rota?.data_inicio ?? rota?.data_rota ?? "";
  const fimRotaSalvo = rota?.data_fim ?? inicioRota;
  const paradas = useMemo(() => ordenarParadasViagem(paradasBrutas), [paradasBrutas, inicioRota]);
  const dias = useMemo(() => diasDaViagem(inicioRota, fimRotaSalvo), [inicioRota, fimRotaSalvo]);
  const numeroDia = (d?: string | null) => Math.max(0, dias.indexOf(d ?? inicioRota)) + 1;

  useEffect(() => {
    if (rota) {
      setData(rota.data_inicio ?? rota.data_rota);
      setDataFim(rota.data_fim ?? rota.data_inicio ?? rota.data_rota);
      setObs(rota.observacoes ?? "");
      setAlimentacao(rota.alimentacao_dia_estimada != null ? String(rota.alimentacao_dia_estimada).replace(".", ",") : "");
    }
  }, [rota?.id, rota?.data_rota, rota?.data_fim, rota?.observacoes, rota?.alimentacao_dia_estimada]);
  useEffect(() => {
    if (!rota) return;
    setVeiculoId(rota.veiculo_id ?? veiculos.find((v) => v.vendedor_id === rota.vendedor_id && v.ativo)?.id ?? "");
  }, [rota?.id, rota?.veiculo_id, veiculos]);

  const planejamento = Boolean(rota && (rota.status === 'rascunho' || rota.status === 'reprovada' || (rota.status === 'aprovada' && inicioRota > hojeRota())));
  const prestacao = rota?.status === 'aprovada' && inicioRota <= hojeRota();

  // ---- Custo estimado ----
  const veiculo = veiculos.find((v) => v.id === veiculoId) ?? null;
  const alimentacaoNum = parseValorBR(alimentacao);
  const assinaturaAtual = rota ? assinaturaTrajeto(getOrigemVendedor(rota.vendedor_id, veiculos, veiculoId), paradas, inicioRota) : "";
  const pedagioValido = rota?.custo_pedagio_est != null && rota?.pedagio_assinatura === assinaturaAtual;
  const custo = custoViagem({
    km: calculo ? calculo.totalKm : (rota?.km_total_estimado ?? null),
    consumoKmL: veiculo ? Number(veiculo.consumo_km_l) : null,
    precoLitro: precoLitro(veiculo, parametros),
    pedagio: pedagioValido ? Number(rota!.custo_pedagio_est) : null,
    alimentacaoDia: Number.isFinite(alimentacaoNum) ? alimentacaoNum : null,
    dias: diasDaViagem(data || inicioRota, dataFim || fimRotaSalvo).length,
  });
  const avisoPedagio = pedagioValido
    ? `Pedágio consultado em ${new Date(rota!.pedagio_consultado_em!).toLocaleDateString("pt-BR")} (carro/caminhonete, 2 eixos).`
    : rota?.custo_pedagio_est != null ? "O trajeto mudou: o pedágio será consultado de novo ao enviar." : "O pedágio é consultado uma vez, ao enviar para aprovação.";
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
    for (const p of paradas) if (p.tipo === "pernoite" && !p.objetivo?.trim()) await atualizarParada(p.id, { objetivo: objetivoPernoite(p) });
    for (const p of paradas) if (p.tipo !== "pernoite" && objetivos[p.id] !== undefined && objetivos[p.id] !== (p.objetivo ?? '')) await atualizarParada(p.id, { objetivo: objetivos[p.id].trim() });
    setObjetivos({});
  }
  async function mudarStatus(status: StatusRota) {
    if (!id || !rota) return;
    if (status === 'aguardando_aprovacao') {
      const erros = validarEnvio(data, paradas.map(p => ({ ...p, objetivo: p.tipo === "pernoite" ? (p.objetivo?.trim() || objetivoPernoite(p)) : (objetivos[p.id] ?? p.objetivo) })), pendentes.find(p => p.id !== id), hojeRota(), dataFim);
      setFaltas(erros);
      if (erros.length) return;
    }
    await executar(async () => {
      if (status === 'aguardando_aprovacao') {
        await gravarPeriodo();
        await salvarObjetivos();
        await atualizarRota(id, {
          custo_combustivel_est: custo.combustivel, custo_hospedagem_est: custo.hospedagem,
          custo_alimentacao_est: custo.alimentacao, custo_total_est: custo.total,
          tempo_total_estimado_s: calculo ? Math.round(calculo.totalSegundos) : null,
        } as any);
        if (!pedagioValido) {
          const { data: ped, error: pe } = await supabase.functions.invoke("pedagio-viagem", { body: { rota_id: id } });
          if (pe || ped?.error) toast.warning("Pedágio indisponível agora", { description: "A viagem segue para aprovação sem o valor do pedágio." });
        }
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

  // Traçado pelas estradas, dia a dia: recalcula (sem otimizar) sempre que as paradas mudam
  const chaveParadas = paradas.map((p) => `${p.id}:${p.latitude}:${p.longitude}:${p.dia}:${p.tipo}`).join("|") + `#${inicioRota}:${fimRotaSalvo}`;
  const limparTracado = () => { directionsRef.current.forEach((d) => d.setMap(null)); directionsRef.current = []; };
  useEffect(() => {
    if (!rota) return;
    const valid = paradas.filter((p) => coordenadaValida(p.latitude, p.longitude));
    const invalidas = paradas.map((p, i) => ({ p, i })).filter(({ p }) => !coordenadaValida(p.latitude, p.longitude));
    const nomeParada = (p: RotaParada, i: number) => `parada ${i + 1} (${p.hotel_nome || p.organizacao?.nome_fantasia || p.organizacao?.nome || p.cidade || "sem nome"})`;
    setErroTrajeto(invalidas.length ? `Sem coordenada válida: ${invalidas.map(({ p, i }) => nomeParada(p, i)).join(", ")}. Ela ficou fora do trajeto.` : null);
    if (!valid.length) { setCalculo(null); limparTracado(); return; }
    let cancel = false;
    const t = setTimeout(async () => {
      try {
        const origem = getOrigemVendedor(rota.vendedor_id, veiculos, veiculoId);
        const r = await calcularViagem({ lat: origem.lat, lng: origem.lng }, paradas, inicioRota, fimRotaSalvo);
        if (cancel || !r) return;
        setCalculo(r);
        const g = (window as any).google;
        if (g && mapInstanceRef.current) {
          limparTracado();
          const cores = ["#059669", "#2563eb", "#d97706", "#7c3aed", "#db2777"];
          r.dias.forEach((d, i) => {
            const ren = new g.maps.DirectionsRenderer({ suppressMarkers: true, preserveViewport: true, polylineOptions: { strokeColor: cores[i % cores.length], strokeWeight: 4, strokeOpacity: 0.85 } });
            ren.setMap(mapInstanceRef.current); ren.setDirections(d.rota.result);
            directionsRef.current.push(ren);
          });
        }
        const km = Math.round(r.totalKm * 10) / 10;
        if (planejamento && id && (Number(rota.km_total_estimado ?? -1) !== km || rota.tempo_total_estimado_s !== Math.round(r.totalSegundos))) {
          atualizarRota(id, { km_total_estimado: km, tempo_total_estimado_s: Math.round(r.totalSegundos) } as any).then(() => qc.invalidateQueries({ queryKey: ["rota", id] })).catch(() => {});
        }
      } catch (e) {
        if (cancel) return;
        console.error("[calcularViagem]", e);
        setCalculo(null);
        limparTracado();
        setErroTrajeto(erroRotaMensagem(e, valid.map((p) => nomeParada(p, paradas.indexOf(p)))));
      }
    }, 600);
    return () => { cancel = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveParadas, rota?.vendedor_id, mapaPronto]);

  useEffect(() => () => limparTracado(), []);

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

  // ---- Layout: abas, destaque e ligação mapa ↔ lista (só apresentação) ----
  const [aba, setAba] = useState<"paradas" | "sugestoes" | "custo">("paradas");
  const [vistaMobile, setVistaMobile] = useState<"lista" | "mapa">("lista");
  const [destacadaId, setDestacadaId] = useState<string | null>(null);
  const paradaRefs = useRef(new Map<string, HTMLElement>());
  const paradaMarkersRef = useRef(new Map<string, any>());
  const irParaParadaRef = useRef<(pid: string) => void>();
  const destaqueTimer = useRef<number>();
  const destacar = (pid: string) => {
    setDestacadaId(pid);
    window.clearTimeout(destaqueTimer.current);
    destaqueTimer.current = window.setTimeout(() => setDestacadaId(null), 2000);
  };
  irParaParadaRef.current = (pid: string) => {
    setAba("paradas");
    setVistaMobile("lista");
    destacar(pid);
    window.setTimeout(() => paradaRefs.current.get(pid)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
  };
  function focarNoMapa(p: RotaParada) {
    const g = (window as any).google;
    const map = mapInstanceRef.current;
    const mk = paradaMarkersRef.current.get(p.id);
    destacar(p.id);
    if (!g || !map || !mk || !coordenadaValida(p.latitude, p.longitude)) { toast.info("Parada sem localização no mapa"); return; }
    map.panTo({ lat: Number(p.latitude), lng: Number(p.longitude) });
    map.setZoom(Math.max(map.getZoom() ?? 4, 11));
    mk.setAnimation(g.maps.Animation.BOUNCE);
    window.setTimeout(() => mk.setAnimation(null), 1400);
  }
  // Mapa redimensionado/mostrado (abas no celular): reenquadra para não ficar cinza
  useEffect(() => {
    const el = mapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const g = (window as any).google; const map = mapInstanceRef.current;
      if (g && map && el.offsetWidth > 0) g.maps.event.trigger(map, "resize");
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [mapaPronto]);

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

  const caminho = useMemo(() => calculo?.caminho ?? [], [calculo]);
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
        m.addListener("click", () => { abrirCard(c, m); setAba("sugestoes"); });
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
      const ordenadas = paradas;
      const validas = ordenadas.filter((p) => coordenadaValida(p.latitude, p.longitude));
      const origem = getOrigemVendedor(rota.vendedor_id, veiculos, veiculoId);
      const k = posicaoInsercaoMaisBarata({ lat: origem.lat, lng: origem.lng }, validas.map((p) => ({ lat: Number(p.latitude), lng: Number(p.longitude) })), { lat: s.lat, lng: s.lng });
      const antesDe = validas[k];
      const depoisDe = validas[k - 1];
      void antesDe; void depoisDe;
      const diaNova = inicioRota;
      void diaNova;
      // Sem "Visita planejada": a agenda só tem compromissos reais.
      const atividadeId = null;
      const nova = await adicionarParada({
        rota_id: id, ordem: paradas.length, organizacao_id: s.id, oportunidade_id: s.oportunidadeId,
        cidade: s.cidade, estado: s.estado, latitude: s.lat, longitude: s.lng, tipo: "visita",
        observacoes: null, atividade_id: atividadeId, concluida: false, objetivo,
      } as any);
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
    for (const [pid, t] of Object.entries(calculo.trechoPorId)) {
      const anteriorIdx = t.anteriorId ? paradas.findIndex((p) => p.id === t.anteriorId) : -1;
      const ant = anteriorIdx >= 0 ? paradas[anteriorIdx] : null;
      m[pid] = { distanciaM: t.distanciaM, duracaoS: t.duracaoS, desde: ant ? (ant.tipo === "pernoite" ? `desde o hotel (${ant.hotel_nome})` : `desde a parada ${anteriorIdx + 1}`) : "desde a base" };
    }
    return m;
  }, [calculo, paradas]);
  const resumoDia = useMemo(() => {
    const m: Record<string, { km: number; s: number; volta: { distanciaM: number; duracaoS: number } | null }> = {};
    calculo?.dias.forEach((d) => { m[d.plano.dia] = { km: d.km, s: d.segundos, volta: d.plano.destinoId === null ? d.rota.trechos[d.rota.trechos.length - 1] : null }; });
    return m;
  }, [calculo]);

  const origemNav = getOrigemVendedor(rota?.vendedor_id, veiculos, veiculoId);
  const linksMaps = linksGoogleMaps(
    { lat: origemNav.lat, lng: origemNav.lng },
    paradas.filter((p) => coordenadaValida(p.latitude, p.longitude)).map((p) => ({ lat: Number(p.latitude), lng: Number(p.longitude) }))
  );
  const linksPorDia = (calculo?.dias.length ?? 0) > 1 ? calculo!.dias.map((d) => {
    // origem → paradas → destino do dia (pernoite ou base)
    const enc = (p: { lat: number; lng: number }) => `${p.lat},${p.lng}`;
    const wps = d.plano.waypoints.map((w) => enc(w.p)).join("|");
    return { dia: d.plano.dia, url: `https://www.google.com/maps/dir/?api=1&origin=${enc(d.plano.origem)}&destination=${enc(d.plano.destino)}${wps ? `&waypoints=${encodeURIComponent(wps)}` : ""}&travelmode=driving` };
  }) : [];

  async function renderMap() {
    const g = (window as any).google;
    if (!g || !mapInstanceRef.current) return;
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    paradaMarkersRef.current.clear();

    const valid = paradas.filter((p) => coordenadaValida(p.latitude, p.longitude));

    const bounds = new g.maps.LatLngBounds();
    const path: any[] = [];

    // Marker de origem (base do vendedor)
    const origem = getOrigemVendedor(rota?.vendedor_id, veiculos, veiculoId);
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

    valid.forEach((p) => {
      const pos = { lat: Number(p.latitude), lng: Number(p.longitude) };
      const marker = new g.maps.Marker({
        position: pos,
        map: mapInstanceRef.current,
        title: p.tipo === "pernoite" ? `Pernoite: ${p.hotel_nome}` : undefined,
        zIndex: 1001, label: { text: p.tipo === "pernoite" ? "H" : String(paradas.indexOf(p) + 1), color: "white", fontWeight: "bold" },
      });
      marker.addListener("click", () => irParaParadaRef.current?.(p.id));
      paradaMarkersRef.current.set(p.id, marker);
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

  /** Grava período/veículo/alimentação (o dia das paradas é o dia realizado, gravado na prestação). */
  async function gravarPeriodo() {
    if (!id || !rota) return;
    if (!data) throw new Error("Informe a data de início.");
    const fim = dataFim && dataFim >= data ? dataFim : data;
    const ali = parseValorBR(alimentacao);
    await atualizarRota(id, {
      data_inicio: data, data_fim: fim, observacoes: obs || null, veiculo_id: veiculoId || null,
      alimentacao_dia_estimada: Number.isFinite(ali) && ali > 0 ? ali : null,
    } as any);
  }

  async function salvarMeta() {
    if (!id) return;
    await executar(async () => {
    await gravarPeriodo();
    await salvarObjetivos();
    qc.invalidateQueries({ queryKey: ["rota", id] });
    qc.invalidateQueries({ queryKey: ["rotas-minhas"] });
    toast.success("Rota salva");
    });
  }

  const proxOrdemRef = useRef(0);
  const proxOrdem = () => { const o = Math.max(paradas.length, proxOrdemRef.current); proxOrdemRef.current = o + 1; return o; };
  async function onAddOrg(org: any, cidade: any): Promise<boolean> {
    if (!id || !rota || !user) return false;
    try {
      // Sem "Visita planejada": a agenda só tem compromissos reais.
      const atividadeId = null;
      const nextOrdem = proxOrdem();
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
      } as any);
      qc.invalidateQueries({ queryKey: ["rota-paradas", id] });
      toast.success(`${org.nome_fantasia || org.nome} adicionada à rota`);
      recarregar();
      return true;
    } catch (e: any) {
      toast.error("Erro ao adicionar", { description: e?.message });
      return false;
    }
  }

  async function onAddProspeccao(cidade: any): Promise<boolean> {
    if (!id) return false;
    try {
      await adicionarParada({
        rota_id: id,
        ordem: proxOrdem(),
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
      } as any);
      qc.invalidateQueries({ queryKey: ["rota-paradas", id] });
      toast.success(`Prospecção em ${cidade.nome} adicionada à rota`);
      recarregar();
      return true;
    } catch (e: any) {
      toast.error("Erro", { description: e?.message });
      return false;
    }
  }

  async function removeParada(p: RotaParada) {
    await executar(async () => {
    await removerParada(p.id);
    qc.invalidateQueries({ queryKey: ["rota-paradas", id] });
    });
  }

  async function otimizar() {
    if (!id || !rota) return;
    if (!paradas.some((p) => coordenadaValida(p.latitude, p.longitude))) { toast.error("Adicione ao menos 1 parada"); return; }
    try {
      const origem = getOrigemVendedor(rota.vendedor_id, veiculos, veiculoId);
      const { planoPorDia } = await import("@/lib/viagem");
      const planos = planoPorDia({ lat: origem.lat, lng: origem.lng }, paradas, inicioRota, fimRotaSalvo);
      const novaOrdem: Record<string, number> = {};
      for (const pl of planos) {
        if (pl.waypoints.length < 2) continue;
        const r = await calcularRota(pl.origem, pl.waypoints.map((w) => w.p), true, pl.destino);
        if (!r) continue;
        const ordensDia = pl.waypoints.map((w) => paradas.find((p) => p.id === w.id)!.ordem).sort((a, b) => a - b);
        r.order.forEach((origIdx, newIdx) => { novaOrdem[pl.waypoints[origIdx].id] = ordensDia[newIdx]; });
      }
      const updates = Object.entries(novaOrdem).filter(([pid, o]) => paradas.find((p) => p.id === pid)?.ordem !== o).map(([pid, o]) => ({ id: pid, ordem: o }));
      if (updates.length) await reordenarParadas(updates);
      qc.invalidateQueries({ queryKey: ["rota-paradas", id] });
      toast.success(updates.length ? "Ordem otimizada" : "A ordem atual já é a melhor");
    } catch (e: any) {
      toast.error("Falha ao otimizar", { description: e?.message });
    }
  }

  const podeMover = (idx: number, dir: -1 | 1) => {
    const a = paradas[idx]; const b = paradas[idx + dir];
    return Boolean(a && b);
  };
  async function mover(p: RotaParada, dir: -1 | 1) {
    const sorted = [...paradas];
    const idx = sorted.findIndex((x) => x.id === p.id);
    const target = idx + dir;
    if (!podeMover(idx, dir)) return;
    [sorted[idx], sorted[target]] = [sorted[target], sorted[idx]];
    const updates = sorted.map((x, i) => ({ id: x.id, ordem: i })).filter((u, i) => sorted[i].ordem !== u.ordem);
    await executar(async () => { await reordenarParadas(updates); });
  }

  if (!rota) {
    return <div className="min-h-screen flex flex-col gap-3 items-center justify-center text-muted-foreground"><p>{erroRota ? (erroRota as { message?: string }).message : carregandoRota ? 'Carregando...' : 'Rota não encontrada.'}</p><Button variant="outline" onClick={() => navigate('/rotas')}>Voltar para rotas</Button></div>;
  }

  const numParadas = paradas.filter((p) => p.tipo !== "pernoite").length;
  const kmResumo = calculo ? formatarKm(calculo.totalKm * 1000) : rota.km_total_estimado != null ? `${Number(rota.km_total_estimado).toFixed(0)} km` : null;
  const podeEnviar = rota.status === 'rascunho' || rota.status === 'reprovada';
  const podeConcluir = prestacao && paradasParaPrestar(paradas).length > 0 && paradasParaPrestar(paradas).every(paradaInformada);

  const listaParadas = (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-sm">Paradas ({paradas.length})</h2>
        {planejamento && <Button size="sm" disabled={busy} onClick={() => setAddOpen(true)}><Plus className="w-4 h-4 mr-1" /> Adicionar Parada</Button>}
      </div>
      {planejamento && <p className="text-xs text-muted-foreground">Monte a lista de paradas do período. O dia de cada visita e onde dormiu são registrados durante a viagem.</p>}
      {paradas.length === 0 && (
        <Card className="p-6 text-center text-muted-foreground text-sm">
          <MapPin className="w-6 h-6 mx-auto mb-2 opacity-40" />
          Nenhuma parada. Adicione a primeira.
        </Card>
      )}
      {paradas.map((p, idx) => (
        <div key={p.id} className="space-y-2" ref={(el) => { if (el) paradaRefs.current.set(p.id, el); else paradaRefs.current.delete(p.id); }}>
        <Card className={`p-3 transition-shadow ${p.tipo === "pernoite" ? "border-dashed bg-muted/40" : ""} ${destacadaId === p.id ? "ring-2 ring-primary" : ""}`}>
        <div className="flex items-center gap-2">
          <div className="flex flex-col gap-0.5">
            {planejamento && <><Button size="icon" variant="ghost" aria-label="Mover parada para cima" onClick={() => mover(p, -1)} disabled={busy || !podeMover(idx, -1)} className="h-6 w-6">▲</Button>
            <Button size="icon" variant="ghost" aria-label="Mover parada para baixo" onClick={() => mover(p, 1)} disabled={busy || !podeMover(idx, 1)} className="h-6 w-6">▼</Button></>}
          </div>
          <button type="button" onClick={() => { focarNoMapa(p); }} aria-label={`Mostrar parada ${idx + 1} no mapa`} className="flex items-center gap-2 flex-1 min-w-0 text-left rounded-md hover:bg-muted/50 -m-1 p-1">
          <div className="w-7 h-7 shrink-0 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
            {p.tipo === "pernoite" ? <Hotel className="w-3.5 h-3.5" /> : idx + 1}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">
              {p.tipo === "pernoite" ? `Pernoite: ${p.hotel_nome ?? ""}` : (p.organizacao?.nome_fantasia || p.organizacao?.nome || '')}
            </div>
            {p.tipo === "pernoite" && p.valor_diaria_est != null && <div className="text-xs">Diária estimada: {formatBRL(Number(p.valor_diaria_est))}</div>}
            <div className="text-sm font-medium truncate">
              {p.cidade ?? "—"}{p.estado ? ` / ${p.estado}` : ""}
            </div>
            {trechoPorParada[p.id] && (
              <div className="text-xs text-muted-foreground">+ {formatarKm(trechoPorParada[p.id].distanciaM)} · {formatarDuracao(trechoPorParada[p.id].duracaoS)} {trechoPorParada[p.id].desde}</div>
            )}
            <div className="text-xs text-muted-foreground">
              <Badge variant={p.tipo === "prospeccao" ? "outline" : "secondary"} className="text-[10px]">
                {p.tipo === "prospeccao" ? "Prospecção" : p.tipo === "pernoite" ? "Pernoite" : "Visita"}
              </Badge>
            </div>
            {p.dia && p.visitada != null && <div className="text-xs text-muted-foreground">Informada em {diaRota(p.dia)}</div>}
          </div>
          </button>
          {coordenadaValida(p.latitude, p.longitude) && (
            <Button asChild variant="outline" size="sm" aria-label={`Abrir parada ${idx + 1} no Waze`}>
              <a href={linkWaze({ lat: Number(p.latitude), lng: Number(p.longitude) })} target="_blank" rel="noopener noreferrer">Waze</a>
            </Button>
          )}
          {planejamento && <Button variant="ghost" size="icon" disabled={busy} aria-label="Remover parada" onClick={() => removeParada(p)}>
            <Trash2 className="w-4 h-4 text-destructive" />
          </Button>}
        </div>
        {p.tipo !== "pernoite" && <div className="mt-3 space-y-1"><Label htmlFor={`objetivo-${p.id}`}>Objetivo *</Label><Input id={`objetivo-${p.id}`} value={objetivos[p.id] ?? p.objetivo ?? ''} disabled={!planejamento || busy} onChange={e => setObjetivos(v => ({ ...v, [p.id]: e.target.value }))} placeholder="Ex.: apresentar LSB150" /></div>}
        {prestacao && p.tipo !== "pernoite" && <PrestacaoParada parada={p} onSaved={recarregar} />}
        {rota.status === 'concluida' && p.tipo !== "pernoite" && <p className="text-sm mt-3">{p.visitada ? `Visitada — ${p.resultado}` : `Não visitada — ${p.motivo_nao_visita}`}</p>}
        </Card>
        {(idx === paradas.length - 1 || paradas[idx + 1].dia !== p.dia) && resumoDia[p.dia ?? ""]?.volta && (
          <p className="text-xs text-muted-foreground pl-2">Volta à base: + {formatarKm(resumoDia[p.dia ?? ""].volta!.distanciaM)} · {formatarDuracao(resumoDia[p.dia ?? ""].volta!.duracaoS)}</p>
        )}
        </div>
      ))}
    </div>
  );

  const painelCusto = (
    <div className="space-y-3">
      {(calculo || erroTrajeto || linksMaps.length > 0) ? (
        <Card className="p-3 space-y-2" aria-label="Resumo da rota">
          {calculo && <p className="font-semibold">{formatarKm(calculo.totalKm * 1000)} · {formatarDuracao(calculo.totalSegundos)} de direção{calculo.dias.length > 1 ? ` em ${calculo.dias.length} dias` : ""}</p>}
          {calculo && calculo.dias.length > 1 && (
            <ul className="text-sm space-y-0.5">
              {calculo.dias.map((d) => <li key={d.plano.dia}>Dia {numeroDia(d.plano.dia)} ({diaRota(d.plano.dia)}): {formatarKm(d.km * 1000)} · {formatarDuracao(d.segundos)}{rotaLonga(d.segundos) ? " ⚠" : ""}</li>)}
            </ul>
          )}
          {calculo && dias.length > 1 && <p className="text-xs text-muted-foreground">≈ {formatarDuracao(calculo.totalSegundos / dias.length)} de direção por dia em {dias.length} dias</p>}
          {calculo && dias.length === 1 && calculo.dias.filter((d) => rotaLonga(d.segundos)).map((d) => (
            <p key={d.plano.dia} className="flex items-center gap-2 text-sm rounded-md border border-warning/40 bg-warning/10 text-warning-foreground p-2"><AlertTriangle className="w-4 h-4 text-warning" /> Rota longa para um dia{calculo.dias.length > 1 ? ` (dia ${numeroDia(d.plano.dia)})` : ""}</p>
          ))}
          {erroTrajeto && <p className="text-sm text-destructive">{erroTrajeto}</p>}
          {linksPorDia.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {linksPorDia.map((l) => (
                <Button key={l.dia} asChild size="sm" variant="outline">
                  <a href={l.url} target="_blank" rel="noopener noreferrer"><Navigation className="w-4 h-4 mr-1" />Google Maps — Dia {numeroDia(l.dia)}</a>
                </Button>
              ))}
            </div>
          ) : linksMaps.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {linksMaps.map((url, i) => (
                <Button key={url} asChild size="sm" variant="outline">
                  <a href={url} target="_blank" rel="noopener noreferrer"><Navigation className="w-4 h-4 mr-1" />Abrir no Google Maps{linksMaps.length > 1 ? ` — Trecho ${i + 1}` : ""}</a>
                </Button>
              ))}
            </div>
          )}
        </Card>
      ) : <p className="text-sm text-muted-foreground">Adicione paradas para calcular o trajeto.</p>}
      <CustoViagemCard custo={custo} avisoPedagio={avisoPedagio} />
    </div>
  );

  const painelSugestoes = planejamento && calculo ? (
    <ClientesNoCaminho
      sugestoes={sugestoes} carregando={carregandoSug} erro={erroSug}
      raioKm={raioKm} onRaio={setRaioKm}
      selecionadaId={selecionadaId} onSelecionar={setSelecionadaId}
      onAdicionar={adicionarSugestao} busy={busy}
    />
  ) : <p className="text-sm text-muted-foreground">{planejamento ? "As sugestões aparecem quando a rota tiver ao menos uma parada com localização." : "Sugestões só aparecem durante o planejamento."}</p>;

  const abas: { k: typeof aba; rotulo: string }[] = [
    { k: "paradas", rotulo: `Paradas (${paradas.length})` },
    { k: "sugestoes", rotulo: `Sugestões${planejamento && calculo ? ` (${sugestoes.length})` : ""}` },
    { k: "custo", rotulo: "Custo e trajeto" },
  ];

  return (
    <div className="h-[100dvh] bg-muted/20 flex flex-col overflow-hidden">
      <header className="bg-background border-b shrink-0">
        <div className="px-4 py-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Button variant="ghost" size="icon" onClick={() => navigate("/rotas")} aria-label="Voltar"><ArrowLeft className="w-4 h-4" /></Button>
            <h1 className="font-semibold truncate">{prestacao ? 'Prestação de contas' : 'Rota Comercial'}</h1>
            <RotaStatus status={rota.status} />
          </div>
          <div className="flex items-center gap-3 text-sm" aria-label="Resumo da rota">
            <span className="hidden sm:inline text-muted-foreground">
              {[kmResumo, `${dias.length} ${dias.length > 1 ? "dias" : "dia"}`, `${numParadas} ${numParadas === 1 ? "parada" : "paradas"}`].filter(Boolean).join(" · ")}
            </span>
            <span className="font-semibold">{formatBRL(custo.total)}</span>
            <AppHeader />
          </div>
        </div>
        <div className="lg:hidden grid grid-cols-2 border-t" role="tablist" aria-label="Visualização">
          {(["lista", "mapa"] as const).map((v) => (
            <button key={v} role="tab" aria-selected={vistaMobile === v} onClick={() => setVistaMobile(v)}
              className={`py-2 text-sm font-medium border-b-2 ${vistaMobile === v ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>
              {v === "lista" ? "Lista" : "Mapa"}
            </button>
          ))}
        </div>
      </header>

      <main className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(380px,45%)_1fr]">
        <section className={`${vistaMobile === "lista" ? "flex" : "hidden"} lg:flex flex-col min-h-0 border-r bg-background/60`}>
          <div className="shrink-0 max-h-[45%] overflow-y-auto p-3 pb-2 space-y-2 border-b">
            {rota.status === 'reprovada' && <div className="border border-destructive bg-destructive/10 text-destructive p-2 rounded-md text-sm">Reprovada: {rota.motivo_reprovacao}</div>}
            {rota.status === 'aguardando_aprovacao' && <div className="border p-2 rounded-md flex items-center justify-between gap-2 text-sm"><span>Aguardando aprovação</span><Button size="sm" variant="outline" disabled={busy} onClick={() => mudarStatus('rascunho')}>Voltar para rascunho</Button></div>}
            {rota.status === 'aprovada' && !prestacao && <p className="text-sm text-primary">Viagem aprovada. Alterar o plano exigirá nova aprovação.</p>}
            {(rota.status === 'aprovada' || rota.status === 'concluida') && <div className="flex flex-wrap gap-2">{prestacao && rota.vendedor_id === user?.id && <Button size="sm" variant="outline" onClick={() => navigate(`/viagens/${id}/hoje`)}>Viagem de hoje (celular)</Button>}<Button size="sm" variant="outline" onClick={() => navigate(`/viagens/${id}/acompanhar`)}>Acompanhar · diário e gastos</Button></div>}

            <Card className="p-3 space-y-2">
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
                <div>
                  <Label htmlFor="rota-inicio" className="text-xs">Início</Label>
                  <Input id="rota-inicio" type="date" value={data} disabled={!planejamento || busy} onChange={(e) => { setData(e.target.value); if (!dataFim || dataFim < e.target.value) setDataFim(e.target.value); }} />
                </div>
                <div>
                  <Label htmlFor="rota-fim" className="text-xs">Fim</Label>
                  <Input id="rota-fim" type="date" value={dataFim} min={data} disabled={!planejamento || busy} onChange={(e) => setDataFim(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="rota-veiculo" className="text-xs">Veículo</Label>
                  <select id="rota-veiculo" className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50" value={veiculoId} disabled={!planejamento || busy} onChange={(e) => setVeiculoId(e.target.value)}>
                    <option value="">Sem veículo</option>
                    {veiculos.filter((v) => v.ativo || v.id === veiculoId).map((v) => <option key={v.id} value={v.id}>{v.modelo} · {v.combustivel} · {String(v.consumo_km_l).replace(".", ",")} km/L{v.placa ? ` · ${v.placa}` : ""}</option>)}
                  </select>
                </div>
                <div>
                  <Label htmlFor="rota-alimentacao" className="text-xs">Alimentação/dia (R$, opcional)</Label>
                  <Input id="rota-alimentacao" inputMode="decimal" value={alimentacao} disabled={!planejamento || busy} onChange={(e) => setAlimentacao(e.target.value)} placeholder="Ex.: 80,00" />
                </div>
              </div>
              {planejamento && (data !== inicioRota || (dataFim || data) !== fimRotaSalvo) && <p className="text-xs text-muted-foreground">Clique em Salvar para aplicar o novo período.</p>}
              <details>
                <summary className="text-xs text-muted-foreground cursor-pointer">Observações{obs ? " (preenchidas)" : ""}</summary>
                <Textarea className="mt-1" rows={2} value={obs} disabled={!planejamento || busy} onChange={(e) => setObs(e.target.value)} />
              </details>
            </Card>

            <div className="flex items-center gap-2">
            <div className="flex-1 bg-background border rounded-md p-1 grid grid-cols-3 gap-1" role="tablist" aria-label="Seções da rota">
              {abas.map((t) => (
                <button key={t.k} role="tab" aria-selected={aba === t.k} onClick={() => setAba(t.k)}
                  className={`text-xs sm:text-sm py-1.5 rounded ${aba === t.k ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground hover:bg-muted"}`}>
                  {t.rotulo}
                </button>
              ))}
            </div>
            {planejamento && aba === "paradas" && <Button size="sm" disabled={busy} onClick={() => setAddOpen(true)}><Plus className="w-4 h-4 mr-1" /> Adicionar</Button>}
            </div>
          </div>

          <div className="flex-1 min-h-[220px] overflow-y-auto p-3 bg-muted/30" aria-label="Lista da rota">
            <div hidden={aba !== "paradas"}>{listaParadas}</div>
            <div hidden={aba !== "sugestoes"}>{painelSugestoes}</div>
            <div hidden={aba !== "custo"}>{painelCusto}</div>
          </div>

          <div className="shrink-0 border-t bg-background p-2 space-y-2">
            {faltas.length > 0 && (
              <details className="border border-destructive bg-destructive/10 text-destructive rounded-md text-sm px-2 py-1">
                <summary className="cursor-pointer">{faltas.length} {faltas.length === 1 ? "pendência" : "pendências"} para enviar · ver faltas</summary>
                <ul className="list-disc pl-5 py-1">{faltas.map(f => <li key={f}>{f}</li>)}</ul>
              </details>
            )}
            <div className="flex flex-wrap gap-2 justify-end">
              {planejamento && <Button variant="outline" size="sm" onClick={() => executar(otimizar)} disabled={busy || paradas.length < 1}><Wand2 className="w-4 h-4 mr-1" /> Otimizar ordem</Button>}
              {isAdmin && rota.status === 'aprovada' && <Button size="sm" variant="outline" disabled={busy} onClick={() => { if (confirm('Cancelar esta viagem aprovada?')) mudarStatus('cancelada'); }}>Cancelar viagem</Button>}
              {planejamento && <Button size="sm" variant={podeEnviar ? "outline" : "default"} onClick={salvarMeta} disabled={busy}><Save className="w-4 h-4 mr-1" /> Salvar</Button>}
              {podeEnviar && <Button size="sm" disabled={busy} onClick={() => mudarStatus('aguardando_aprovacao')}>Enviar para aprovação</Button>}
              {prestacao && <Button size="sm" disabled={busy || !podeConcluir} onClick={async () => {
                const { count } = await (supabase as any).from('rota_gastos').select('id', { count: 'exact', head: true }).eq('rota_id', id);
                if (!count && !confirm('Nenhum gasto real foi lançado nesta viagem (combustível, pedágio, hotel...). Concluir mesmo assim?')) return;
                mudarStatus('concluida');
              }}>Concluir prestação de contas</Button>}
            </div>
          </div>
        </section>

        <section className={`${vistaMobile === "mapa" ? "flex" : "hidden"} lg:flex flex-col min-h-0`} aria-label="Mapa da rota">
        <div className="flex-1 min-h-0 flex flex-col bg-background">
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
          <div className="relative flex-1 min-h-0">
            <div ref={mapRef} className="absolute inset-0" />
            <div className="absolute bottom-6 left-2 bg-background/95 border rounded-md shadow-sm p-2 text-xs space-y-1 pointer-events-none">
              {([1, 2, 3, 4] as CategoriaMapa[]).map((c) => (
                <div key={c} className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CATEGORIAS_MAPA[c].cor }} />{CATEGORIAS_MAPA[c].rotulo}</div>
              ))}
              <div className="flex items-center gap-1.5"><span className="inline-flex w-3.5 h-3.5 rounded-full bg-primary text-primary-foreground text-[8px] items-center justify-center font-bold">1</span>Paradas da rota</div>
              <div className="text-muted-foreground">{visiveisMapa.length} clientes no mapa</div>
            </div>
          </div>
        </div>
        </section>
      </main>

      <AdicionarParadaModal
        open={addOpen}
        onOpenChange={setAddOpen}
        onSelectOrganizacao={onAddOrg}
        onAddProspeccao={onAddProspeccao}
        onObjetivo={setNovoObjetivo}
        orgIdsNaRota={paradas.map((p: any) => p.organizacao_id).filter(Boolean)}
      />
    </div>
  );
}
