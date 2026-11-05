import { z } from 'npm:zod@3';
import { check, corsHeaders, dbAdmin, erro, json } from '../_shared/juliaViagem.ts';
import { assinaturaValida, motivoAssinatura } from '../_shared/juliaWebhook.ts';
const Event = z.object({ type: z.enum(['post_call_transcription','call_initiation_failure']), data: z.object({ conversation_id: z.string().min(1), failure_reason:z.string().optional(), transcript: z.array(z.object({ role:z.string(),message:z.string().nullable() }).passthrough()).optional(), analysis:z.object({ transcript_summary:z.string().optional() }).passthrough().optional(), metadata:z.object({ call_duration_secs:z.number().nonnegative().optional() }).passthrough().optional() }).passthrough() });
Deno.serve(async req => {
 if(req.method==='OPTIONS') return new Response('ok',{headers:corsHeaders});
 if(req.method!=='POST') return json({error:'Use POST.'},405);
 const raw=await req.text();
 const sig=req.headers.get('ElevenLabs-Signature');
 if(!await assinaturaValida(raw,sig,Deno.env.get('JULIA_WEBHOOK_SECRET'))) { console.warn('julia-viagem-webhook 401',motivoAssinatura(sig,Deno.env.get('JULIA_WEBHOOK_SECRET'))); return json({error:'Assinatura inválida.'},401); }
 try {
  const event=Event.parse(JSON.parse(raw)); const db=dbAdmin();
  // Oficial: busy/no-answer/unknown vêm em call_initiation_failure. Silêncio não significa não atendeu.
  const naoAtendeu=event.type==='call_initiation_failure';
  const resumo=event.data.analysis?.transcript_summary?.slice(0,4500) ?? 'Ligação sem resumo.';
  const result=check(await db.rpc('julia_finalizar_ligacao',{p_conversa:event.data.conversation_id,p_falha:naoAtendeu,p_resumo:resumo,p_transcricao:event.data.transcript ?? [],p_duracao:Math.round(event.data.metadata?.call_duration_secs ?? 0)}));
  return json(result);
 } catch(e) {return erro(e);}
});