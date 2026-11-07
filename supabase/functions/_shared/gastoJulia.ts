// Gasto da Júlia: regras puras usadas pela entrada, pelo webhook e pelo painel.

/** Só os 4 últimos dígitos ficam visíveis. */
export function mascararTelefone(t: string | null | undefined): string {
  const d = String(t ?? '').replace(/\D/g, '');
  if (!d) return '?';
  return d.length <= 4 ? '****' : `***${d.slice(-4)}`;
}

/** Hash com sal (para agrupar o mesmo número sem guardar o número). Sem sal, não gera hash. */
export async function hashTelefone(t: string | null | undefined, sal: string | undefined): Promise<string | null> {
  const d = String(t ?? '').replace(/\D/g, '');
  if (!d || !sal) return null;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${sal}:${d.slice(-10)}`));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Créditos e duração do evento pós-chamada; os nomes de campo variam, então lê os conhecidos. */
export function extrairCusto(metadata: Record<string, unknown> | undefined) {
  const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
  const charging = (metadata?.charging ?? {}) as Record<string, unknown>;
  return {
    duracao_s: Math.round(num(metadata?.call_duration_secs) ?? 0),
    creditos: num(metadata?.cost) ?? num(charging.call_charge) ?? null,
  };
}

/** R$ estimado: créditos × R$/crédito; sem créditos, minutos × R$/minuto; sem preço, null. */
export function custoEstimado(a: { segundos: number; creditos: number | null }, c: { reais_por_credito: number | null; reais_por_minuto: number | null }) {
  if (a.creditos != null && c.reais_por_credito != null) return { reais: a.creditos * c.reais_por_credito, base: 'creditos' as const };
  if (c.reais_por_minuto != null) return { reais: (a.segundos / 60) * c.reais_por_minuto, base: 'minutos' as const };
  return { reais: null, base: null };
}

/** Mesmo limite do banco (julia_finalizar_recusa): alerta quando passa de qualquer um. */
export const excedeLimite = (dia: { qtd: number; segundos: number }, c: { max_recusadas_dia: number; max_minutos_recusadas_dia: number }) =>
  dia.qtd > c.max_recusadas_dia || dia.segundos / 60 > c.max_minutos_recusadas_dia;
