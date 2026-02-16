export interface SmartCycleParams {
  clientName: string;
  implantacao: number;
  volumeMinAnual: number;
  pesoPorSaco: number;
  producaoReal: number;
  volumeMinF2Pct: number;
  tarifaF1: number;
  tarifaF2: number;
  tarifaExcedente: number;
  reajuste: number;
}

export interface YearProjection {
  ano: number;
  fase: 1 | 2;
  precoSaco: number;
  volumeMinimo: number;
  mensalidade: number;
  excedente: number;
  receitaExcedente: number;
  receitaAnual: number;
}

export const DEFAULT_PARAMS: SmartCycleParams = {
  clientName: "",
  implantacao: 2352756.99,
  volumeMinAnual: 222362,
  pesoPorSaco: 40,
  producaoReal: 222362,
  volumeMinF2Pct: 50,
  tarifaF1: 5.0,
  tarifaF2: 2.0,
  tarifaExcedente: 2.0,
  reajuste: 5.5,
};

export function calcProjection(p: SmartCycleParams): YearProjection[] {
  const rows: YearProjection[] = [];
  for (let ano = 1; ano <= 10; ano++) {
    const fase: 1 | 2 = ano <= 5 ? 1 : 2;
    const tarifa = fase === 1 ? p.tarifaF1 : p.tarifaF2;
    const exponent = fase === 1 ? ano - 1 : ano - 6;
    const precoSaco = tarifa * Math.pow(1 + p.reajuste / 100, exponent);
    const volumeMinimo = fase === 1 ? p.volumeMinAnual : Math.round(p.volumeMinAnual * (p.volumeMinF2Pct / 100));
    const receitaMinimo = volumeMinimo * precoSaco;
    const mensalidade = receitaMinimo / 12;
    const excedenteSacos = Math.max(0, p.producaoReal - volumeMinimo);
    const precoExcedente = p.tarifaExcedente * Math.pow(1 + p.reajuste / 100, ano - 1);
    const receitaExcedente = excedenteSacos * precoExcedente;
    const receitaAnual = receitaMinimo + receitaExcedente;
    rows.push({ ano, fase, precoSaco, volumeMinimo, mensalidade, excedente: excedenteSacos, receitaExcedente, receitaAnual });
  }
  return rows;
}

export function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatNumber(value: number): string {
  return value.toLocaleString("pt-BR");
}
