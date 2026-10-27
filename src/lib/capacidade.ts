export interface ModeloCapacidade {
  id: string; modelo: string; kg_batelada: number; ordem: number; ativo: boolean; tipico_id: string | null;
}
export interface ParametrosCapacidade {
  tempo_receita_padrao_s: number; horas_trabalhadas_padrao: number; horas_perdidas_padrao: number;
  horas_perdidas_lotes_desorganizados: number; folga_minima: number;
  peso_soja: number | null; peso_milho: number | null; peso_trigo: number | null;
  crescimento_padrao_pct?: number; horizonte_padrao_anos?: number;
}
export type CrescimentoModo = 'percentual' | 'meta' | null;
export interface EntradaCapacidade {
  cultura: string; sacos_safra: number; kg_por_saco: number; janela_dias: number;
  horas_trabalhadas_dia: number; lotes_liberados_dia_anterior: boolean; horas_perdidas_dia: number;
  tempo_receita_s: number; num_produtos_liquidos: number; usa_po: boolean;
  capacidade_atual_kg_h: number | null; equipamento_atual: string; observacoes: string;
  crescimento_modo?: CrescimentoModo; crescimento_anual_pct?: number | null; meta_sacos?: number | null; horizonte_anos?: number | null;
}
export function validarCrescimento(e: Pick<EntradaCapacidade,'crescimento_modo'|'crescimento_anual_pct'|'meta_sacos'|'horizonte_anos'>): string[] {
  if (!e.crescimento_modo) return [];
  const erros: string[] = [];
  if (e.crescimento_modo !== 'percentual' && e.crescimento_modo !== 'meta') return ['Modo de crescimento inválido.'];
  const h = e.horizonte_anos;
  if (h == null || !Number.isInteger(h) || h < 1 || h > 15) erros.push('O horizonte deve ser de 1 a 15 anos.');
  if (e.crescimento_modo === 'percentual') { const g = e.crescimento_anual_pct; if (g == null || !Number.isFinite(g) || g < -50 || g > 200) erros.push('O crescimento anual deve ficar entre -50% e 200%.'); }
  if (e.crescimento_modo === 'meta') { const m = e.meta_sacos; if (m == null || !Number.isFinite(m) || m <= 0) erros.push('A meta de sacos deve ser maior que zero.'); }
  return erros;
}
/** Taxa anual decimal; 0 sem crescimento. */
export function taxaCrescimento(e: Pick<EntradaCapacidade,'sacos_safra'|'crescimento_modo'|'crescimento_anual_pct'|'meta_sacos'|'horizonte_anos'>): number {
  if (e.crescimento_modo === 'percentual') return (e.crescimento_anual_pct ?? 0) / 100;
  if (e.crescimento_modo === 'meta' && e.sacos_safra > 0 && (e.meta_sacos ?? 0) > 0 && (e.horizonte_anos ?? 0) > 0) return Math.pow(e.meta_sacos! / e.sacos_safra, 1 / e.horizonte_anos!) - 1;
  return 0;
}
export type StatusAno = 'atende' | 'justo' | 'nao_atende';
export const ROTULO_STATUS_ANO: Record<StatusAno,string> = { atende:'✓ Atende com folga', justo:'⚠ Justo', nao_atende:'✗ Não atende' };
export function validarCapacidade(e: EntradaCapacidade): string[] {
  const erros: string[] = [];
  for (const [campo, nome] of [['sacos_safra','Sacos por safra'], ['kg_por_saco','Kg por saco'], ['janela_dias','Janela'], ['tempo_receita_s','Tempo de ciclo']] as const) {
    if (!Number.isFinite(e[campo]) || e[campo] <= 0) erros.push(`${nome} deve ser maior que zero.`);
  }
  if (!Number.isFinite(e.horas_trabalhadas_dia) || e.horas_trabalhadas_dia <= 0 || e.horas_trabalhadas_dia > 24) erros.push('Informe entre 0 e 24 horas de trabalho por dia.');
  if (!Number.isFinite(e.horas_perdidas_dia) || e.horas_perdidas_dia < 0 || e.horas_perdidas_dia >= e.horas_trabalhadas_dia) erros.push('As horas perdidas devem ser menores que as horas trabalhadas.');
  if (!Number.isInteger(e.num_produtos_liquidos) || e.num_produtos_liquidos < 0) erros.push('Informe um número inteiro de produtos líquidos.');
  if (e.capacidade_atual_kg_h !== null && (!Number.isFinite(e.capacidade_atual_kg_h) || e.capacidade_atual_kg_h <= 0)) erros.push('A capacidade atual deve ser maior que zero.');
  return [...erros, ...validarCrescimento(e)];
}
export function calcularCapacidade(e: EntradaCapacidade, modelos: ModeloCapacidade[], folgaMinima: number, anoBase = new Date().getFullYear()) {
  const erros = validarCapacidade(e);
  if (erros.length) throw new Error(erros.join(' '));
  if (!Number.isFinite(folgaMinima) || folgaMinima < 0 || folgaMinima >= 1) throw new Error('Folga mínima inválida.');
  const bateladas_h = 3600 / e.tempo_receita_s;
  const horas_efetivas_dia = e.horas_trabalhadas_dia - e.horas_perdidas_dia;
  const kg_totais = e.sacos_safra * e.kg_por_saco;
  const capacidade_necessaria_kg_h = kg_totais / (e.janela_dias * horas_efetivas_dia);
  const temProjecao = Boolean(e.crescimento_modo);
  const taxa = temProjecao ? taxaCrescimento(e) : 0;
  const horizonte = temProjecao ? e.horizonte_anos! : 0;
  const anos = Array.from({ length: horizonte + 1 }, (_, n) => {
    const sacos = e.sacos_safra * Math.pow(1 + taxa, n);
    return { ano: anoBase + n, n, sacos, sacos_h_necessarios: sacos / (e.janela_dias * horas_efetivas_dia) };
  });
  const anoFinal = anoBase + horizonte;
  const resultados = modelos.filter(m => m.ativo).sort((a,b) => a.kg_batelada - b.kg_batelada || a.ordem - b.ordem).map(m => {
    if (!Number.isFinite(m.kg_batelada) || m.kg_batelada <= 0) throw new Error(`Kg/batelada inválido em ${m.modelo}.`);
    const kg_h = bateladas_h * m.kg_batelada;
    const horas_maquina = kg_totais / kg_h;
    const dias = horas_maquina / horas_efetivas_dia;
    const folga = (e.janela_dias - dias) / e.janela_dias;
    const por_ano = anos.map(a => {
      const d = a.sacos * e.kg_por_saco / kg_h / horas_efetivas_dia;
      const f = (e.janela_dias - d) / e.janela_dias;
      const status: StatusAno = f + Number.EPSILON >= folgaMinima ? 'atende' : f >= 0 ? 'justo' : 'nao_atende';
      return { ano: a.ano, dias: d, folga: f, status };
    });
    let atende_ate: number | null = null;
    for (const a of por_ano) { if (a.status !== 'atende') break; atende_ate = a.ano; }
    return { ...m, kg_h, sacos_h: kg_h / e.kg_por_saco, sacos_dia: kg_h * horas_efetivas_dia / e.kg_por_saco, horas_maquina, dias, folga, atende_ate, por_ano };
  });
  const recomendadoHoje = resultados.find(m => m.folga + Number.EPSILON >= folgaMinima) ?? null;
  const recomendado = temProjecao ? resultados.find(m => m.atende_ate !== null && m.atende_ate >= anoFinal) ?? null : recomendadoHoje;
  return {
    versao: temProjecao ? 2 : 1, entrada: { ...e }, folga_minima: folgaMinima, bateladas_h, horas_efetivas_dia, kg_totais,
    capacidade_necessaria_kg_h, capacidade_necessaria_sacos_h: capacidade_necessaria_kg_h / e.kg_por_saco,
    dias_equipamento_atual: e.capacidade_atual_kg_h ? kg_totais / e.capacidade_atual_kg_h / horas_efetivas_dia : null,
    recomendado_id: recomendado?.id ?? null,
    recomendado_hoje_id: recomendadoHoje?.id ?? null,
    projecao: temProjecao ? { taxa_anual: taxa, horizonte_anos: horizonte, ano_base: anoBase, ano_final: anoFinal, anos } : null,
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
const inteiro = (v: number) => Math.round(v).toLocaleString('pt-BR');
/** Frase de destaque do crescimento; null sem projeção (ou snapshot antigo). */
export function fraseCrescimento(r: Pick<ResultadoCapacidade,'projecao'|'modelos'|'recomendado_id'|'recomendado_hoje_id'> | null | undefined): string | null {
  const p = r?.projecao; if (!r || !p) return null;
  const final = p.anos[p.anos.length - 1];
  const rec = r.modelos.find(m => m.id === r.recomendado_id);
  const hoje = r.modelos.find(m => m.id === r.recomendado_hoje_id);
  if (!rec) return `Nenhum modelo atende ${inteiro(final.sacos)} sacos em ${p.ano_final} com a folga mínima.`;
  if (hoje && hoje.id !== rec.id) return `A ${hoje.modelo} atende até ${hoje.atende_ate}. Para crescer até ${inteiro(final.sacos)} sacos em ${p.ano_final}, o modelo indicado é a ${rec.modelo}.`;
  return `A ${rec.modelo} atende o crescimento até ${inteiro(final.sacos)} sacos em ${p.ano_final}.`;
}
export function rotuloAtendeAte(atende_ate: number | null | undefined, anoFinal: number) {
  if (atende_ate == null) return 'Não atende hoje';
  return atende_ate >= anoFinal ? `${anoFinal}+` : String(atende_ate);
}
