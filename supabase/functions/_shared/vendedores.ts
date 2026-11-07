// Admin por voz: casamento do vendedor falado e regra de quem pode atribuir a outro.
// O banco (fn_julia_responsavel) é a autoridade; aqui só se resolve o nome para um id e se avisa.
import { edicaoAte1, MIN_APROX, normalizarNome, primeiroNome } from './contatosOrg.ts';

export type Vendedor = { id: string; nome: string };
export type CasamentoVendedor =
  | { tipo: 'exato' | 'primeiro_nome' | 'aproximado'; vendedor: Vendedor }
  | { tipo: 'ambiguo'; opcoes: Vendedor[] }
  | { tipo: 'nenhum'; opcoes: Vendedor[] };

/** Nome completo > primeiro nome único > primeiro nome com 1 letra de diferença (5+ letras) único. */
export function casarVendedor(falado: string, equipe: Vendedor[]): CasamentoVendedor {
  const alvo = normalizarNome(falado);
  if (!alvo) return { tipo: 'nenhum', opcoes: equipe };
  const exatos = equipe.filter(v => normalizarNome(v.nome) === alvo);
  if (exatos.length === 1) return { tipo: 'exato', vendedor: exatos[0] };
  if (exatos.length > 1) return { tipo: 'ambiguo', opcoes: exatos };
  const p1 = alvo.split(' ')[0];
  const mesmos = equipe.filter(v => normalizarNome(v.nome).split(' ')[0] === p1);
  if (mesmos.length === 1) return { tipo: 'primeiro_nome', vendedor: mesmos[0] };
  if (mesmos.length > 1) return { tipo: 'ambiguo', opcoes: mesmos };
  if (p1.length >= MIN_APROX) {
    const aprox = equipe.filter(v => edicaoAte1(normalizarNome(v.nome).split(' ')[0], p1));
    if (aprox.length === 1) return { tipo: 'aproximado', vendedor: aprox[0] };
    if (aprox.length > 1) return { tipo: 'ambiguo', opcoes: aprox };
  }
  return { tipo: 'nenhum', opcoes: equipe };
}

/** Lista falada da equipe para a variável {{vendedores}}: primeiros nomes, sem repetir. */
export const listaVendedores = (equipe: Vendedor[]) => [...new Set(equipe.map(v => primeiroNome(v.nome)).filter(Boolean))].sort().join(', ');

export type Atribuicao =
  | { ok: true; responsavel_id: string | null; avisos: string[]; nome?: string }
  | { ok: false; confirmar_vendedor: { nome_falado: string; motivo: 'ambiguo' | 'nao_encontrado'; opcoes: string[] }; mensagem: string };

/** Vendedor nunca atribui a outro (campo ignorado com aviso); admin precisa de casamento único. */
export function resolverAtribuicao(a: { ehAdmin: boolean; vendedorNome?: string | null; equipe: Vendedor[] }): Atribuicao {
  const falado = (a.vendedorNome ?? '').trim();
  if (!falado) return { ok: true, responsavel_id: null, avisos: [] };
  if (!a.ehAdmin) return { ok: true, responsavel_id: null, avisos: ['Só admin marca para outra pessoa: ficou com você mesmo.'] };
  const c = casarVendedor(falado, a.equipe);
  if (c.tipo === 'ambiguo' || c.tipo === 'nenhum') {
    const opcoes = c.opcoes.map(v => v.nome);
    const mensagem = c.tipo === 'ambiguo'
      ? `Tem mais de um "${falado}" no comercial: ${opcoes.join(', ')}. Qual deles? Nada foi gravado.`
      : `Não achei "${falado}" no comercial (${listaVendedores(a.equipe)}). Para quem é? Nada foi gravado.`;
    return { ok: false, confirmar_vendedor: { nome_falado: falado, motivo: c.tipo === 'ambiguo' ? 'ambiguo' : 'nao_encontrado', opcoes }, mensagem };
  }
  const avisos = c.tipo === 'aproximado' ? [`Usei o vendedor ${c.vendedor.nome} para "${falado}"; confirme.`] : [];
  return { ok: true, responsavel_id: c.vendedor.id, avisos, nome: c.vendedor.nome };
}

// deno-lint-ignore no-explicit-any
type Db = { from: (t: string) => any };
const PAPEIS_EQUIPE = ['comercial', 'rtv', 'gerente_comercial'];
/** Time comercial (quem pode receber atribuição do admin). */
export async function carregarEquipe(db: Db): Promise<Vendedor[]> {
  const r = await db.from('user_roles').select('user_id').in('role', PAPEIS_EQUIPE);
  if (r.error) throw r.error;
  const ids = [...new Set(((r.data ?? []) as { user_id: string }[]).map(x => x.user_id))];
  if (!ids.length) return [];
  const p = await db.from('profiles').select('user_id,nome').in('user_id', ids);
  if (p.error) throw p.error;
  return ((p.data ?? []) as { user_id: string; nome: string | null }[]).filter(x => x.nome).map(x => ({ id: x.user_id, nome: x.nome as string }));
}
/** Admin por voz só depois da SQL julia-gasto-admin (tabela de configuração existe). */
export async function adminVozPronto(db: Db): Promise<boolean> {
  const r = await db.from('julia_gasto_config').select('id').limit(1);
  return !r.error;
}
