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
 assert(avisos.length === 1);
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
});