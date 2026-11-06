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
/** Ligação caiu no meio: encerrou sem gravar nada (ou com parada ainda pendente) e foi curta ou terminou por silêncio/timeout. */
export function ligacaoInterrompida(i: { duracao_s: number; motivo?: string | null; gravou: boolean; paradaPendente: boolean }): boolean {
 const silencio = /timeout|silence|silencio|inactiv/i.test(i.motivo ?? '');
 return (!i.gravou || i.paradaPendente) && (i.duracao_s < 180 || silencio);
}
