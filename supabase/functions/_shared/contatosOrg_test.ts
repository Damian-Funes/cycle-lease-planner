import { assertEquals } from 'jsr:@std/assert';
import { avisosContatos, casarContato, contatosOrganizacao, contatosParadas, edicaoAte1, fraseContatos, primeiroNome, respostaContatos } from './contatosOrg.ts';

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

const cocariReal = [
  { id: 'i', nome: 'Isaias Rodigues', cargo: 'Coordenador de UBS / TSi', celular: '43 99965 0257', e_decisor: true },
  { id: 'm', nome: 'Marcelo Guerra', cargo: 'Gerente UBS e TSI', celular: '43 99931 8005', e_decisor: true },
  { id: 'g', nome: 'Gilberto', cargo: 'Diretor', e_decisor: true },
  { id: 'x', nome: 'ab', cargo: null },
];

Deno.test('aproximado: Marcello casa com Marcelo Guerra', () => {
  const r = casarContato('Marcello', cocariReal);
  assertEquals(r.tipo, 'aproximado');
  assertEquals(r.tipo === 'aproximado' && r.pessoa.id, 'm');
});

Deno.test('Isaías (acento) casa com Isaias Rodigues; Gilberto exato', () => {
  const r = casarContato('Isaías', cocariReal);
  assertEquals(r.tipo === 'primeiro_nome' && r.pessoa.id, 'i');
  const g = casarContato('Gilberto', cocariReal);
  assertEquals(g.tipo === 'exata' && g.pessoa.id, 'g');
});

Deno.test('Marcos não casa com Marcelo; nome curto não aproxima', () => {
  assertEquals(casarContato('Marcos', cocariReal).tipo, 'nova');
  assertEquals(casarContato('Ana', [{ nome: 'Anna Souza' }]).tipo, 'nova');
});

Deno.test('ordem exata > primeiro nome > aproximado; aproximado ambíguo não cria', () => {
  const ps = [{ id: 'a', nome: 'Marcelo Guerra' }, { id: 'b', nome: 'Marcela Dias' }];
  assertEquals(casarContato('Marcelo', ps).tipo, 'primeiro_nome');
  assertEquals(casarContato('Marcella', ps).tipo, 'aproximado');
  assertEquals(casarContato('Marcelx', ps).tipo, 'ambigua');
  assertEquals(casarContato('Marcello Silva', ps).tipo, 'nova');
});

Deno.test('edicaoAte1', () => {
  assertEquals(edicaoAte1('marcello', 'marcelo'), true);
  assertEquals(edicaoAte1('marcelo', 'marcela'), true);
  assertEquals(edicaoAte1('marcos', 'marcelo'), false);
  assertEquals(edicaoAte1('isaias', 'isais'), true);
});

Deno.test('contatos da organização para buscar/vincular', () => {
  const c = contatosOrganizacao(cocariReal);
  assertEquals(c.length, 3);
  assertEquals(c[1], { nome: 'Marcelo Guerra', cargo: 'Gerente UBS e TSI', tem_telefone: true, decisor: true });
  assertEquals(c[2].tem_telefone, false);
  assertEquals(fraseContatos(c), 'Contatos cadastrados: Isaias Rodigues (Coordenador de UBS / TSi), Marcelo Guerra (Gerente UBS e TSI), Gilberto (Diretor).');
  assertEquals(fraseContatos([], 'Cocari'), 'Nenhum contato cadastrado na Cocari.');
  assertEquals(contatosOrganizacao(Array.from({ length: 12 }, (_, i) => ({ nome: `Pessoa ${i}` }))).length, 8);
});

Deno.test('trava: nome sem casamento pede confirmação com os contatos da empresa', () => {
  const r = respostaContatos([{ nome_falado: 'Rafael', papel: 'contato', tipo: 'pendente' }], cocariReal, 'Cocari');
  assertEquals(r.pergunta, 'Não achei "Rafael" entre os contatos da Cocari (Isaias Rodigues, Marcelo Guerra, Gilberto). É um deles ou é pessoa nova?');
  assertEquals(r.confirmar_contato, { nome_falado: 'Rafael', papel: 'contato', motivo: 'nao_encontrado', contatos_existentes: [
    { nome: 'Isaias Rodigues', cargo: 'Coordenador de UBS / TSi' }, { nome: 'Marcelo Guerra', cargo: 'Gerente UBS e TSI' }, { nome: 'Gilberto', cargo: 'Diretor' }] });
  assertEquals(r.avisos, [r.pergunta]);
});

Deno.test('aproximado avisa qual pessoa foi usada e não pede confirmação de cadastro', () => {
  const r = respostaContatos([{ nome_falado: 'Marcello', tipo: 'aproximado', pessoa_nome: 'Marcelo Guerra' }, { nome_falado: 'Gilberto', papel: 'decisor', tipo: 'exata', pessoa_nome: 'Gilberto' }], cocariReal, 'Cocari');
  assertEquals(r.avisos, ['Usei o contato Marcelo Guerra para "Marcello"; confirme com o vendedor.']);
  assertEquals(r.confirmar_contato, null);
  assertEquals(r.pergunta, '');
});

Deno.test('ambíguo pede para escolher entre as candidatas; mesmo nome em contato e decisor aparece uma vez', () => {
  const ps = [{ nome: 'Marcelo Guerra', cargo: 'Gerente' }, { nome: 'Marcelo Souza', cargo: null }];
  const r = respostaContatos([{ nome_falado: 'Marcelo', tipo: 'ambigua' }, { nome_falado: 'Marcelo', papel: 'decisor', tipo: 'ambigua' }], ps, 'Cocari');
  assertEquals(r.avisos.length, 1);
  assertEquals(r.confirmar_contato?.motivo, 'ambiguo');
  assertEquals(r.confirmar_contato?.contatos_existentes.map(c => c.nome), ['Marcelo Guerra', 'Marcelo Souza']);
});

Deno.test('empresa sem contatos: pede confirmação de pessoa nova', () => {
  const r = respostaContatos([{ nome_falado: 'Rafael', tipo: 'pendente' }], [], 'Cocari');
  assertEquals(r.pergunta, 'A Cocari não tem contatos cadastrados; não cadastrei "Rafael". Confirme que é pessoa nova.');
  assertEquals(r.confirmar_contato?.contatos_existentes, []);
});
