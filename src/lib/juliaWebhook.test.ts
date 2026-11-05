import { expect,it } from 'vitest';
import { assinaturaValida } from '../../supabase/functions/_shared/juliaWebhook';
it('verifica HMAC, rejeita assinatura inválida e evento antigo',async()=>{
 const secret='dummy-test-only',t='1793898000',raw='{"type":"post_call_transcription"}';
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const sig=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${t}.${raw}`)))).map(n=>n.toString(16).padStart(2,'0')).join('');
 expect(await assinaturaValida(raw,`t=${t},v0=${sig}`,secret,Number(t)*1000)).toBe(true);
 expect(await assinaturaValida(raw+'x',`t=${t},v0=${sig}`,secret,Number(t)*1000)).toBe(false);
 expect(await assinaturaValida(raw,`t=${t},v0=${sig}`,secret,(Number(t)+1801)*1000)).toBe(false);
 expect(await assinaturaValida(raw,null,undefined)).toBe(false);
});