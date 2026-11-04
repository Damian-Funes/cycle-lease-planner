// Helpers puros para navegação/resumo da rota (sem Google Maps)
export type Ponto = { lat: number; lng: number };

const fmt = (p: Ponto) => `${p.lat},${p.lng}`;

/** Divide base → paradas → base em trechos de até 9 waypoints (limite do link do Google Maps). */
export function linksGoogleMaps(base: Ponto, paradas: Ponto[], maxWaypoints = 9): string[] {
  if (!paradas.length) return [];
  const pontos = [base, ...paradas, base];
  const passo = maxWaypoints + 1;
  const links: string[] = [];
  for (let i = 0; i < pontos.length - 1; i += passo) {
    const trecho = pontos.slice(i, Math.min(i + passo + 1, pontos.length));
    const origem = trecho[0];
    const destino = trecho[trecho.length - 1];
    const wps = trecho.slice(1, -1);
    let url = `https://www.google.com/maps/dir/?api=1&origin=${fmt(origem)}&destination=${fmt(destino)}`;
    if (wps.length) url += `&waypoints=${encodeURIComponent(wps.map(fmt).join("|"))}`;
    links.push(url + "&travelmode=driving");
  }
  return links;
}

export function linkWaze(p: Ponto): string {
  return `https://waze.com/ul?ll=${fmt(p)}&navigate=yes`;
}

/** 31200 s → "8h40"; 1800 → "30 min" */
export function formatarDuracao(segundos: number): string {
  const totalMin = Math.round(segundos / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} min`;
  return `${h}h${String(m).padStart(2, "0")}`;
}

export function formatarKm(metros: number): string {
  return `${Math.round(metros / 1000).toLocaleString("pt-BR")} km`;
}

export const LIMITE_DIRECAO_DIA_S = 10 * 3600;
export const rotaLonga = (segundos: number) => segundos > LIMITE_DIRECAO_DIA_S;

export function coordenadaValida(lat: unknown, lng: unknown): boolean {
  if (lat === null || lat === undefined || lng === null || lng === undefined || lat === "" || lng === "") return false;
  const a = Number(lat), b = Number(lng);
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180 && !(a === 0 && b === 0);
}
