import { extrasConfirmados, montarPendencias, textoExtras } from './pendenciasDia.ts';
import { motivoNaoDiscar } from './juliaViagemRegras.ts';
const eq = (a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${JSON.stringify(a)} !== ${JSON.stringify(b)}`); };
const rota = (extras: string[] | null | undefined) => ({ id: 'r', data_inicio: '2026-11-08', data_fim: '2026-11-13', pernoites: [{ id: 'p', noite: '2026-11-11', tipo: 'sem_custo', gasto_id: null }], gastos: [], extras_confirmados: extras,
  paradas: [{ id: 'a', visitada: true, dia: '2026-11-11', organizacao_id: 'o', relato: { proximo_passo_data: '2026-11-20', contato_nome: 'x', sacos_safra: 1, equipamento_atual: 'x', problema_principal: 'x', interesse: 'alto', concorrente: 'x' } }] });
const tem = (extras: string[] | null | undefined, completo = true) => montarPendencias(rota(extras), '2026-11-11', { completo }).some(p => p.tipo === 'confirmar_extras');
Deno.test('pergunta uma vez no dia com visita informada', () => eq(tem([]), true));
Deno.test('já respondeu hoje → não pergunta de novo', () => eq(tem(extrasConfirmados([textoExtras('2026-11-11', 'nao')])), true === false));
Deno.test('resposta de outro dia não conta', () => eq(tem(['2026-11-10']), true));
Deno.test('sem leitura do diário → não pergunta', () => eq(tem(null), false));
Deno.test('fora do modo completo (cron) não aparece', () => eq(tem([], false), false));
Deno.test('só a pergunta pendente não faz o cron ligar', () => eq(motivoNaoDiscar([{ tipo: 'confirmar_extras' }], false) !== null, true));
