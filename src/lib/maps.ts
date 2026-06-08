// Google Maps loader + helpers (geocoding, distância, otimização)
let loaderPromise: Promise<typeof google> | null = null;

export function loadGoogleMaps(): Promise<typeof google> {
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

export async function optimizeRoute(
  paradas: { lat: number; lng: number }[]
): Promise<{ order: number[]; totalKm: number } | null> {
  if (paradas.length < 2) return null;
  const g = await loadGoogleMaps();
  const ds = new g.maps.DirectionsService();
  const origin = paradas[0];
  const destination = paradas[paradas.length - 1];
  const waypoints = paradas.slice(1, -1).map((p) => ({ location: { lat: p.lat, lng: p.lng }, stopover: true }));
  const res: any = await ds.route({
    origin,
    destination,
    waypoints,
    optimizeWaypoints: true,
    travelMode: g.maps.TravelMode.DRIVING,
  });
  const route = res.routes?.[0];
  if (!route) return null;
  const wpOrder: number[] = route.waypoint_order ?? [];
  // ordem final: [0, ...wpOrder+1, last]
  const order = [0, ...wpOrder.map((i) => i + 1), paradas.length - 1];
  // dedup caso só haja 2 paradas
  const unique = Array.from(new Set(order));
  const totalKm = route.legs.reduce((acc: number, leg: any) => acc + (leg.distance?.value ?? 0), 0) / 1000;
  return { order: unique, totalKm };
}
