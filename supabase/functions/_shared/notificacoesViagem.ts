import { chavePendencia, linkPendencia, pendenciasNotificaveis, resumoAdmin, type ContextoPendencias } from './pendenciasDia.ts';
// deno-lint-ignore no-explicit-any
type Db = any;
const check = <T>(r: { data: T; error: { message: string } | null }) => { if (r.error) throw new Error(r.error.message); return r.data; };
const carregar = async (db: Db, rotaId: string) => check(await db.from('rotas').select('*,paradas:rota_paradas(*,organizacao:organizacoes(nome,nome_fantasia)),pernoites:rota_pernoites(*),gastos:rota_gastos(*)').eq('id', rotaId).single());

/** Grava o que falta e marca como resolvido o que sumiu. Nunca apaga. */
export async function sincronizarNotificacoes(db: Db, rotaId: string, data: string) {
  const rota = await carregar(db, rotaId) as ContextoPendencias & { vendedor_id: string };
  const itens = pendenciasNotificaveis(rota, data);
  const chaves = itens.map(p => chavePendencia(rotaId, p));
  const abertas = check(await db.from('notificacoes').select('id,chave,resolvida_em').eq('user_id', rota.vendedor_id).eq('rota_id', rotaId).like('chave', 'pend:%')) as { id: string; chave: string; resolvida_em: string | null }[];
  for (const p of itens) {
    const chave = chavePendencia(rotaId, p); const existente = abertas.find(n => n.chave === chave);
    if (!existente) check(await db.from('notificacoes').upsert({ user_id: rota.vendedor_id, rota_id: rotaId, chave, tipo: 'viagem_pendencia', titulo: p.titulo, texto: p.detalhe, link: linkPendencia(rotaId, p) }, { onConflict: 'user_id,chave', ignoreDuplicates: true }));
    else check(await db.from('notificacoes').update({ titulo: p.titulo, texto: p.detalhe, resolvida_em: null, ...(existente.resolvida_em ? { lida_em: null } : {}) }).eq('id', existente.id));
  }
  const resolver = abertas.filter(n => !n.resolvida_em && !chaves.includes(n.chave)).map(n => n.id);
  if (resolver.length) check(await db.from('notificacoes').update({ resolvida_em: new Date().toISOString() }).in('id', resolver));
  return { rota, abertas: itens.length, resolvidas: resolver.length };
}

export async function notificarResumoAdmins(db: Db, ligacaoId: string, rota: ContextoPendencias & { vendedor_id: string }, data: string) {
  const perfil = check(await db.from('profiles').select('nome').eq('user_id', rota.vendedor_id).maybeSingle()) as { nome?: string } | null;
  const admins = (check(await db.from('user_roles').select('user_id').eq('role', 'admin')) as { user_id: string }[]).map(a => a.user_id);
  const titulo = resumoAdmin(perfil?.nome ?? 'Vendedor', rota, data);
  for (const admin of admins) check(await db.from('notificacoes').upsert({ user_id: admin, rota_id: rota.id, chave: `resumo:${ligacaoId}`, tipo: 'julia_viagem', titulo, texto: 'Ligação da Júlia concluída.', link: `/viagens/${rota.id}/acompanhar` }, { onConflict: 'user_id,chave', ignoreDuplicates: true }));
}
