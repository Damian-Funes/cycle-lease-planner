import { assertEquals } from 'jsr:@std/assert';
import { avisosContatos, casarContato, contatosParadas, primeiroNome } from './contatosOrg.ts';

const cocari = [
  { id: 'm', nome: 'Marcelo Guerra', cargo: 'Gerente UBS e TSI' },
  { id: 'i', nome: 'Isaias Rodigues', cargo: 'Coordenador de UBS / TSi' },
  { id: 'x', nome: 'ph', cargo: null },
];

Deno.test('primeiro nome reaproveita pessoa única', () => {
  const r = casarContato('Marcelo', cocari);
  assertEquals(r.tipo, 'primeiro_nome');
  assertEquals(r.tipo === 'primeiro_nome' && r.pessoa.id, 'm');
  assertEquals(casarContato('ISAÍAS', cocari).tipo, 'primeiro_nome');
});

Deno.test('sobrenome diferente é pessoa nova', () => {
  assertEquals(casarContato('Marcelo Silva', cocari).tipo, 'nova');
  assertEquals(casarContato('Gilberto', cocari).tipo, 'nova');
});

Deno.test('mais de uma pessoa com o mesmo primeiro nome = ambígua com aviso', () => {
  const ps = [...cocari, { id: 'm2', nome: 'Marcelo Souza' }];
  assertEquals(casarContato('Marcelo', ps).tipo, 'ambigua');
  assertEquals(avisosContatos({ contato_nome: 'Marcelo' }, ps).length, 1);
  assertEquals(avisosContatos({ contato_nome: 'Marcelo' }, cocari), []);
});

Deno.test('contatos das paradas pendentes vão no contexto', () => {
  const r = contatosParadas([
    { id: 'p1', visitada: null, organizacao_id: 'o', organizacao: { nome: 'COCARI', nome_fantasia: 'Cocari', pessoas: cocari } },
    { id: 'p2', visitada: true, organizacao_id: 'o', organizacao: { nome: 'X', pessoas: cocari } },
  ]);
  assertEquals(r, [{ parada_id: 'p1', empresa: 'Cocari', contatos: [{ nome: 'Marcelo Guerra', cargo: 'Gerente UBS e TSI' }, { nome: 'Isaias Rodigues', cargo: 'Coordenador de UBS / TSi' }] }]);
});

Deno.test('vendedor_nome = primeiro nome com inicial maiúscula', () => {
  assertEquals(primeiroNome('renan sena de lima'), 'Renan');
  assertEquals(primeiroNome('FLÁVIO x'), 'Flávio');
});
