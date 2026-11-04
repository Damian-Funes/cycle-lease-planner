// Google Maps loader + helpers (geocoding, distância, otimização)
let loaderPromise: Promise<any> | null = null;

export function loadGoogleMaps(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject();
  const g = (window as any).google;
  if (g?.maps?.Geocoder && g?.maps?.geometry && g?.maps?.places) return Promise.resolve(g);
  if (loaderPromise) return loaderPromise;

  const key = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY;
  const channel = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID;
  if (!key) return Promise.reject(new Error("Google Maps key indisponível"));

  loaderPromise = new Promise((resolve, reject) => {
    (window as any).__gmapsRotasInit = () => resolve((window as any).google);
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&loading=async&libraries=places,geometry&callback=__gmapsRotasInit${channel ? `&channel=${channel}` : ""}`;
    s.async = true;
    s.onerror = () => reject(new Error("Falha ao carregar Google Maps"));
    document.head.appendChild(s);
  });
  return loaderPromise;
}

export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const g = await loadGoogleMaps();
    const geocoder = new g.maps.Geocoder();
    const res: any = await geocoder.geocode({ address, region: "br" });
    const r = res?.results?.[0];
    if (!r) return null;
    const loc = r.geometry.location;
    return { lat: loc.lat(), lng: loc.lng() };
  } catch (e) {
    console.warn("[geocode]", e);
    return null;
  }
}

// Haversine — distância em km
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(x));
}

// Bases de origem por vendedor (default: Maringá-PR)
export const MARINGA = { lat: -23.4253, lng: -51.9386, nome: "Maringá - PR" };


export type VeiculoBase = { id: string; vendedor_id: string | null; ativo?: boolean; base_nome?: string | null; base_lat?: number | string | null; base_lng?: number | string | null };

function baseDe(v?: VeiculoBase | null) {
  if (!v || v.base_lat == null || v.base_lng == null || v.base_lat === "" || v.base_lng === "") return null;
  const lat = Number(v.base_lat), lng = Number(v.base_lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng, nome: v.base_nome?.trim() || "Base" };
}

/** Base de saída: veículo da viagem → veículo ativo do vendedor → Maringá. */
export function getOrigemVendedor(vendedorId?: string | null, veiculos: VeiculoBase[] = [], veiculoId?: string | null) {
  const daViagem = veiculoId ? baseDe(veiculos.find((v) => v.id === veiculoId)) : null;
  if (daViagem) return daViagem;
  const doVendedor = vendedorId ? veiculos.filter((v) => v.vendedor_id === vendedorId).sort((a, b) => Number(b.ativo !== false) - Number(a.ativo !== false)).map(baseDe).find(Boolean) : null;
  return doVendedor ?? MARINGA;
}

export type TrechoRota = { distanciaM: number; duracaoS: number };
export type RotaCalculada = {
  result: any; // google.maps.DirectionsResult
  order: number[];
  totalKm: number;
  totalSegundos: number;
  trechos: TrechoRota[]; // trechos[i] = chegada à parada i (na ordem final); último = volta à base
};

/** Rota pelas estradas (DRIVING): origem → paradas → destino (padrão: volta à origem). */
export async function calcularRota(
  origem: { lat: number; lng: number },
  paradas: { lat: number; lng: number }[],
  otimizar: boolean,
  destino?: { lat: number; lng: number }
): Promise<RotaCalculada | null> {
  if (paradas.length < 1 && !destino) return null;
  const g = await loadGoogleMaps();
  const ds = new g.maps.DirectionsService();
  const res: any = await ds.route({
    origin: { lat: origem.lat, lng: origem.lng },
    destination: destino ? { lat: destino.lat, lng: destino.lng } : { lat: origem.lat, lng: origem.lng },
    waypoints: paradas.map((p) => ({ location: { lat: p.lat, lng: p.lng }, stopover: true })),
    optimizeWaypoints: otimizar,
    travelMode: g.maps.TravelMode.DRIVING,
  });
  const route = res?.routes?.[0];
  if (!route) return null;
  const wp: number[] = route.waypoint_order ?? [];
  const order = otimizar && wp.length ? wp : paradas.map((_, i) => i);
  const trechos: TrechoRota[] = route.legs.map((l: any) => ({ distanciaM: l.distance?.value ?? 0, duracaoS: l.duration?.value ?? 0 }));
  const totalM = trechos.reduce((a, t) => a + t.distanciaM, 0);
  const totalSegundos = trechos.reduce((a, t) => a + t.duracaoS, 0);
  return { result: res, order, totalKm: totalM / 1000, totalSegundos, trechos };
}

export async function optimizeRoute(
  paradas: { lat: number; lng: number }[],
  origem: { lat: number; lng: number } = MARINGA
): Promise<{ order: number[]; totalKm: number } | null> {
  const r = await calcularRota(origem, paradas, true);
  return r ? { order: r.order, totalKm: r.totalKm } : null;
}

/** Mensagem legível para falhas do DirectionsService. */
export function erroRotaMensagem(e: any, nomes: string[]): string {
  const code = e?.code || e?.message || "";
  if (/NOT_FOUND|ZERO_RESULTS/.test(code)) return `O Google não encontrou rota de carro para uma das paradas (${nomes.join(", ")}). Confira as coordenadas.`;
  if (/REQUEST_DENIED/.test(code)) return "O Google recusou o cálculo de rota (permissão da chave de mapas).";
  if (/MAX_WAYPOINTS/.test(code)) return "Paradas demais para calcular a rota de uma vez.";
  return "Não foi possível calcular o trajeto pelas estradas.";
}
