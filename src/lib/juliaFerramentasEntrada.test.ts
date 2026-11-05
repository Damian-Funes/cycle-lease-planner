import { describe, expect, it } from 'vitest';
import { normalizarBody, mensagensValidacao, fraseValidacao } from '../../supabase/functions/julia-viagem-ferramentas/entrada';

describe('entrada das ferramentas Júlia', () => {
 it('aceita o payload real sem transformar ausência de próximo passo em data', () => {
  expect(normalizarBody({ sacos_safra: '500 mil sacos', proximo_passo_data: 'Sem próximo passo', motivo: 'Não se aplica, visita realizada', visitada: true, objecoes: ['Nenhuma citada'], concorrente: 'Nenhum' })).toEqual({ sacos_safra: 500000, visitada: true });
 });
 it('remove opcionais nulos, vazios e arrays vazios sem perder zero ou false', () => {
  expect(normalizarBody({ contato_nome: '', contato_cargo: null, decisores: undefined, concorrente: '   ', objecoes: [], sacos_safra: 0, visitada: false, resultado: ' Visita feita ' })).toEqual({ sacos_safra: 0, visitada: false });
 });
 it.each([['1.500', 1500], ['1500,5', 1500.5], ['1.500,50', 1500.5], ['1500', 1500], ['1500.5', 1500.5], ['0', 0]])('converte %s para %s nos campos numéricos', (entrada, esperado) => {
  expect(normalizarBody({ sacos_safra: entrada, valor: entrada })).toEqual({ sacos_safra: esperado, valor: esperado });
 });
 it('descarta sacos inválidos e deixa o valor de hotel para sua validação', () => {
  expect(normalizarBody({ sacos_safra: '1500abc', valor: 'Infinity' })).toEqual({ valor: 'Infinity' });
 });
 it.each([['500 mil sacos', 500000], ['1,2 milhão', 1200000], ['80.000', 80000], ['1500', 1500]])('extrai a quantidade %s', (sacos_safra, esperado) => expect(normalizarBody({ sacos_safra })).toEqual({ sacos_safra: esperado }));
 it.each([['2026-11-06', '2026-11-06'], ['06/11/2026', '2026-11-06'], ['06/11', '2026-11-06'], ['04/11', '2027-11-04'], ['05/11', '2026-11-05']])('normaliza data %s com hoje BRT fixo', (proximo_passo_data, esperado) => expect(normalizarBody({ proximo_passo_data }, '2026-11-05')).toEqual({ proximo_passo_data: esperado }));
 it.each(['Sem próximo passo', 'a combinar', '2026-11-04', '04/11/2026', '31/02/2027'])('descarta data inválida/passada %s com aviso', proximo_passo_data => {
  const avisos: string[] = [];
  expect(normalizarBody({ proximo_passo_data }, '2026-11-05', avisos)).toEqual({});
  expect(avisos.length).toBe(1);
 });
 it.each(['nenhum', 'nenhuma', 'nenhuma citada', 'não', 'n/a', 'não se aplica', 'sem', '-', ' NENHUMA CITADA '])('remove vazio semântico %s nas strings e nas objeções', vazio => expect(normalizarBody({ concorrente: vazio, objecoes: [vazio, 'Preço'] })).toEqual({ objecoes: ['Preço'] }));
 it('ignora resultado quando a visita não foi feita', () => expect(normalizarBody({ visitada: 'não', resultado: 'Não se aplica', motivo: 'Cliente ausente' })).toEqual({ visitada: false, motivo: 'Cliente ausente' }));
 it('normaliza interesse e UF', () => expect(normalizarBody({ interesse: ' MÉDIO ', uf: ' pr ' })).toEqual({ interesse: 'medio', uf: 'PR' }));
 it.each([['true', true], ['false', false], ['sim', true], ['não', false], [' NÃO ', false]])('normaliza visitada=%s', (visitada, esperado) => expect(normalizarBody({ visitada })).toEqual({ visitada: esperado }));
 it('mantém booleano desconhecido para a validação recusar', () => expect(normalizarBody({ visitada: 'talvez' })).toEqual({ visitada: 'talvez' }));
 it('não revela valores contidos nas mensagens originais do Zod', () => {
  const issues = [{ path: ['interesse'], code: 'invalid_enum_value', message: "Received 'dado privado'" }];
  expect(JSON.stringify(mensagensValidacao(issues))).not.toContain('dado privado');
  expect(fraseValidacao(issues)).toContain('interesse');
 });
});