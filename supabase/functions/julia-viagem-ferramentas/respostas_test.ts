import { assertEquals } from 'jsr:@std/assert';
import { jaRegistradasHoje, fraseJaRegistradas } from './respostas.ts';

Deno.test('ja_registradas_hoje lista só paradas informadas hoje', () => {
  const ps = [
    { id: 'a', dia: '2026-11-06', visitada: true, cidade: 'Ibiporã', estado: 'PR', relato: { proximo_passo: 'Apresentação', proximo_passo_data: '2026-12-04' }, organizacao: { nome: 'CTVA', nome_fantasia: 'Corteva' } },
    { id: 'b', dia: null, visitada: null, cidade: 'Londrina', relato: null, organizacao: null },
    { id: 'c', dia: '2026-11-05', visitada: true, relato: null, organizacao: { nome: 'X' } },
  ];
  const r = jaRegistradasHoje(ps, '2026-11-06');
  assertEquals(r, [{ parada_id: 'a', empresa: 'Corteva', cidade: 'Ibiporã', uf: 'PR', visitada: true, proximo_passo: 'Apresentação', proximo_passo_data: '2026-12-04' }]);
  assertEquals(fraseJaRegistradas(r), 'Já registrado hoje: visita na Corteva (Ibiporã).');
  assertEquals(fraseJaRegistradas([]), '');
});
