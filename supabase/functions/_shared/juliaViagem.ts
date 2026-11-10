import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { canalContato, horarioBRT, permitidoLigar } from './juliaViagemRegras.ts';
import { montarPendencias } from './pendenciasDia.ts';
export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const criarAdmin = (url: string, key: string) => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
let clienteAdmin: ReturnType<typeof criarAdmin> | null = null;
/** Reaproveitado entre requisições do mesmo worker (evita recriar client a cada chamada). */
export function dbAdmin() {
  if (clienteAdmin) return clienteAdmin;
  const url = Deno.env.get('SUPABASE_URL'); const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Configuração Supabase indisponível.');
  clienteAdmin = criarAdmin(url, key);
  return clienteAdmin;
}
export async function usuario(req: Request, admin = false) {
  const header = req.headers.get('Authorization');
  const url = Deno.env.get('SUPABASE_URL'); const key = Deno.env.get('SUPABASE_ANON_KEY');
  if (!header?.startsWith('Bearer ') || !url || !key) throw new Error('401: Sessão necessária.');
  const client = createClient(url, key, { global: { headers: { Authorization: header } } });
  const { data, error } = await client.auth.getClaims(header.slice(7));
  if (error || !data?.claims?.sub) throw new Error('401: Sessão inválida.');
  if (admin) { const r = await client.rpc('has_role', { _user_id: data.claims.sub, _role: 'admin' }); if (r.error || !r.data) throw new Error('403: Somente admin.'); }
  return data.claims.sub as string;
}
export async function secretIgual(recebido: string | null, nome: string) {
  return secretIgualValor(recebido, Deno.env.get(nome));
}
/** Aceita qualquer um dos segredos definidos (ignora os vazios); compara todos, em tempo constante. */
export async function secretIgualAlgum(recebido: string | null, nomes: string[]) {
  let ok = false;
  for (const n of nomes) if (await secretIgual(recebido, n)) ok = true;
  return ok;
}
export async function secretIgualValor(recebido: string | null | undefined, esperadoBruto: string | null | undefined) {
  const esperado = esperadoBruto?.trim();
  recebido = recebido?.trim() ?? null;
  if (!recebido || !esperado) return false;
  const encoder = new TextEncoder();
  const a = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(recebido)));
  const b = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(esperado)));
  let diferenca = 0; for (let i = 0; i < a.length; i++) diferenca |= a[i] ^ b[i];
  return diferenca === 0;
}
export function check<T>(r: { data: T; error: { message: string } | null }): T { if (r.error) throw new Error(r.error.message); return r.data; }
export const SELECT_ROTA = '*,paradas:rota_paradas(*,organizacao:organizacoes(nome,nome_fantasia,pessoas(id,nome,cargo,e_decisor))),pernoites:rota_pernoites(*),gastos:rota_gastos(*)';
/** Com a tabela de dias sem visita (após a migração) a Júlia cobra os dias anteriores; antes dela, só o dia atual. */
export async function carregarRota(db: ReturnType<typeof dbAdmin>, rotaId: string) {
  const comDias = await db.from('rotas').select(`${SELECT_ROTA},dias_sem_visita:rota_dias_sem_visita(dia,motivo)`).eq('id', rotaId).single();
  if (!comDias.error) return comDias.data;
  return check(await db.from('rotas').select(SELECT_ROTA).eq('id', rotaId).single());
}
export async function contexto(db: ReturnType<typeof dbAdmin>, rotaId: string, data: string) {
  const r = await carregarRota(db, rotaId);
  const p = check(await db.from('profiles').select('user_id,nome,celular').eq('user_id', r.vendedor_id).single());
  if (!p) throw new Error('Perfil do vendedor não encontrado.');
  const roles = check(await db.from('user_roles').select('role').eq('user_id', r.vendedor_id));
  if (!permitidoLigar(r.vendedor_id, (roles ?? []).map(x => x.role))) throw new Error('403: Vendedor fora da whitelist.');
  return { rota: r, perfil: p, pendencias: montarPendencias(r, data) };
}
export async function notificar(db: ReturnType<typeof dbAdmin>, userId: string, chave: string, titulo: string, link: string, texto = '') {
  check(await db.from('notificacoes').upsert({ user_id: userId, chave, titulo, texto, link, tipo: 'julia_viagem' }, { onConflict: 'user_id,chave', ignoreDuplicates: true }));
}
/** Ponto de extensão: no futuro outro canal poderá reutilizar as mesmas escolhas; hoje só in-app. */
export async function enviarContato(db: ReturnType<typeof dbAdmin>, userId: string, rotaId: string, data: string) {
 switch(canalContato) {
  case 'inapp': return notificar(db,userId,`contato:${rotaId}:${data}`,'Quando a Júlia pode te ligar?',`/viagens/${rotaId}/hoje`,'Escolha Agora, 18h, 19h, 20h ou preencher no app.');
 }
}
export async function admins(db: ReturnType<typeof dbAdmin>) { return (check(await db.from('user_roles').select('user_id').eq('role', 'admin')) ?? []).map(p => p.user_id); }
export function erro(e: unknown) { const msg = e instanceof Error ? e.message : 'Erro inesperado.'; return json({ error: msg }, msg.startsWith('401:') ? 401 : msg.startsWith('403:') ? 403 : 400); }
export { corsHeaders, horarioBRT };