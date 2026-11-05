export const CAMPOS_TEXTO_RELATO = ['contato_nome', 'contato_cargo', 'decisores', 'equipamento_atual', 'problema_principal', 'motivo_interesse', 'concorrente', 'proximo_passo'] as const;
export interface RelatoVisita {
 contato_nome?: string; contato_cargo?: string; decisores?: string; sacos_safra?: number;
 equipamento_atual?: string; problema_principal?: string; interesse?: 'alto' | 'medio' | 'baixo';
 motivo_interesse?: string; objecoes?: string[]; concorrente?: string; proximo_passo?: string;
 proximo_passo_data?: string; atividade_id?: string;
}
/** Only known debrief fields cross the voice boundary; activity_id is assigned by SQL. */
export function extrairRelato(dados: Record<string, unknown>, hojeBRT: string): RelatoVisita {
 const relato: RelatoVisita = {};
 for (const campo of CAMPOS_TEXTO_RELATO) {
  const valor = dados[campo];
  if (valor === undefined) continue;
  if (typeof valor !== 'string' || !valor.trim() || valor.trim().length > 500) throw new Error(`${campo}: use texto de até 500 caracteres.`);
  relato[campo] = valor.trim();
 }
 if (dados.sacos_safra !== undefined) {
  if (typeof dados.sacos_safra !== 'number' || !Number.isFinite(dados.sacos_safra) || dados.sacos_safra < 0) throw new Error('sacos_safra deve ser um número maior ou igual a zero.');
  relato.sacos_safra = dados.sacos_safra;
 }
 if (dados.interesse !== undefined) {
  if (!['alto','medio','baixo'].includes(String(dados.interesse))) throw new Error('Interesse inválido.');
  relato.interesse = dados.interesse as RelatoVisita['interesse'];
 }
 if (dados.objecoes !== undefined) {
  if (!Array.isArray(dados.objecoes) || dados.objecoes.length > 20 || dados.objecoes.some(v => typeof v !== 'string' || !v.trim() || v.trim().length > 500)) throw new Error('Objeções: até 20 textos de até 500 caracteres.');
  relato.objecoes = dados.objecoes.map(v => v.trim());
 }
 if (dados.proximo_passo_data !== undefined) {
  const data = dados.proximo_passo_data;
  if (typeof data !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data) || !Number.isFinite(Date.parse(`${data}T12:00:00Z`)) || new Date(`${data}T12:00:00Z`).toISOString().slice(0,10) !== data || data < hojeBRT) throw new Error('Próximo passo: informe uma data válida de hoje em BRT ou futura.');
  relato.proximo_passo_data = data;
 }
 return relato;
}