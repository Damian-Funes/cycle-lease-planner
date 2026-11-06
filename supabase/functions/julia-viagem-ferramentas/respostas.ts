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

export function mensagemPernoite(b: { tipo: string; hotel_nome?: string; cidade?: string }) {
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
