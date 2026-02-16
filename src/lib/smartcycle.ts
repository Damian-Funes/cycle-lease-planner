export interface SmartCycleParams {
  clientName: string;
  valorProjeto: number;
  entrada: number;
  pesoPorSaco: number;
  volumeMinF2Pct: number;
  tarifaF1: number;
  tarifaF2: number;
  tarifaExcedente: number;
  reajuste: number;
  status: string;
  observacoes: string;
}

export interface YearProjection {
  ano: number;
  fase: 1 | 2;
  precoSaco: number;
  volumeMinimo: number;
  mensalidade: number;
  receitaAnual: number;
}

export const DEFAULT_PARAMS: SmartCycleParams = {
  clientName: "",
  valorProjeto: 5500000,
  entrada: 2352756.99,
  pesoPorSaco: 40,
  volumeMinF2Pct: 50,
  tarifaF1: 5.0,
  tarifaF2: 2.0,
  tarifaExcedente: 2.0,
  reajuste: 5.5,
  status: "rascunho",
  observacoes: "",
};

export function calcSomaFatores(reajuste: number, anos: number = 5): number {
  let soma = 0;
  for (let i = 0; i < anos; i++) {
    soma += Math.pow(1 + reajuste / 100, i);
  }
  return soma;
}

export function calcDivida(p: SmartCycleParams): number {
  return p.valorProjeto - p.entrada;
}

export function calcVolumeMinimoAnual(p: SmartCycleParams): number {
  const divida = calcDivida(p);
  const somaFatores = calcSomaFatores(p.reajuste, 5);
  if (p.tarifaF1 <= 0 || somaFatores <= 0) return 0;
  return Math.ceil(divida / (p.tarifaF1 * somaFatores));
}

export function calcProjection(p: SmartCycleParams): YearProjection[] {
  const volumeMinAnual = calcVolumeMinimoAnual(p);
  const rows: YearProjection[] = [];
  for (let ano = 1; ano <= 10; ano++) {
    const fase: 1 | 2 = ano <= 5 ? 1 : 2;
    const tarifa = fase === 1 ? p.tarifaF1 : p.tarifaF2;
    const exponent = fase === 1 ? ano - 1 : ano - 6;
    const precoSaco = tarifa * Math.pow(1 + p.reajuste / 100, exponent);
    const volumeMinimo = fase === 1 ? volumeMinAnual : Math.round(volumeMinAnual * (p.volumeMinF2Pct / 100));
    const receitaMinimo = volumeMinimo * precoSaco;
    const mensalidade = receitaMinimo / 12;
    const receitaAnual = receitaMinimo;
    rows.push({ ano, fase, precoSaco, volumeMinimo, mensalidade, receitaAnual });
  }
  return rows;
}

export function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatNumber(value: number): string {
  return value.toLocaleString("pt-BR");
}
