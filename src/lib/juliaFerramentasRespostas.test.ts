import { describe, expect, it } from 'vitest';
import { visitaRepetida, mensagemVisita, mensagemPernoite, mensagemRetorno, fraseErro, nomeEmpresa } from '../../supabase/functions/julia-viagem-ferramentas/respostas';

describe('respostas das ferramentas Júlia', () => {
 it('mesma visita hoje é repetição; outro dia ou visitada diferente é conflito', () => {
  expect(visitaRepetida({ visitada: null }, true, '2026-11-05')).toBe('nova');
  expect(visitaRepetida({ visitada: true, dia: '2026-11-05' }, true, '2026-11-05')).toBe('repetida');
  expect(visitaRepetida({ visitada: true, dia: '2026-11-04' }, true, '2026-11-05')).toBe('conflito');
  expect(visitaRepetida({ visitada: false, dia: '2026-11-05' }, true, '2026-11-05')).toBe('conflito');
 });
 it('mensagens de sucesso', () => {
  expect(nomeEmpresa({ visitada: null, organizacao: { nome: 'X', nome_fantasia: 'Sementes Costa Beber' } })).toBe('Sementes Costa Beber');
  expect(mensagemVisita('Sementes Costa Beber', true, 'a1', '2026-11-12')).toBe('Visita da Sementes Costa Beber salva. Próximo passo criado na agenda para 12/11.');
  expect(mensagemPernoite({ tipo: 'hotel', hotel_nome: 'Hotel Brian', cidade: 'Panambi' })).toBe('Pernoite no Hotel Brian (Panambi) salvo; falta a foto da nota.');
  expect(mensagemRetorno('2026-11-05T22:00:00Z')).toBe('Retorno agendado para 19:00.');
 });
 it('erro nunca é JSON', () => {
  expect(fraseErro('[{"code":"x"}]')).not.toMatch(/[{[]/);
  expect(fraseErro('403: Vendedor fora da whitelist.')).toBe('Vendedor fora da whitelist.');
 });
});
