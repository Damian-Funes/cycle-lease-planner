// Frases curtas para a Júlia falar ao vendedor; puras e testáveis sem chamadas.
type Parada = { visitada: boolean | null; dia?: string | null; relato?: Record<string, unknown> | null; organizacao?: { nome?: string | null; nome_fantasia?: string | null } | null };

export const nomeEmpresa = (p?: Parada | null) => p?.organizacao?.nome_fantasia?.trim() || p?.organizacao?.nome?.trim() || 'a empresa';
const ddmm = (iso?: string | null) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '');

/** Decide se uma nova chamada é repetição segura da mesma prestação. */
export function visitaRepetida(p: Parada, visitada: boolean, hoje: string): 'nova' | 'repetida' | 'conflito' {
  if (p.visitada === null || p.visitada === undefined) return 'nova';
  return p.visitada === visitada && p.dia === hoje ? 'repetida' : 'conflito';
}

export function mensagemVisita(empresa: string, visitada: boolean, atividadeId?: string | null, data?: string | null) {
  if (!visitada) return `Não visita na ${empresa} salva.`;
  return atividadeId ? `Visita da ${empresa} salva. Próximo passo criado na agenda para ${ddmm(data)}.` : `Visita da ${empresa} salva.`;
}

export function mensagemPernoite(b: { tipo: string; hotel_nome?: string; cidade?: string; pago_pela_empresa?: boolean; valor?: number }) {
  if (b.tipo === 'hotel' && b.pago_pela_empresa && !b.valor) return `Pernoite no ${b.hotel_nome}${b.cidade ? ` (${b.cidade})` : ''} salvo como pago pela empresa; o financeiro confirma o valor pela nota. Falta a foto da nota.`;
  if (b.tipo === 'hotel') return `Pernoite no ${b.hotel_nome}${b.cidade ? ` (${b.cidade})` : ''} salvo; falta a foto da nota.`;
  if (b.tipo === 'voltou_base') return 'Pernoite salvo: voltou para a base.';
  return `Pernoite${b.cidade ? ` em ${b.cidade}` : ''} sem custo salvo.`;
}

export function mensagemRetorno(iso: string) {
  const h = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  return `Retorno agendado para ${h}.`;
}

/** Garante frase humana: nunca JSON cru nem prefixos técnicos. */
export function fraseErro(msg: unknown) {
  const t = typeof msg === 'string' ? msg.replace(/^\d{3}:\s*/, '').trim() : '';
  return !t || /^[[{]/.test(t) ? 'Não consegui salvar agora; tente de novo em instantes.' : t;
}

export { jaRegistradasHoje, fraseJaRegistradas, type JaRegistrada } from '../_shared/jaRegistradas.ts';

/** Retorno só vale se a linha devolvida ficou 'agendada' no horário pedido. */
export function retornoConfirmado(l: { status?: string; agendada_para?: string } | null | undefined, quando: string) {
 return !!l && l.status === 'agendada' && !!l.agendada_para && new Date(l.agendada_para).getTime() === new Date(quando).getTime();
}
export function mensagemParadaExtra(r: { empresa?: string; ja_existia?: boolean; organizacao_criada?: boolean; dia?: string } | null | undefined) {
 const empresa = r?.empresa ?? 'a empresa'; const dia = r?.dia ? ` no dia ${r.dia.split('-').reverse().slice(0, 2).join('/')}` : '';
 if (r?.ja_existia) return `${empresa} já estava na viagem${dia}. Agora registre a visita com esse parada_id.`;
 return `Adicionei ${empresa}${dia} na viagem${r?.organizacao_criada ? ' como empresa nova' : ''}. Agora registre a visita com esse parada_id.`;
}
