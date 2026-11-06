import { ligacaoInterrompida } from '../_shared/juliaWebhook.ts';
const assert = (c: boolean) => { if (!c) throw new Error('falhou'); };
Deno.test('Renan: 95 s, user_turn_timeout, nada gravado → interrompida', () => assert(ligacaoInterrompida({ duracao_s: 95, motivo: 'user_turn_timeout', gravou: false, paradaPendente: true })));
Deno.test('ligação longa que gravou e fechou tudo → concluída', () => assert(!ligacaoInterrompida({ duracao_s: 400, motivo: 'end_call tool', gravou: true, paradaPendente: false })));
Deno.test('longa mas caiu por silêncio com parada pendente → interrompida', () => assert(ligacaoInterrompida({ duracao_s: 400, motivo: 'silence timeout', gravou: true, paradaPendente: true })));
Deno.test('curta mas gravou tudo → concluída', () => assert(!ligacaoInterrompida({ duracao_s: 120, motivo: '', gravou: true, paradaPendente: false })));
