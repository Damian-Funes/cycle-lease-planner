// Envia push (PushAlert) para os aparelhos ativos do dono de uma notificação.
// Entradas: {notificacao_id} (trigger pg_net), {acao:'adiados'} (cron 7h BRT), {acao:'teste'} (JWT do usuário).
// Seguro sem segredo: só envia o que já está pendente/adiado e uma única vez (claim atômico em push_status).
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { dbAdmin, json, usuario } from '../_shared/juliaViagem.ts';
import { decidirEnvio, inscritoInvalido, montarPush, montarResumoAdiados, regraDaChave, type RegraPush } from '../_shared/push.ts';

const Corpo = z.union([
  z.object({ notificacao_id: z.string().uuid() }),
  z.object({ acao: z.enum(['adiados', 'teste']) }),
]);
type Payload = { title: string; message: string; url: string; icon: string };
const db = () => dbAdmin();

async function enviarPara(subscriberId: string, p: Payload) {
  const key = Deno.env.get('PUSHALERT_API_KEY')?.trim();
  if (!key) return { ok: false, invalido: false, erro: 'PUSHALERT_API_KEY ausente' };
  const body = new URLSearchParams({ title: p.title, message: p.message, url: p.url, icon: p.icon, subscriber: subscriberId });
  try {
    const r = await fetch('https://api.pushalert.co/rest/v1/send', { method: 'POST', headers: { Authorization: `api_key=${key}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body, signal: AbortSignal.timeout(8000) });
    const txt = await r.text(); let j: unknown = txt; try { j = JSON.parse(txt); } catch { /* texto */ }
    const ok = r.ok && (j as { success?: boolean })?.success !== false;
    return { ok, invalido: !ok && inscritoInvalido(r.status, j), erro: ok ? null : `HTTP ${r.status}: ${String((j as { msg?: string })?.msg ?? '').slice(0, 120)}` };
  } catch (e) { return { ok: false, invalido: false, erro: String((e as Error).message).slice(0, 120) }; }
}

/** Envia para todos os aparelhos ativos do usuário; desativa os inválidos. */
async function enviarUsuario(userId: string, p: Payload) {
  const { data: subs, error } = await db().from('push_inscricoes').select('id,subscriber_id').eq('user_id', userId).eq('ativo', true);
  if (error) throw new Error(error.message);
  let enviados = 0; const erros: string[] = [];
  for (const s of subs ?? []) {
    const r = await enviarPara(s.subscriber_id, p);
    if (r.ok) { enviados++; await db().from('push_inscricoes').update({ ultimo_envio: new Date().toISOString() }).eq('id', s.id); }
    else { erros.push(r.erro ?? 'erro'); if (r.invalido) await db().from('push_inscricoes').update({ ativo: false, motivo_inativo: (r.erro ?? 'inválido').slice(0, 200) }).eq('id', s.id); }
  }
  return { aparelhos: subs?.length ?? 0, enviados, erros };
}

async function regras(): Promise<RegraPush[]> {
  const { data } = await db().from('push_regras').select('prefixo,ativo,urgente');
  return (data as RegraPush[] | null) ?? [];
}

async function porNotificacao(id: string) {
  // Claim: só uma execução passa de pendente → enviando.
  const { data: n } = await db().from('notificacoes').update({ push_status: 'enviando' }).eq('id', id).eq('push_status', 'pendente')
    .gte('created_at', new Date(Date.now() - 86400000).toISOString()).select('id,user_id,chave,titulo,texto,link').maybeSingle();
  if (!n) return { ignorado: 'já processada ou fora da janela' };
  const decisao = decidirEnvio(regraDaChave(n.chave, await regras()), new Date());
  if (decisao !== 'enviar') { await db().from('notificacoes').update({ push_status: decisao === 'adiar' ? 'adiado' : 'ignorado' }).eq('id', id); return { decisao }; }
  const r = await enviarUsuario(n.user_id, montarPush(n));
  const status = r.aparelhos === 0 ? 'sem_aparelho' : r.enviados > 0 ? 'enviado' : 'erro';
  await db().from('notificacoes').update({ push_status: status, push_enviado_em: r.enviados ? new Date().toISOString() : null }).eq('id', id);
  if (r.erros.length) console.warn('push-enviar erros', JSON.stringify({ id, erros: r.erros }));
  return { status, enviados: r.enviados };
}

async function adiados() {
  const { data, error } = await db().from('notificacoes').update({ push_status: 'enviando' }).eq('push_status', 'adiado')
    .gte('created_at', new Date(Date.now() - 86400000).toISOString()).is('resolvida_em', null).select('id,user_id');
  if (error) throw new Error(error.message);
  const porUser = new Map<string, string[]>();
  for (const n of data ?? []) porUser.set(n.user_id, [...(porUser.get(n.user_id) ?? []), n.id]);
  let usuarios = 0;
  for (const [u, ids] of porUser) {
    const r = await enviarUsuario(u, montarResumoAdiados(ids.length));
    if (r.enviados) usuarios++;
    await db().from('notificacoes').update({ push_status: r.aparelhos === 0 ? 'sem_aparelho' : r.enviados ? 'enviado' : 'erro', push_enviado_em: r.enviados ? new Date().toISOString() : null }).in('id', ids);
  }
  // Adiados velhos (> 24h) não viram push.
  await db().from('notificacoes').update({ push_status: 'expirado' }).eq('push_status', 'adiado').lt('created_at', new Date(Date.now() - 86400000).toISOString());
  return { usuarios, notificacoes: data?.length ?? 0 };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const p = Corpo.safeParse(await req.json().catch(() => ({})));
    if (!p.success) return json({ erro: 'Corpo inválido.' }, 400);
    if ('notificacao_id' in p.data) return json(await porNotificacao(p.data.notificacao_id));
    if (p.data.acao === 'adiados') return json(await adiados());
    const uid = await usuario(req);
    const r = await enviarUsuario(uid, { title: 'Teste do CRM LS', message: 'Se você está vendo isto, as notificações estão funcionando.', url: 'https://crmls.com.br/notificacoes/ativar', icon: 'https://crmls.com.br/icons/icon-192.png' });
    return json(r);
  } catch (e) {
    const m = String((e as Error).message);
    const st = /^40[13]/.test(m) ? Number(m.slice(0, 3)) : 500;
    console.error('push-enviar', m.slice(0, 200));
    return json({ erro: st === 500 ? 'Falha interna.' : m.slice(5) }, st);
  }
});
