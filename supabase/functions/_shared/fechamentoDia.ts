// Textos dos avisos de fechamento do dia para os admins (puros, testáveis). Sem valores em R$.
import { dataExtenso, montarPendencias, nomeParada, type ContextoPendencias, type PendenciaDia } from './pendenciasDia.ts';

type Rota = ContextoPendencias;
type Noite = { noite: string; tipo: string; cidade?: string | null };
const lista = (itens: string[]) => itens.length <= 1 ? itens.join('') : `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`;

/** Pendências que decidem o fechamento (as do dia e as dos dias anteriores; o debrief não conta). */
export const pendenciasFechamento = (rota: ContextoPendencias, data: string) =>
  montarPendencias(rota, data).filter(p => p.tipo !== 'nota_hotel');

/** "onde dormiu (domingo, 08/11), Cocari e visitas de segunda, 09/11" — curto, até 4 itens. */
export function textoFalta(pend: PendenciaDia[]) {
  const itens = pend.map(p => p.tipo === 'pernoite_noite' ? `onde dormiu (${dataExtenso(p.id)})`
    : p.tipo === 'dia_sem_registro' ? p.titulo.toLowerCase()
    : p.titulo);
  const mostrados = itens.slice(0, 4);
  return lista(mostrados) + (itens.length > 4 ? ` e mais ${itens.length - 4}` : '');
}

export function tituloFechou(vendedor: string, rota: Rota, data: string) {
  const visitas = rota.paradas.filter(p => p.dia === data && p.visitada === true && p.tipo !== 'pernoite');
  const nomes = [...new Set(visitas.map(nomeParada))];
  const noite = (rota.pernoites as Noite[]).find(p => p.noite === data);
  const pernoite = !noite ? '' : noite.tipo === 'voltou_base' ? ', voltou para a base' : noite.cidade ? `, pernoite em ${noite.cidade}` : '';
  const qtd = `${visitas.length} ${visitas.length === 1 ? 'visita' : 'visitas'}`;
  return `✓ ${vendedor} fechou o dia: ${qtd}${nomes.length ? ` (${lista(nomes)})` : ''}${pernoite}`;
}

export function tituloCaiu(vendedor: string, pend: PendenciaDia[]) {
  return pend.length ? `⚠ ${vendedor}: ligação caiu, falta: ${textoFalta(pend)}` : `Ligação com ${vendedor} caiu — religar?`;
}

export type LigacaoTentativa = { status: string; teste?: boolean | null };
export function contarTentativas(ls: LigacaoTentativa[]) {
  const reais = ls.filter(l => !l.teste && !['cancelada', 'agendada', 'aguardando_escolha'].includes(l.status));
  return { total: reais.length, naoAtendidas: reais.filter(l => l.status === 'nao_atendeu').length, caidas: reais.filter(l => l.status === 'interrompida').length };
}

export function tituloNaoFechou(vendedor: string, pend: PendenciaDia[], t: { total: number; naoAtendidas: number; caidas: number }) {
  const lig = `${t.total} ${t.total === 1 ? 'ligação' : 'ligações'}`;
  return `✗ ${vendedor} não fechou o dia, falta: ${textoFalta(pend)} · tentativas: ${lig}, ${t.naoAtendidas} não atendidas, ${t.caidas} caídas`;
}

export const chaveFechou = (rotaId: string, data: string) => `fechou:${rotaId}:${data}`;
export const chaveNaoFechou = (rotaId: string, data: string) => `naofechou:${rotaId}:${data}`;
