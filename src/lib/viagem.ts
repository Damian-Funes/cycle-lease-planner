// Viagens de vários dias: plano por dia, custo estimado e assinatura do trajeto (funções puras).

export type Coord = { lat: number; lng: number };
export type ParadaViagem = {
  id: string; dia?: string | null; ordem: number; tipo: string;
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

/** Ordem do trajeto: só a ordem das paradas (o dia não é planejado). Pernoites antigos ficam de fora. */
export function ordenarParadasViagem<T extends ParadaViagem>(paradas: T[], _inicio?: string): T[] {
  return paradas.filter((p) => p.tipo !== "pernoite").sort((a, b) => a.ordem - b.ordem);
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

/** Um único percurso: base → paradas na ordem → base. */
export function planoPorDia(base: Coord, paradas: ParadaViagem[], inicio: string, _fim?: string | null): PlanoDia[] {
  const ordenadas = ordenarParadasViagem(paradas.filter(valida));
  if (!ordenadas.length) return [];
  return [{ dia: inicio, origem: base, origemId: null, waypoints: ordenadas.map((p) => ({ id: p.id, p: coord(p) })), destino: base, destinoId: null, pernoiteId: null }];
}

/** Noites da viagem: de início até fim − 1. */
export function noitesDaViagem(inicio: string, fim?: string | null): string[] {
  return diasDaViagem(inicio, fim).slice(0, -1);
}

/** Noites ainda sem registro de "onde dormi" (espelha a regra de encerramento do banco). */
export function noitesSemRegistro(inicio: string, fim: string | null | undefined, registradas: string[]): string[] {
  const r = new Set(registradas);
  return noitesDaViagem(inicio, fim).filter((n) => !r.has(n));
}

export type TipoNoite = "hotel" | "sem_custo" | "voltou_base";
export const TIPOS_NOITE: { id: TipoNoite; nome: string; descricao: string }[] = [
  { id: "hotel", nome: "Hotel", descricao: "Paguei hospedagem (com nota)" },
  { id: "sem_custo", nome: "Sem custo", descricao: "Casa de cliente, parente ou alojamento" },
  { id: "voltou_base", nome: "Voltei para a base", descricao: "Dormi em casa" },
];

/** Espelha fn_pernoites_validar para avisos na tela. Retorna a lista de problemas. */
export function validarNoite(n: { tipo: TipoNoite; cidade?: string | null; estado?: string | null; hotel_nome?: string | null; valor?: number | null; temNota?: boolean; observacao?: string | null }): string[] {
  const e: string[] = [];
  const vazio = (t?: string | null) => !t || !t.trim();
  if (n.tipo !== "voltou_base" && (vazio(n.cidade) || !/^[A-Z]{2}$/.test(n.estado ?? ""))) e.push("Informe cidade e UF de onde dormiu.");
  if (n.tipo === "hotel") {
    if (vazio(n.hotel_nome)) e.push("Informe o nome do hotel.");
    if (!(n.valor != null && n.valor > 0)) e.push("Informe o valor pago.");
    if (!n.temNota) e.push("Anexe a foto da nota.");
  } else if (vazio(n.observacao)) e.push("Explique por que não houve hotel nesta noite.");
  return e;
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
  pedagio: number | null; diarias?: (number | null | undefined)[];
  alimentacaoDia: number | null; dias: number;
}): CustoViagem {
  const litros = i.km != null && i.consumoKmL && i.consumoKmL > 0 ? i.km / i.consumoKmL : null;
  const combustivel = litros != null && i.precoLitro != null ? round2(litros * i.precoLitro) : null;
  const hospedagem = round2((i.diarias ?? []).reduce<number>((a, v) => a + Number(v ?? 0), 0));
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

/** Objetivo automático de um pernoite (os triggers exigem objetivo em todas as paradas). */
export function objetivoPernoite(p: { hotel_nome?: string | null; cidade?: string | null }): string {
  const hotel = p.hotel_nome?.trim();
  if (hotel) return `Pernoite — ${hotel}`;
  return `Pernoite em ${p.cidade?.trim() || "hotel"}`;
}

/** Data (YYYY-MM-DD) em America/Sao_Paulo de um instante ISO. */
export function diaBRT(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

/** Histórico por dia real: paradas informadas (dia gravado pelo banco), informativos, gastos e pernoite da noite. */
export function agruparPorDiaRealizado<
  P extends { dia?: string | null; visitada?: boolean | null; tipo: string },
  I extends { registrado_em: string },
  G extends { data: string },
  N extends { noite: string },
>(dias: string[], paradas: P[], diario: I[], gastos: G[], pernoites: N[]) {
  return dias.map((dia) => ({
    dia,
    paradas: paradas.filter((p) => p.tipo !== "pernoite" && p.visitada != null && p.dia === dia),
    informativos: diario.filter((i) => diaBRT(i.registrado_em) === dia),
    gastos: gastos.filter((g) => g.data === dia),
    pernoite: pernoites.find((n) => n.noite === dia) ?? null,
  }));
}
