import { assertEquals, assertStringIncludes } from 'jsr:@std/assert';
import { fraseJaSabemos, montarJaSabemos, nomesDecisoresComCargo, sacosFalados, type SituacaoAtual } from './jaSabemos.ts';
import { contatosParadas } from './contatosOrg.ts';
import { montarVariaveis } from './variaveisLigacao.ts';
import { prepararEntrada } from '../julia-viagem-ferramentas/schema.ts';

// Dados reais da Cocari (a209f1d7) em 07/11/2026.
const cocari: SituacaoAtual = {
  organizacao_id: 'o',
  sacos_safra: { valor: 150000, data: '2026-11-06' },
  equipamento_atual: { valor: 'Duas B18, sendo uma bem antiga', data: '2026-11-06' },
  problema_principal: { valor: 'Uma das duas B18 é muito antiga e limita a produção; querem substituir para aumentar a capacidade.', data: '2026-11-06' },
  interesse: { valor: 'alto', motivo: 'Querem trocar a máquina antiga', data: '2026-11-06' },
  concorrente: { valor: 'Existe concorrente, nome não identificado', data: '2026-11-06' },
  decisores: { valor: 'Gilberto (diretor); coordenador de produção (nome não informado)', data: '2026-11-06' },
  ultima_visita: { data: '2026-11-06' },
};
const pessoas = [
  { nome: 'Isaias Rodigues', cargo: 'Coordenador de UBS / TSi', e_decisor: false },
  { nome: 'Gilberto', cargo: 'Diretor', e_decisor: true },
  { nome: 'ph', cargo: null, e_decisor: true },
];

Deno.test('ja_sabemos: último valor de cada campo + decisores das pessoas', () => {
  const js = montarJaSabemos(cocari, pessoas);
  assertEquals(js.sacos_safra, 150000);
  assertEquals(js.equipamento_atual, 'Duas B18, sendo uma bem antiga');
  assertEquals(js.interesse, 'alto');
  assertEquals(js.decisores, [{ nome: 'Gilberto', cargo: 'Diretor' }]);
  assertEquals(js.ultimo_contato_em, '2026-11-06');
  assertEquals('proximo_passo' in js, false);
});

Deno.test('ja_sabemos: só campos com valor', () => {
  assertEquals(montarJaSabemos(null, []), {});
  assertEquals(montarJaSabemos({ organizacao_id: 'o', sacos_safra: { valor: null }, concorrente: { valor: '  ' } }, []), {});
  assertEquals(fraseJaSabemos({}), '');
  assertEquals(fraseJaSabemos({ ultimo_contato_em: '2026-11-06' }), '');
});

Deno.test('ja_sabemos: frase curta para a Júlia', () => {
  const f = fraseJaSabemos(montarJaSabemos(cocari, pessoas));
  assertStringIncludes(f, 'Já sabemos: 150 mil sacos/safra, equipamento: Duas B18, sendo uma bem antiga');
  assertStringIncludes(f, 'decisor Gilberto (Diretor)');
  assertStringIncludes(f, 'interesse alto');
  assertStringIncludes(f, '(último contato 06/11).');
  assertEquals(f.includes('aumentar a capacidade'), false); // texto longo encurtado
});

Deno.test('ja_sabemos: sem pessoa decisora, usa nomes do levantamento', () => {
  assertEquals(montarJaSabemos(cocari, []).decisores, [{ nome: 'Gilberto', cargo: 'Diretor' }]);
  assertEquals(nomesDecisoresComCargo('coordenador (nome não informado)'), []);
});

Deno.test('ja_sabemos: próximo passo em aberto (após a SQL)', () => {
  const js = montarJaSabemos({ ...cocari, proximo_passo: { valor: 'Cliente visitar a Coamo para ver a LSB 300', data: '2026-11-13' } }, pessoas);
  assertEquals([js.proximo_passo, js.proximo_passo_data], ['Cliente visitar a Coamo para ver a LSB 300', '2026-11-13']);
  assertStringIncludes(fraseJaSabemos(js, 'Cocari'), 'Já sabemos da Cocari:');
  assertStringIncludes(fraseJaSabemos(js), 'próximo passo em aberto: Cliente visitar a Coamo para ver a LSB 300 (13/11)');
});

Deno.test('sacos falados', () => {
  assertEquals(sacosFalados(150000), '150 mil sacos');
  assertEquals(sacosFalados(1200000), '1,2 milhão de sacos');
  assertEquals(sacosFalados(800), '800 sacos');
});

Deno.test('contatos_paradas leva ja_sabemos (também na variável inicial)', () => {
  const paradas = [
    { id: 'p1', visitada: null, organizacao_id: 'o', organizacao: { nome_fantasia: 'Cocari', pessoas } },
    { id: 'p2', visitada: null, organizacao_id: 'x', organizacao: { nome: 'Sem nada', pessoas: [] } },
  ];
  const r = contatosParadas(paradas, new Map([['o', cocari]]));
  assertEquals(r.length, 1);
  const p = r[0] as Record<string, unknown>;
  assertEquals((p.ja_sabemos as { sacos_safra: number }).sacos_safra, 150000);
  assertStringIncludes(String(p.ja_sabemos_frase), 'Já sabemos da Cocari: 150 mil sacos');
  const v = montarVariaveis({ rota: { data_fim: '2026-11-07', paradas }, perfilNome: 'renan', vendedorId: 'v', rotaId: 'r', ligacaoId: 'l', data: '2026-11-07', pendencias: [], teste: false, origem: 'entrada', situacoes: new Map([['o', cocari]]) });
  assertStringIncludes(String(v.contatos_paradas), '"ja_sabemos"');
});

Deno.test('registrar_contato_cliente rápido: só organizacao_id + canal + resultado', () => {
  const { body, avisos } = prepararEntrada({ acao: 'registrar_contato_cliente', ligacao_id: '11111111-1111-4111-8111-111111111111', organizacao_id: '22222222-2222-4222-8222-222222222222', canal: 'whatsapp', resultado: 'Cliente pediu o catálogo da LSB 300' }, '2026-11-07');
  assertEquals(avisos, []);
  assertEquals(body.acao, 'registrar_contato_cliente');
});
