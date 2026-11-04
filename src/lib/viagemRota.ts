import { calcularRota, type RotaCalculada } from "./maps";
import { planoPorDia, type Coord, type ParadaViagem, type PlanoDia } from "./viagem";

export type DiaCalculado = {
  plano: PlanoDia; rota: RotaCalculada; km: number; segundos: number;
  chegadas: (string | null)[]; // id que cada trecho alcança (null = base)
};
export type ViagemCalculada = {
  dias: DiaCalculado[]; totalKm: number; totalSegundos: number; caminho: Coord[];
  trechoPorId: Record<string, { distanciaM: number; duracaoS: number; anteriorId: string | null }>;
};

/** Calcula o traçado pelas estradas dia a dia (reaproveita calcularRota). */
export async function calcularViagem(base: Coord, paradas: ParadaViagem[], inicio: string, fim?: string | null): Promise<ViagemCalculada | null> {
  const planos = planoPorDia(base, paradas, inicio, fim);
  if (!planos.length) return null;
  const dias: DiaCalculado[] = [];
  for (const plano of planos) {
    const rota = await calcularRota(plano.origem, plano.waypoints.map((w) => w.p), false, plano.destino);
    if (!rota) continue;
    dias.push({
      plano, rota,
      km: rota.totalKm, segundos: rota.totalSegundos,
      chegadas: [...plano.waypoints.map((w) => w.id), plano.destinoId],
    });
  }
  const trechoPorId: ViagemCalculada["trechoPorId"] = {};
  for (const d of dias) {
    d.chegadas.forEach((id, i) => {
      if (!id) return;
      const anteriorId = i === 0 ? d.plano.origemId : d.chegadas[i - 1];
      trechoPorId[id] = { ...d.rota.trechos[i], anteriorId };
    });
  }
  const caminho = dias.flatMap((d) => (d.rota.result?.routes?.[0]?.overview_path ?? []).map((ll: any) => ({ lat: ll.lat(), lng: ll.lng() })));
  return {
    dias, trechoPorId, caminho,
    totalKm: dias.reduce((a, d) => a + d.km, 0),
    totalSegundos: dias.reduce((a, d) => a + d.segundos, 0),
  };
}
