export interface ModeloCapacidade {
  id: string; modelo: string; kg_batelada: number; ordem: number; ativo: boolean; tipico_id: string | null;
}
export interface ParametrosCapacidade {
  tempo_receita_padrao_s: number; horas_trabalhadas_padrao: number; horas_perdidas_padrao: number;
  horas_perdidas_lotes_desorganizados: number; folga_minima: number;
  peso_soja: number | null; peso_milho: number | null; peso_trigo: number | null;
}
export interface EntradaCapacidade {
  cultura: string; sacos_safra: number; kg_por_saco: number; janela_dias: number;
  horas_trabalhadas_dia: number; lotes_liberados_dia_anterior: boolean; horas_perdidas_dia: number;
  tempo_receita_s: number; num_produtos_liquidos: number; usa_po: boolean;
  capacidade_atual_kg_h: number | null; equipamento_atual: string; observacoes: string;
}
export function validarCapacidade(e: EntradaCapacidade): string[] {
  const erros: string[] = [];
  for (const [campo, nome] of [['sacos_safra','Sacos por safra'], ['kg_por_saco','Kg por saco'], ['janela_dias','Janela'], ['tempo_receita_s','Tempo de ciclo']] as const) {
    if (!Number.isFinite(e[campo]) || e[campo] <= 0) erros.push(`${nome} deve ser maior que zero.`);
  }
  if (!Number.isFinite(e.horas_trabalhadas_dia) || e.horas_trabalhadas_dia <= 0 || e.horas_trabalhadas_dia > 24) erros.push('Informe entre 0 e 24 horas de trabalho por dia.');
  if (!Number.isFinite(e.horas_perdidas_dia) || e.horas_perdidas_dia < 0 || e.horas_perdidas_dia >= e.horas_trabalhadas_dia) erros.push('As horas perdidas devem ser menores que as horas trabalhadas.');
  if (!Number.isInteger(e.num_produtos_liquidos) || e.num_produtos_liquidos < 0) erros.push('Informe um número inteiro de produtos líquidos.');
  if (e.capacidade_atual_kg_h !== null && (!Number.isFinite(e.capacidade_atual_kg_h) || e.capacidade_atual_kg_h <= 0)) erros.push('A capacidade atual deve ser maior que zero.');
  return erros;
}
export function calcularCapacidade(e: EntradaCapacidade, modelos: ModeloCapacidade[], folgaMinima: number) {
  const erros = validarCapacidade(e);
  if (erros.length) throw new Error(erros.join(' '));
  if (!Number.isFinite(folgaMinima) || folgaMinima < 0 || folgaMinima >= 1) throw new Error('Folga mínima inválida.');
  const bateladas_h = 3600 / e.tempo_receita_s;
  const horas_efetivas_dia = e.horas_trabalhadas_dia - e.horas_perdidas_dia;
  const kg_totais = e.sacos_safra * e.kg_por_saco;
  const capacidade_necessaria_kg_h = kg_totais / (e.janela_dias * horas_efetivas_dia);
  const resultados = modelos.filter(m => m.ativo).sort((a,b) => a.kg_batelada - b.kg_batelada || a.ordem - b.ordem).map(m => {
    if (!Number.isFinite(m.kg_batelada) || m.kg_batelada <= 0) throw new Error(`Kg/batelada inválido em ${m.modelo}.`);
    const kg_h = bateladas_h * m.kg_batelada;
    const horas_maquina = kg_totais / kg_h;
    const dias = horas_maquina / horas_efetivas_dia;
    const folga = (e.janela_dias - dias) / e.janela_dias;
    return { ...m, kg_h, sacos_h: kg_h / e.kg_por_saco, sacos_dia: kg_h * horas_efetivas_dia / e.kg_por_saco, horas_maquina, dias, folga };
  });
  const recomendado = resultados.find(m => m.folga + Number.EPSILON >= folgaMinima) ?? null;
  return {
    versao: 1, entrada: { ...e }, folga_minima: folgaMinima, bateladas_h, horas_efetivas_dia, kg_totais,
    capacidade_necessaria_kg_h, capacidade_necessaria_sacos_h: capacidade_necessaria_kg_h / e.kg_por_saco,
    dias_equipamento_atual: e.capacidade_atual_kg_h ? kg_totais / e.capacidade_atual_kg_h / horas_efetivas_dia : null,
    recomendado_id: recomendado?.id ?? null,
    modelos: resultados.map(m => ({ ...m, status: m.id === recomendado?.id ? 'Recomendado' : m.folga < 0 ? 'Não atende' : m.folga < folgaMinima ? 'Justo' : 'Atende com folga' })),
  };
}
export type ResultadoCapacidade = ReturnType<typeof calcularCapacidade>;
export function urlOrcamentoDiagnostico(tipicoId: string | null, oportunidadeId: string | null, organizacaoId: string | null) {
  const p = new URLSearchParams({ novo: '1' });
  if (tipicoId) p.set('tipico', tipicoId);
  if (oportunidadeId) p.set('oportunidade', oportunidadeId);
  if (organizacaoId) p.set('organizacao', organizacaoId);
  return `/orcamento?${p}`;
}
export const numeroCapacidade = (v: number, decimais = 1) => v.toLocaleString('pt-BR', { maximumFractionDigits: decimais });