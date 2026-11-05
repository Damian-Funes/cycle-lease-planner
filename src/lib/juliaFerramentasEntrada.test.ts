import { describe, expect, it } from 'vitest';
import { normalizarBody, mensagensValidacao, fraseValidacao } from '../../supabase/functions/julia-viagem-ferramentas/entrada';

describe('entrada das ferramentas Júlia', () => {
 it('remove opcionais nulos, vazios e arrays vazios sem perder zero ou false', () => {
  expect(normalizarBody({ contato_nome: '', contato_cargo: null, decisores: undefined, concorrente: '   ', objecoes: [], sacos_safra: 0, visitada: false, resultado: ' Visita feita ' })).toEqual({ sacos_safra: 0, visitada: false, resultado: 'Visita feita' });
 });
 it.each([['1.500', 1500], ['1500,5', 1500.5], ['1.500,50', 1500.5], ['1500', 1500], ['1500.5', 1500.5], ['0', 0]])('converte %s para %s nos campos numéricos', (entrada, esperado) => {
  expect(normalizarBody({ sacos_safra: entrada, valor: entrada })).toEqual({ sacos_safra: esperado, valor: esperado });
 });
 it('não converte texto inválido ou número não finito', () => {
  expect(normalizarBody({ sacos_safra: '1500abc', valor: 'Infinity' })).toEqual({ sacos_safra: '1500abc', valor: 'Infinity' });
 });
 it('normaliza interesse e UF', () => expect(normalizarBody({ interesse: ' MÉDIO ', uf: ' pr ' })).toEqual({ interesse: 'medio', uf: 'PR' }));
 it.each([['true', true], ['false', false], ['sim', true], ['não', false], [' NÃO ', false]])('normaliza visitada=%s', (visitada, esperado) => expect(normalizarBody({ visitada })).toEqual({ visitada: esperado }));
 it('mantém booleano desconhecido para a validação recusar', () => expect(normalizarBody({ visitada: 'talvez' })).toEqual({ visitada: 'talvez' }));
 it('não revela valores contidos nas mensagens originais do Zod', () => {
  const issues = [{ path: ['interesse'], code: 'invalid_enum_value', message: "Received 'dado privado'" }];
  expect(JSON.stringify(mensagensValidacao(issues))).not.toContain('dado privado');
  expect(fraseValidacao(issues)).toContain('interesse');
 });
});