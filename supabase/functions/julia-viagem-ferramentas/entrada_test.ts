import { Schema } from './schema.ts';
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
Deno.test('normalização não aceita número negativo ou booleano inválido', () => {
 for (const campos of [{ sacos_safra: '-1' }, { sacos_safra: '1500abc' }, { visitada: 'talvez' }]) {
  assert(!Schema.safeParse(normalizarBody({ ...ids, acao: 'registrar_visita', visitada: 'true', resultado: 'Feita', ...campos })).success);
 }
});
Deno.test('campo obrigatório vazio continua recusado com indicação do campo', () => {
 const parsed = Schema.safeParse(normalizarBody({ ...ids, acao: 'registrar_visita', visitada: '' }));
 assert(!parsed.success);
 if (!parsed.success) assert(fraseValidacao(parsed.error.issues).includes('visita realizada'));
});