import { z } from 'npm:zod@3';
import { admins, check, corsHeaders, dbAdmin, erro, json, notificar } from '../_shared/juliaViagem.ts';
import { assinaturaValida, ligacaoInterrompida, motivoAssinatura } from '../_shared/juliaWebhook.ts';
import { extrairCusto } from '../_shared/gastoJulia.ts';
import { pendenciasFechamento, tituloCaiu } from '../_shared/fechamentoDia.ts';
import { notificarResumoAdmins, sincronizarNotificacoes } from '../_shared/notificacoesViagem.ts';
const Event = z.object({ type: z.enum(['post_call_transcription','call_initiation_failure']), data: z.object({ conversation_id: z.string().min(1), failure_reason:z.string().optional(), transcript: z.array(z.object({ role:z.string(),message:z.string().nullable() }).passthrough()).optional(), analysis:z.object({ transcript_summary:z.string().optional() }).passthrough().optional(), metadata:z.object({ call_duration_secs:z.number().nonnegative().optional() }).passthrough().optional() }).passthrough() });
Deno.serve(async req => {
 if(req.method==='OPTIONS') return new Response('ok',{headers:corsHeaders});
 if(req.method!=='POST') return json({error:'Use POST.'},405);
 const raw=await req.text();
 const sig=req.headers.get('ElevenLabs-Signature');
 if(!await assinaturaValida(raw,sig,Deno.env.get('JULIA_WEBHOOK_SECRET'))) { console.warn('julia-viagem-webhook 401',motivoAssinatura(sig,Deno.env.get('JULIA_WEBHOOK_SECRET'))); return json({error:'Assinatura inválida.'},401); }
 try {
  const event=Event.parse(JSON.parse(raw)); const db=dbAdmin();
  // Ligação recebida: não há conversation_id antes de começar; vincula pelo ligacao_id das variáveis.
  const dv=((event.data as Record<string,unknown>).conversation_initiation_client_data as {dynamic_variables?:Record<string,unknown>}|undefined)?.dynamic_variables;
  const meta0=event.data.metadata as Record<string,unknown>|undefined;
  const custo=extrairCusto(meta0);
  // Só nomes de chaves (nunca valores), para conferir onde vem o custo.
  console.log('julia-viagem-webhook metadata_chaves', JSON.stringify({ chaves: Object.keys(meta0 ?? {}), charging: Object.keys((meta0?.charging ?? {}) as object) }));
  // Número de fora (permitido=nao): só registra duração/custo; não é ligação de vendedor.
  if(dv?.permitido==='nao'){
   const rid=typeof dv.recusa_id==='string' && /^[0-9a-f-]{36}$/i.test(dv.recusa_id) ? dv.recusa_id : null;
   const sid=String(((meta0?.phone_call ?? {}) as Record<string,unknown>).call_sid ?? '') || null;
   const r=await db.rpc('julia_finalizar_recusa',{p_recusa:rid,p_call_sid:sid,p_conversa:event.data.conversation_id,p_duracao:custo.duracao_s,p_creditos:custo.creditos});
   if(r.error) console.warn('julia-viagem-webhook recusa_falhou', r.error.code);
   return json({ok:true,recusada:true});
  }
  if(dv?.origem==='entrada' && typeof dv.ligacao_id==='string' && /^[0-9a-f-]{36}$/i.test(dv.ligacao_id))
   check(await db.from('ligacoes_viagem').update({conversation_id:event.data.conversation_id}).eq('id',dv.ligacao_id).eq('origem','entrada').is('conversation_id',null));
  // Oficial: busy/no-answer/unknown vêm em call_initiation_failure. Silêncio não significa não atendeu.
  const naoAtendeu=event.type==='call_initiation_failure';
  const resumo=event.data.analysis?.transcript_summary?.slice(0,4500) ?? 'Ligação sem resumo.';
  const result=check(await db.rpc('julia_finalizar_ligacao',{p_conversa:event.data.conversation_id,p_falha:naoAtendeu,p_resumo:resumo,p_transcricao:event.data.transcript ?? [],p_duracao:Math.round(event.data.metadata?.call_duration_secs ?? 0)}));
  if(custo.creditos!=null){ const u=await db.from('ligacoes_viagem').update({custo_creditos:custo.creditos}).eq('conversation_id',event.data.conversation_id); if(u.error) console.warn('julia-viagem-webhook custo_falhou', u.error.code); }
  // "O que faltou": nunca derruba o webhook.
  try {
   const l=check(await db.from('ligacoes_viagem').select('id,rota_id,vendedor_id,data_ref,status,teste,created_at').eq('conversation_id',event.data.conversation_id).maybeSingle());
   if(l && !l.teste && l.rota_id){
    const s=await sincronizarNotificacoes(db,l.rota_id,l.data_ref);
    let status=l.status;
    if(status==='concluida'){
     const desde=l.created_at;
     const [d,p,o]=await Promise.all([
      db.from('rota_diario').select('id',{count:'exact',head:true}).eq('rota_id',l.rota_id).like('texto','Júlia — %').gte('created_at',desde),
      db.from('rota_pernoites').select('id',{count:'exact',head:true}).eq('rota_id',l.rota_id).gte('created_at',desde),
      db.from('organizacao_levantamentos').select('id',{count:'exact',head:true}).eq('rota_id',l.rota_id).in('origem',['julia','faxina']).gte('created_at',desde),
     ]);
     const gravou=[d,p,o].some(r=>(r.count ?? 0)>0);
     const paradaPendente=((s.rota?.paradas ?? []) as {visitada:boolean|null}[]).some(x=>x.visitada==null);
     const meta=event.data.metadata as Record<string,unknown>|undefined;
     const motivo=String(meta?.termination_reason ?? event.data.failure_reason ?? '');
     if(ligacaoInterrompida({duracao_s:Math.round(event.data.metadata?.call_duration_secs ?? 0),motivo,gravou,paradaPendente})){
      // Status novo só existe após a SQL; se falhar, fica 'concluida' e o aviso sai igual.
      const u=await db.from('ligacoes_viagem').update({status:'interrompida',erro:`caiu: ${motivo || 'curta'}`.slice(0,200)}).eq('id',l.id).eq('status','concluida');
      if(!u.error) status='interrompida';
      const perf=await db.from('profiles').select('nome').eq('user_id',l.vendedor_id).maybeSingle();
      for(const a of await admins(db)) await notificar(db,a,`caiu:${l.id}`,tituloCaiu((perf.data?.nome ?? 'o vendedor').trim(),pendenciasFechamento(s.rota,l.data_ref)),`/viagens/${l.rota_id}/acompanhar`,`Encerrou aos ${Math.round(event.data.metadata?.call_duration_secs ?? 0)} s${motivo?` (${motivo})`:''}${gravou?'':', nada gravado'}.`);
     }
    }
    if(status==='concluida') await notificarResumoAdmins(db,l.id,s.rota,l.data_ref);
   }
  } catch(e){ console.warn('julia-viagem-webhook notificacoes', e instanceof Error ? e.message : 'erro'); }
  return json(result);
 } catch(e) {return erro(e);}
});