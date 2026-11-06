import { Schema, prepararEntrada } from './schema.ts';
import { normalizarBody, fraseValidacao } from './entrada.ts';

const ids = { ligacao_id: '11111111-1111-4111-8111-111111111111', rota_id: '22222222-2222-4222-8222-222222222222', parada_id: '33333333-3333-4333-8333-333333333333' };
function assert(condicao: boolean) { if (!condicao) throw new Error('Falha de validação'); }

Deno.test('registrar_visita aceita o formato ElevenLabs e remove chaves desconhecidas', () => {
 const body = Schema.parse(normalizarBody({ ...ids, acao: 'registrar_visita', visitada: 'sim', resultado: 'Visita feita', contato_nome: '', contato_cargo: null, objecoes: [], sacos_safra: '1.500', interesse: 'médio', atividade_id: 'forjado', extra: 'ignorar' }));
 assert(body.acao === 'registrar_visita' && body.visitada === true && body.sacos_safra === 1500 && body.interesse === 'medio');
 assert(!('atividade_id' in body) && !('extra' in body) && !('contato_cargo' in body));
});
Deno.test('registrar_pernoite aceita valor brasileiro e uf minúscula', () => {
 const body = Schema.parse(normalizarBody({ ...ids, acao: 'registrar_pernoite', tipo: 'hotel', cidade: 'Londrina', uf: 'pr', hotel_nome: 'Hotel', valor: '1500,5', extra: true }));
 assert(body.acao === 'registrar_pernoite' && body.valor === 1500.5 && body.uf === 'PR' && !('extra' in body));
});
Deno.test('todos os schemas descartam chaves extras', () => {
 for (const dados of [{ acao: 'listar_pendentes' }, { acao: 'agendar_retorno', horario: '20:00' }]) {
  const body = Schema.parse(normalizarBody({ ...ids, ...dados, extra: 'ignorar' }));
  assert(!('extra' in body));
 }
});
Deno.test('opcionais inválidos são descartados, mas booleano inválido é recusado', () => {
 for (const campos of [{ sacos_safra: '-1' }, { sacos_safra: '1500abc' }, { visitada: 'talvez' }]) {
  const parsed = Schema.safeParse(normalizarBody({ ...ids, acao: 'registrar_visita', visitada: 'true', resultado: 'Feita', ...campos }));
  assert(parsed.success === !('visitada' in campos));
 }
});
Deno.test('campo obrigatório vazio continua recusado com indicação do campo', () => {
 const parsed = Schema.safeParse(normalizarBody({ ...ids, acao: 'registrar_visita', visitada: '' }));
 assert(!parsed.success);
 if (!parsed.success) assert(fraseValidacao(parsed.error.issues).includes('visita realizada'));
});

Deno.test('payload real é aceito com quantidade extraída e sem data nem atividade', () => {
 const { body, avisos } = prepararEntrada({ ...ids, acao: 'registrar_visita', resultado: 'Visita feita', sacos_safra: '500 mil sacos', proximo_passo_data: 'Sem próximo passo', motivo: 'Não se aplica, visita realizada', visitada: true, objecoes: ['Nenhuma citada'], concorrente: 'Nenhum' }, '2026-11-05');
 assert(body.acao === 'registrar_visita' && body.sacos_safra === 500000);
 assert(!('motivo' in body) && !('objecoes' in body) && !('concorrente' in body) && !('proximo_passo_data' in body) && !('atividade_id' in body));
 console.log(avisos); assert(avisos.length === 2 && avisos.some(a => a.includes('concorrente')));
});
Deno.test('data passada é removida com aviso mesmo com próximo passo informado', () => {
 const { body, avisos } = prepararEntrada({ ...ids, acao: 'registrar_visita', visitada: true, resultado: 'Feita', proximo_passo: 'Retornar', proximo_passo_data: '04/11/2026' }, '2026-11-05');
 assert(!('proximo_passo_data' in body) && avisos.length === 1);
});
Deno.test('todos os opcionais problemáticos do relato são removidos com avisos', () => {
 const { body, avisos } = prepararEntrada({ ...ids, acao: 'registrar_visita', visitada: true, resultado: 'Feita', interesse: 'quente', contato_nome: 123, decisores: 'x'.repeat(501), objecoes: [123] }, '2026-11-05');
 assert(!('interesse' in body) && !('contato_nome' in body) && !('decisores' in body) && !('objecoes' in body) && avisos.length === 4);
});
Deno.test('parada_id, visitada e resultado ou motivo continuam obrigatórios', () => {
 for (const alteracao of [{ parada_id: '' }, { visitada: null }, { resultado: 'nenhum' }, { visitada: false, motivo: 'não se aplica' }]) {
  let recusou = false;
  try { prepararEntrada({ ...ids, acao: 'registrar_visita', visitada: true, resultado: 'Feita', ...alteracao }, '2026-11-05'); } catch { recusou = true; }
  assert(recusou);
 }
});
Deno.test('não visita descarta debrief sem bloquear motivo obrigatório', () => {
 const { body, avisos } = prepararEntrada({ ...ids, acao: 'registrar_visita', visitada: 'não', motivo: 'Cliente ausente', resultado: 'Ignorar', interesse: 'alto' }, '2026-11-05');
 assert(body.acao === 'registrar_visita' && body.visitada === false && body.motivo === 'Cliente ausente' && !('resultado' in body) && !('interesse' in body) && avisos.length === 1);
});Deno.test('completar_organizacao normaliza telefone, motivo, datas e booleano', () => {
 const body = Schema.parse(normalizarBody({ ...ids, acao: 'completar_organizacao', organizacao_id: ids.parada_id, pessoa_nome: 'Arno', pessoa_telefone: '+55 (55) 99999-1111', uf: 'rs', sugerir_visita: 'sim', descobrir_ate: '2099-01-10', extra: 1 }, '2026-11-06'));
 assert(body.acao === 'completar_organizacao' && body.pessoa_telefone === '55999991111' && body.uf === 'RS' && body.sugerir_visita === true && body.descobrir_ate === '2099-01-10' && !('extra' in body));
 const d = Schema.parse(normalizarBody({ ...ids, acao: 'completar_organizacao', organizacao_id: ids.parada_id, descartar_motivo: 'não trabalha com semente' }));
 assert(d.acao === 'completar_organizacao' && d.descartar_motivo === 'nao_trata_semente');
});
Deno.test('completar_organizacao descarta telefone curto e data passada', () => {
 const body = Schema.parse(normalizarBody({ ...ids, acao: 'completar_organizacao', organizacao_id: ids.parada_id, pessoa_telefone: '9999-1111', descobrir_ate: '2020-01-01', cidade: 'Ijuí' }, '2026-11-06'));
 assert(body.acao === 'completar_organizacao' && !('pessoa_telefone' in body) && !('descobrir_ate' in body) && body.cidade === 'Ijuí');
});
Deno.test('listar_organizacoes_incompletas só exige ligação e viagem', () => {
 const body = Schema.parse(normalizarBody({ ...ids, acao: 'listar_organizacoes_incompletas', extra: 'x' }));
 assert(body.acao === 'listar_organizacoes_incompletas' && !('extra' in body));
});

import { pareceCompletar } from './entrada.ts';
Deno.test('ligação Flávio: data sem texto cria próximo passo genérico com aviso', () => {
 const { body, avisos } = prepararEntrada({ ...ids, acao: 'registrar_visita', visitada: true, resultado: 'ok', motivo: 'N/A', concorrente: 'Nenhum', proximo_passo_data: '2026-12-04' }, '2026-11-06');
 assert(body.acao === 'registrar_visita' && (body as Record<string, unknown>).proximo_passo === '(sem descrição)' && !('concorrente' in body));
 assert(avisos.some(a => a.includes('sem descrição')) && avisos.some(a => a.includes('concorrente')));
});
Deno.test('data com texto mantém o próximo passo', () => {
 const { body } = prepararEntrada({ ...ids, acao: 'registrar_visita', visitada: true, resultado: 'ok', proximo_passo: 'Montar apresentação', proximo_passo_data: '04/12' }, '2026-11-06');
 assert(body.acao === 'registrar_visita' && (body as Record<string, unknown>).proximo_passo === 'Montar apresentação' && body.proximo_passo_data === '2026-12-04');
});
Deno.test('acao listar com dados de completar é reconhecida como completar', () => {
 assert(pareceCompletar({ ...ids, acao: 'listar_organizacoes_incompletas', organizacao_id: '44444444-4444-4444-8444-444444444444', pessoa_nome: 'Alexandre' }));
 assert(!pareceCompletar({ ...ids, acao: 'listar_organizacoes_incompletas' }));
 assert(!pareceCompletar({ ...ids, acao: 'listar_organizacoes_incompletas', organizacao_id: '44444444-4444-4444-8444-444444444444' }));
});
