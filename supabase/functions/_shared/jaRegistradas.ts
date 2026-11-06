// Paradas já informadas no dia; compartilhado por julia-viagem-ferramentas e julia-viagem-ligar.
type Parada = { id: string; visitada: boolean | null; dia?: string | null; cidade?: string | null; estado?: string | null; relato?: Record<string, unknown> | null; organizacao?: { nome?: string | null; nome_fantasia?: string | null } | null };
const nomeEmpresa = (p?: Parada | null) => p?.organizacao?.nome_fantasia?.trim() || p?.organizacao?.nome?.trim() || 'a empresa';

type ParadaHoje = Parada;
export type JaRegistrada = { parada_id: string; empresa: string; cidade: string | null; uf: string | null; visitada: boolean; proximo_passo: string | null; proximo_passo_data: string | null };

/** Paradas já informadas no dia (para a Júlia não pedir de novo o que já está gravado). */
export function jaRegistradasHoje(paradas: ParadaHoje[] | null | undefined, hoje: string): JaRegistrada[] {
  return (paradas ?? []).filter(p => p.dia === hoje && p.visitada != null).map(p => {
    const r = (p.relato ?? {}) as Record<string, unknown>;
    const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
    return { parada_id: p.id, empresa: nomeEmpresa(p), cidade: p.cidade?.trim() || null, uf: p.estado?.trim() || null, visitada: !!p.visitada, proximo_passo: s(r.proximo_passo), proximo_passo_data: s(r.proximo_passo_data) };
  });
}

export function fraseJaRegistradas(itens: JaRegistrada[]) {
  if (!itens.length) return '';
  const partes = itens.map(i => `${i.visitada ? 'visita' : 'não visita'} na ${i.empresa}${i.cidade ? ` (${i.cidade})` : ''}`);
  return `Já registrado hoje: ${partes.join('; ')}.`;
}
