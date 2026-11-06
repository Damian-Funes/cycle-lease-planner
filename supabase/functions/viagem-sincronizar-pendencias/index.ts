import { z } from 'npm:zod@3';
import { check, corsHeaders, dbAdmin, erro, horarioBRT, json, usuario } from '../_shared/juliaViagem.ts';
import { sincronizarNotificacoes } from '../_shared/notificacoesViagem.ts';
const Body = z.object({ rota_id: z.string().uuid().optional() }).strip();
Deno.serve(async req => {
 if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
 if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
 try {
  const uid = await usuario(req);
  const body = Body.parse(await req.json().catch(() => ({})));
  const db = dbAdmin(); const { data } = horarioBRT();
  const admin = !!check(await db.from('user_roles').select('role').eq('user_id', uid).eq('role', 'admin').maybeSingle());
  let rotas: { id: string; vendedor_id: string }[];
  if (body.rota_id) {
   const r = check(await db.from('rotas').select('id,vendedor_id').eq('id', body.rota_id).maybeSingle());
   if (!r || (r.vendedor_id !== uid && !admin)) throw new Error('403: Viagem indisponível.');
   rotas = [r];
  } else {
   // Viagens do próprio vendedor ainda no período (ou que terminaram ontem/hoje).
   const ontem = new Date(Date.parse(`${data}T12:00:00Z`) - 86400000).toISOString().slice(0, 10);
   rotas = check(await db.from('rotas').select('id,vendedor_id').eq('vendedor_id', uid).in('status', ['aprovada', 'concluida']).lte('data_inicio', data).gte('data_fim', ontem)) ?? [];
  }
  let abertas = 0, resolvidas = 0;
  for (const r of rotas.slice(0, 10)) { const s = await sincronizarNotificacoes(db, r.id, data); abertas += s.abertas; resolvidas += s.resolvidas; }
  // Cobrança de atividades vencidas (sininho do responsável + escalonamento para admins). Falha não bloqueia a sync da viagem.
  let atividades: unknown = null;
  try { const r = await db.rpc('fn_sincronizar_cobranca_atividades'); atividades = r.error ? { erro: 'indisponivel' } : r.data; } catch { atividades = { erro: 'indisponivel' }; }
  return json({ ok: true, viagens: rotas.length, abertas, resolvidas, atividades });
 } catch (e) { return erro(e); }
});
