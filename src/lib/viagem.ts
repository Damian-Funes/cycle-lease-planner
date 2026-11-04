// Viagens de vários dias: plano por dia, custo estimado e assinatura do trajeto (funções puras).

export type Coord = { lat: number; lng: number };
export type ParadaViagem = {
  id: string; dia: string | null; ordem: number; tipo: string;
  latitude: number | null; longitude: number | null;
  valor_diaria_est?: number | null;
};

const valida = (p: { latitude: number | null; longitude: number | null }) =>
  p.latitude != null && p.longitude != null && Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude))
  && !(Number(p.latitude) === 0 && Number(p.longitude) === 0)
  && Math.abs(Number(p.latitude)) <= 90 && Math.abs(Number(p.longitude)) <= 180;
const coord = (p: { latitude: number | null; longitude: number | null }): Coord => ({ lat: Number(p.latitude), lng: Number(p.longitude) });

/** Datas YYYY-MM-DD de início a fim (inclusive). */
export function diasDaViagem(inicio: string, fim?: string | null): string[] {
  if (!inicio) return [];
  const out: string[] = [];
  const d = new Date(`${inicio}T12:00:00Z`);
  const f = new Date(`${(fim && fim >= inicio ? fim : inicio)}T12:00:00Z`);
  while (d <= f && out.length < 31) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
}

/** Ordem da viagem: dia, depois paradas comuns, pernoite por último no dia, depois ordem. */
export function ordenarParadasViagem<T extends ParadaViagem>(paradas: T[], inicio: string): T[] {
  return [...paradas].sort((a, b) =>
    (a.dia ?? inicio).localeCompare(b.dia ?? inicio)
    || Number(a.tipo === "pernoite") - Number(b.tipo === "pernoite")
    || a.ordem - b.ordem);
}

export type PlanoDia = {
  dia: string;
  origem: Coord;
  origemId: string | null;           // null = base
  waypoints: { id: string; p: Coord }[];
  destino: Coord;
  destinoId: string | null;          // null = volta à base
  pernoiteId: string | null;
};

/**
 * Percurso de cada dia: começa na base (1º dia) ou no ponto final da véspera;
 * termina no pernoite do dia, na base (último dia) ou na última parada do dia.
 * Dias sem nenhuma parada com coordenada ficam de fora.
 */
export function planoPorDia(base: Coord, paradas: ParadaViagem[], inicio: string, fim?: string | null): PlanoDia[] {
  const dias = diasDaViagem(inicio, fim);
  const ultimo = dias[dias.length - 1];
  const ordenadas = ordenarParadasViagem(paradas.filter(valida), inicio);
  const planos: PlanoDia[] = [];
  let origem = base; let origemId: string | null = null;
  for (const dia of dias) {
    const doDia = ordenadas.filter((p) => (p.dia ?? inicio) === dia);
    const pernoite = doDia.find((p) => p.tipo === "pernoite") ?? null;
    const comuns = doDia.filter((p) => p.tipo !== "pernoite");
    if (!doDia.length && dia !== ultimo) continue;
    let destino: Coord; let destinoId: string | null; let waypoints = comuns;
    if (pernoite) { destino = coord(pernoite); destinoId = pernoite.id; }
    else if (dia === ultimo) { destino = base; destinoId = null; }
    else { const u = comuns[comuns.length - 1]; destino = coord(u); destinoId = u.id; waypoints = comuns.slice(0, -1); }
    if (!waypoints.length && destinoId === null && origemId === null) continue; // base → base sem nada
    planos.push({ dia, origem, origemId, waypoints: waypoints.map((p) => ({ id: p.id, p: coord(p) })), destino, destinoId, pernoiteId: pernoite?.id ?? null });
    origem = destino; origemId = destinoId;
    if (destinoId === null) break;
  }
  return planos;
}

/** Texto que identifica o trajeto; muda só quando pontos ou ordem mudam. Igual ao da função de pedágio. */
export function assinaturaTrajeto(base: Coord, paradas: ParadaViagem[], inicio: string): string {
  const pts = [base, ...ordenarParadasViagem(paradas.filter(valida), inicio).map(coord), base];
  return pts.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join("|");
}

export type CustoViagem = {
  combustivel: number | null; pedagio: number | null; hospedagem: number;
  alimentacao: number | null; total: number; litros: number | null;
};

export function custoViagem(i: {
  km: number | null; consumoKmL: number | null; precoLitro: number | null;
  pedagio: number | null; diarias: (number | null | undefined)[];
  alimentacaoDia: number | null; dias: number;
}): CustoViagem {
  const litros = i.km != null && i.consumoKmL && i.consumoKmL > 0 ? i.km / i.consumoKmL : null;
  const combustivel = litros != null && i.precoLitro != null ? round2(litros * i.precoLitro) : null;
  const hospedagem = round2(i.diarias.reduce<number>((a, v) => a + Number(v ?? 0), 0));
  const alimentacao = i.alimentacaoDia != null && i.alimentacaoDia > 0 ? round2(i.alimentacaoDia * Math.max(1, i.dias)) : null;
  const total = round2((combustivel ?? 0) + (i.pedagio ?? 0) + hospedagem + (alimentacao ?? 0));
  return { combustivel, pedagio: i.pedagio, hospedagem, alimentacao, total, litros };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** "1.250,50" → 1250.5; vazio/ inválido → NaN. */
export function parseValorBR(txt: string): number {
  const t = String(txt ?? "").trim().replace(/[R$\s]/g, "");
  if (!t) return NaN;
  const norm = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  const n = Number(norm);
  return Number.isFinite(n) ? n : NaN;
}
