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

// ---------- Clientes no caminho ----------
const R_KM = 6371;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversineKm(a: Ponto, b: Ponto): number {
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(rad(a.lat)) * Math.cos(rad(b.lat));
  return 2 * R_KM * Math.asin(Math.sqrt(x));
}

/**
 * Distância mínima (km) do ponto ao trajeto (polilinha) com projeção equiretangular local,
 * e posição ao longo do trajeto (km acumulados até o ponto mais próximo).
 */
export function distanciaAoTrajeto(p: Ponto, caminho: Ponto[]): { km: number; posicaoKm: number } {
  if (!caminho.length) return { km: Infinity, posicaoKm: 0 };
  if (caminho.length === 1) return { km: haversineKm(p, caminho[0]), posicaoKm: 0 };
  const cosLat = Math.cos(rad(p.lat));
  const xy = (q: Ponto) => ({ x: rad(q.lng - p.lng) * cosLat * R_KM, y: rad(q.lat - p.lat) * R_KM });
  let melhor = Infinity, posicao = 0, acumulado = 0;
  for (let i = 0; i < caminho.length - 1; i++) {
    const a = xy(caminho[i]), b = xy(caminho[i + 1]);
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / len2));
    const cx = a.x + t * dx, cy = a.y + t * dy;
    const d = Math.sqrt(cx * cx + cy * cy);
    const segLen = Math.sqrt(len2);
    if (d < melhor) { melhor = d; posicao = acumulado + t * segLen; }
    acumulado += segLen;
  }
  return { km: melhor, posicaoKm: posicao };
}

/**
 * Índice (0..paradas.length) onde inserir `novo` em base → paradas → base com menor acréscimo de km.
 */
export function posicaoInsercaoMaisBarata(base: Ponto, paradas: Ponto[], novo: Ponto): number {
  const pts = [base, ...paradas, base];
  let melhor = 0, menor = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const custo = haversineKm(pts[i], novo) + haversineKm(novo, pts[i + 1]) - haversineKm(pts[i], pts[i + 1]);
    if (custo < menor - 1e-9) { menor = custo; melhor = i; }
  }
  return melhor;
}

export type MotivoSugestao =
  | { prioridade: 1; tipo: "deal_parado"; dealTitulo: string; dealValor: number; numeroOrcamento?: string | null; atividadeAtrasada: boolean }
  | { prioridade: 2; tipo: "deal_aberto"; dealTitulo: string; dealValor: number; numeroOrcamento?: string | null }
  | { prioridade: 3; tipo: "sem_contato"; dias: number | null }
  | { prioridade: 4; tipo: "territorio" };

export const DIAS_SEM_CONTATO = 60;

export function classificarMotivo(input: {
  deal?: { titulo: string; valor: number; proximaAtividadeEm: string | null; numeroOrcamento?: string | null } | null;
  carteiraDoVendedor: boolean;
  ultimoContato: string | null;
  agora?: Date;
}): MotivoSugestao {
  const agora = input.agora ?? new Date();
  const { deal } = input;
  if (deal) {
    const prox = deal.proximaAtividadeEm ? new Date(deal.proximaAtividadeEm) : null;
    if (!prox || prox < agora) return { prioridade: 1, tipo: "deal_parado", dealTitulo: deal.titulo, dealValor: deal.valor, numeroOrcamento: deal.numeroOrcamento, atividadeAtrasada: !!prox };
    return { prioridade: 2, tipo: "deal_aberto", dealTitulo: deal.titulo, dealValor: deal.valor, numeroOrcamento: deal.numeroOrcamento };
  }
  if (input.carteiraDoVendedor) {
    if (!input.ultimoContato) return { prioridade: 3, tipo: "sem_contato", dias: null };
    const dias = Math.floor((agora.getTime() - new Date(input.ultimoContato).getTime()) / 86400000);
    if (dias > DIAS_SEM_CONTATO) return { prioridade: 3, tipo: "sem_contato", dias };
  }
  return { prioridade: 4, tipo: "territorio" };
}

export function textoMotivo(m: MotivoSugestao, brl: (v: number) => string): string {
  switch (m.tipo) {
    case "deal_parado": return `Deal aberto: ${m.dealTitulo} (${brl(m.dealValor)}) — ${m.atividadeAtrasada ? "atividade atrasada" : "sem próxima atividade"}`;
    case "deal_aberto": return `Deal aberto: ${m.dealTitulo} (${brl(m.dealValor)})`;
    case "sem_contato": return m.dias == null ? "Cliente da carteira — nunca visitado" : `Cliente da carteira — sem contato há ${m.dias} dias`;
    default: return "Organização do seu território";
  }
}

export function objetivoSugerido(m: MotivoSugestao): string {
  switch (m.tipo) {
    case "deal_parado":
    case "deal_aberto": return `Retomar negociação ${m.numeroOrcamento || m.dealTitulo}`;
    case "sem_contato": return m.dias == null ? "Primeira visita ao cliente" : "Retomar contato com o cliente";
    default: return "Apresentar a LS e levantar necessidades";
  }
}

export function ordenarSugestoes<T extends { motivo: MotivoSugestao; posicaoKm: number }>(lista: T[]): T[] {
  return [...lista].sort((a, b) => a.motivo.prioridade - b.motivo.prioridade || a.posicaoKm - b.posicaoKm);
}
