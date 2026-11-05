import { z } from 'npm:zod@3';
import { check, contexto, corsHeaders, dbAdmin, erro, horarioBRT, json, notificar } from '../_shared/juliaViagem.ts';
import { assinaturaValida } from '../_shared/juliaWebhook.ts';
const Event = z.object({ type: z.enum(['post_call_transcription','call_initiation_failure']), data: z.object({ conversation_id: z.string().min(1), transcript: z.array(z.object({ role:z.string(),message:z.string().nullable() }).passthrough()).optional(), analysis:z.object({ transcript_summary:z.string().optional() }).passthrough().optional(), metadata:z.object({ call_duration_secs:z.number().nonnegative().optional() }).passthrough().optional() }).passthrough() });
Deno.serve(async req => {
 if(req.method==='OPTIONS') return new Response('ok',{headers:corsHeaders});
 if(req.method!=='POST') return json({error:'Use POST.'},405);
 const raw=await req.text();
 if(!await assinaturaValida(raw,req.headers.get('ElevenLabs-Signature'),Deno.env.get('JULIA_WEBHOOK_SECRET'))) return json({error:'Assinatura inválida.'},401);
 try {
  const event=Event.parse(JSON.parse(raw)); const db=dbAdmin();
  const l=check(await db.from('ligacoes_viagem').select('*').eq('conversation_id',event.data.conversation_id).maybeSingle());
  if(!l) return json({ok:true,ignorada:true});
  if(['concluida','nao_atendeu','falhou'].includes(l.status)) return json({ok:true,duplicada:true});
  const naoAtendeu=event.type==='call_initiation_failure' || !(event.data.transcript ?? []).some(p=>p.role==='user' && p.message?.trim());
  const resumo=event.data.analysis?.transcript_summary?.slice(0,4500) ?? 'Ligação sem resumo.';
  // Claim do evento impede duas inserções do mesmo webhook; falha parcial é reportada.
  const claimed=check(await db.from('ligacoes_viagem').update({status:naoAtendeu?'nao_atendeu':'concluida',resumo,transcricao:event.data.transcript ?? [],duracao_s:event.data.metadata?.call_duration_secs ?? 0,updated_at:new Date().toISOString()}).eq('id',l.id).in('status',['discando','em_andamento']).select('id').maybeSingle());
  if(!claimed) return json({ok:true,duplicada:true});
  const {data,hora}=horarioBRT();
  if(naoAtendeu && !l.teste && l.data_ref===data) {
   const next=new Date(Date.now()+30*60000);
   if(hora<'22:00' && horarioBRT(next).hora<'22:00') { const r=await db.rpc('julia_reservar_ligacao',{p_rota:l.rota_id,p_origem:'retentativa',p_quando:next.toISOString()}); if(r.error && !r.error.message.includes('3 tentativas')) throw r.error; }
  } else if(!naoAtendeu) {
   check(await db.from('rota_diario').insert({rota_id:l.rota_id,autor_id:l.vendedor_id,texto:`Ligação da Júlia: ${resumo}`}));
  }
  const c=await contexto(db,l.rota_id,data);
  for(const p of c.pendencias.filter(p=>p.tipo==='nota_hotel')) await notificar(db,l.vendedor_id,`nota:${p.id}`,'Envie a nota do hotel',`/viagens/${l.rota_id}/hoje?nota=${p.id}`,p.detalhe);
  return json({ok:true});
 } catch(e) {return erro(e);}
});