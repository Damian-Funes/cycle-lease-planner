export function motivoAssinatura(header: string | null, secret: string | undefined, now = Date.now()) {
 if (!secret?.trim()) return 'segredo_ausente';
 if (!header) return 'header_ausente';
 const t = header.match(/(?:^|,)\s*t=(\d+)/)?.[1];
 if (!t) return 'timestamp_ausente';
 if (!/(?:^|,)\s*v0=[a-f0-9]{64}/.test(header)) return 'v0_ausente';
 if (Math.abs(now / 1000 - Number(t)) > 1800) return 'timestamp_expirado';
 return 'hmac_diferente';
}
export async function assinaturaValida(raw: string, header: string | null, secret: string | undefined, now = Date.now()) {
 secret = secret?.trim();
 if (!header || !secret) return false;
 const t = header.match(/(?:^|,)\s*t=(\d+)/)?.[1];
 const signatures = [...header.matchAll(/(?:^|,)\s*v0=([a-f0-9]{64})/g)].map(m => m[1]);
 if (!t || !signatures.length || Math.abs(now / 1000 - Number(t)) > 1800) return false;
 const key = await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{ name: 'HMAC', hash: 'SHA-256' },false,['sign']);
 const expected = new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${t}.${raw}`)));
 return signatures.some(sig => { let d=0; for(let i=0;i<32;i++) d |= expected[i] ^ parseInt(sig.slice(i*2,i*2+2),16); return d===0; });
}
/**
 * Retorno/fechamento que caiu na caixa postal, não foi atendido ou durou < 20 s sem gravar nada:
 * devolve o horário (ISO) da única nova tentativa (+30 min), ou null. Nunca depois de 21:30 BRT (disca antes das 22h).
 */
export function precisaNovaTentativa(i: { origem: string; naoAtendeu: boolean; motivo?: string | null; duracao_s: number; gravou: boolean; agora: Date }): string | null {
 if (i.origem !== 'retorno' && i.origem !== 'fechamento') return null;
 const caixa = /voicemail|caixa/i.test(i.motivo ?? '');
 if (!(i.naoAtendeu || caixa || (i.duracao_s < 20 && !i.gravou))) return null;
 const t = new Date(i.agora.getTime() + 30 * 60000);
 const hora = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(t);
 const dia = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);
 return hora <= '22:00' && dia(t) === dia(i.agora) ? t.toISOString() : null;
}
/** Ligação caiu no meio: encerrou sem gravar nada (ou com parada ainda pendente) e foi curta ou terminou por silêncio/timeout. */
export function ligacaoInterrompida(i: { duracao_s: number; motivo?: string | null; gravou: boolean; paradaPendente: boolean }): boolean {
 const silencio = /timeout|silence|silencio|inactiv/i.test(i.motivo ?? '');
 return (!i.gravou || i.paradaPendente) && (i.duracao_s < 180 || silencio);
}
