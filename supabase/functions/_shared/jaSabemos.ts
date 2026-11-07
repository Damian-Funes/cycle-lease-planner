// "Já sabemos" da organização para a Júlia não perguntar de novo.
// Fonte única: view public.organizacao_situacao_atual (último valor de cada campo) + pessoas com e_decisor.
// `proximo_passo` só vem depois da SQL docs/sql/julia-ja-sabemos-proposta.sql (até lá, é omitido).
import type { PessoaContato } from './contatosOrg.ts';

/** Mesmo padrão de public.fn_registrar_decisores: "Nome (cargo)". */
export function nomesDecisoresComCargo(t: string | null | undefined): { nome: string; cargo: string | null }[] {
  if (!t) return [];
  const re = /(\p{Lu}\p{L}+(?: \p{Lu}\p{L}+)?)\s*\(([^()]{2,80})\)/gu;
  return [...t.matchAll(re)].map(m => ({ nome: m[1].trim(), cargo: m[2].trim().replace(/^./, c => c.toLocaleUpperCase('pt-BR')) || null }));
}

type Valor = { valor?: unknown; data?: string | null; motivo?: string | null } | null | undefined;
export type SituacaoAtual = {
  organizacao_id: string;
  sacos_safra?: Valor; equipamento_atual?: Valor; problema_principal?: Valor; interesse?: Valor;
  concorrente?: Valor; decisores?: Valor; ultima_visita?: { data?: string | null } | null;
  proximo_passo?: Valor;
};
export type Decisor = { nome: string; cargo: string | null };
export type JaSabemos = {
  sacos_safra?: number; equipamento_atual?: string; problema_principal?: string;
  interesse?: string; motivo_interesse?: string; concorrente?: string; decisores?: Decisor[];
  proximo_passo?: string; proximo_passo_data?: string; ultimo_contato_em?: string;
};

const texto = (v: Valor) => { const s = typeof v?.valor === 'string' ? v.valor.trim() : ''; return s || undefined; };
const nomeOk = (n: string | null | undefined) => (n ?? '').normalize('NFD').replace(/[^A-Za-z]/g, '').length >= 3;

/** Só campos com valor. Decisores: pessoas com e_decisor; sem nenhuma, os nomes do último levantamento. */
export function montarJaSabemos(s: SituacaoAtual | null | undefined, pessoas: PessoaContato[] | null | undefined = []): JaSabemos {
  const js: JaSabemos = {};
  const sacos = Number(s?.sacos_safra?.valor);
  if (s?.sacos_safra?.valor != null && Number.isFinite(sacos) && sacos > 0) js.sacos_safra = sacos;
  const eq = texto(s?.equipamento_atual); if (eq) js.equipamento_atual = eq;
  const pr = texto(s?.problema_principal); if (pr) js.problema_principal = pr;
  const it = texto(s?.interesse); if (it) { js.interesse = it; const m = s?.interesse?.motivo?.trim(); if (m) js.motivo_interesse = m; }
  const co = texto(s?.concorrente); if (co) js.concorrente = co;
  let dec: Decisor[] = (pessoas ?? []).filter(p => p.e_decisor && nomeOk(p.nome)).map(p => ({ nome: (p.nome ?? '').trim(), cargo: p.cargo?.trim() || null }));
  if (!dec.length) dec = nomesDecisoresComCargo(texto(s?.decisores));
  if (dec.length) js.decisores = dec.slice(0, 8);
  const pp = texto(s?.proximo_passo); if (pp) { js.proximo_passo = pp; const d = s?.proximo_passo?.data; if (d) js.proximo_passo_data = d; }
  const u = s?.ultima_visita?.data; if (u) js.ultimo_contato_em = u;
  return js;
}

const ddmm = (iso: string) => { const [, m, d] = iso.split('-'); return d && m ? `${d}/${m}` : iso; };
const curto = (s: string, max = 80) => {
  if (s.length <= max) return s;
  const corte = s.slice(0, max); const i = corte.lastIndexOf(' ');
  return `${(i > 40 ? corte.slice(0, i) : corte).replace(/[\s,;.:]+$/, '')}…`;
};
const num = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
export function sacosFalados(n: number): string {
  if (n >= 1_000_000) { const v = n / 1_000_000; return `${num(v)} ${v < 2 ? 'milhão' : 'milhões'} de sacos`; }
  if (n >= 1000) return `${num(n / 1000)} mil sacos`;
  return `${num(n)} sacos`;
}
const INTERESSE: Record<string, string> = { alto: 'alto', medio: 'médio', baixo: 'baixo' };

/** Frase curta: "Já sabemos: 150 mil sacos, equipamento: …, decisor Gilberto (Diretor), interesse alto (último contato 06/11)." Vazia quando nada se sabe. */
export function fraseJaSabemos(js: JaSabemos | null | undefined, empresa?: string): string {
  if (!js) return '';
  const p: string[] = [];
  if (js.sacos_safra) p.push(`${sacosFalados(js.sacos_safra)}/safra`);
  if (js.equipamento_atual) p.push(`equipamento: ${curto(js.equipamento_atual)}`);
  if (js.problema_principal) p.push(`problema: ${curto(js.problema_principal)}`);
  if (js.decisores?.length) p.push(`${js.decisores.length > 1 ? 'decisores' : 'decisor'} ${js.decisores.map(d => d.cargo ? `${d.nome} (${d.cargo})` : d.nome).join(', ')}`);
  if (js.interesse) p.push(`interesse ${INTERESSE[js.interesse] ?? js.interesse}`);
  if (js.concorrente) p.push(`concorrente: ${curto(js.concorrente)}`);
  if (js.proximo_passo) p.push(`próximo passo em aberto: ${curto(js.proximo_passo)}${js.proximo_passo_data ? ` (${ddmm(js.proximo_passo_data)})` : ''}`);
  if (!p.length) return '';
  const onde = empresa ? ` da ${empresa}` : '';
  return `Já sabemos${onde}: ${p.join(', ')}${js.ultimo_contato_em ? ` (último contato ${ddmm(js.ultimo_contato_em)})` : ''}.`;
}

export const temJaSabemos = (js: JaSabemos | null | undefined) => !!js && Object.keys(js).some(k => k !== 'ultimo_contato_em');

// deno-lint-ignore no-explicit-any
type Db = { from: (t: string) => any };
/** Uma ida ao banco; falha nunca derruba a ligação (só some o "já sabemos"). */
export async function carregarSituacoes(db: Db, ids: (string | null | undefined)[]): Promise<Map<string, SituacaoAtual>> {
  const mapa = new Map<string, SituacaoAtual>();
  const unicos = [...new Set(ids.filter((x): x is string => !!x))];
  if (!unicos.length) return mapa;
  try {
    const r = await db.from('organizacao_situacao_atual').select('*').in('organizacao_id', unicos);
    if (r.error) { console.warn('ja_sabemos falhou', r.error.code); return mapa; }
    for (const s of (r.data ?? []) as SituacaoAtual[]) mapa.set(s.organizacao_id, s);
  } catch { console.warn('ja_sabemos falhou'); }
  return mapa;
}
