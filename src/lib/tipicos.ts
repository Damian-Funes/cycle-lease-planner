export type TipicoTipo = "orcamento" | "aluguel";

export interface Tipico {
  id: string;
  nome: string;
  descricao: string | null;
  tipo: TipicoTipo;
  codigos: string[];
  capacidade_sacos_ano: number;
  valor_referencia: number;
  destacado: boolean;
  arquivado: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TipicoInput {
  nome: string;
  descricao?: string | null;
  tipo: TipicoTipo;
  codigos: string[];
  capacidade_sacos_ano: number;
  valor_referencia: number;
  destacado?: boolean;
}

export function formatSacosAno(v: number): string {
  return `${v.toLocaleString("pt-BR")} sc/ano`;
}
