import { assertEquals } from 'jsr:@std/assert';
import { precisaLigacaoFechamento } from './fechamento.ts';
const fim = '2026-11-10T17:00:00-03:00';
// Dados reais do Flávio em 10/11 (depois da correção, o retorno 19h não seria cancelado).
const flavio = [
  { origem: 'inicial', status: 'interrompida', created_at: '2026-11-10T11:01:25Z' },
  { origem: 'manual', status: 'interrompida', created_at: '2026-11-10T11:02:53Z' },
  { origem: 'retorno', status: 'cancelada', created_at: '2026-11-10T11:03:28Z' },
  { origem: 'manual', status: 'interrompida', created_at: '2026-11-10T11:44:54Z' },
];
Deno.test('Flávio 10/11: sem retorno ativo e dia aberto → cron liga', () => assertEquals(precisaLigacaoFechamento(flavio, fim), true));
Deno.test('com retorno agendado → não liga', () => assertEquals(precisaLigacaoFechamento([...flavio.slice(0, 2), { origem: 'retorno', status: 'agendada' }], fim), false));
Deno.test('fechamento já feito → não liga de novo', () => assertEquals(precisaLigacaoFechamento([...flavio, { origem: 'fechamento', status: 'nao_atendeu' }], fim), false));
Deno.test('conversa concluída depois das 17h → não liga', () => assertEquals(precisaLigacaoFechamento([{ origem: 'inicial', status: 'concluida', updated_at: '2026-11-10T20:30:00Z' }], fim), false));
Deno.test('conversa concluída de manhã → liga', () => assertEquals(precisaLigacaoFechamento([{ origem: 'inicial', status: 'concluida', updated_at: '2026-11-10T11:30:00Z' }], fim), true));
Deno.test('nenhuma ligação no dia → fluxo inicial, não fechamento', () => assertEquals(precisaLigacaoFechamento([], fim), false));
