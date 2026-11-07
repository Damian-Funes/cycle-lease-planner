// Casamento de contato falado pela Júlia com pessoas já cadastradas na organização.
// Espelha public.fn_casar_pessoa_org (SQL é a autoridade ao gravar; aqui só avisos e contexto).
export type PessoaOrg = { id?: string; nome: string | null; cargo?: string | null };
export type Casamento =
  | { tipo: 'exata' | 'primeiro_nome' | 'aproximado'; pessoa: PessoaOrg }
  | { tipo: 'ambigua'; candidatas: PessoaOrg[] }
  | { tipo: 'nova' };

export const normalizarNome = (s: string | null | undefined) =>
  (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();

const valido = (p: PessoaOrg) => normalizarNome(p.nome).length >= 3;

export function casarContato(nome: string, pessoas: PessoaOrg[]): Casamento {
  const alvo = normalizarNome(nome);
  if (!alvo) return { tipo: 'nova' };
  const lista = pessoas.filter(valido);
  const exatas = lista.filter(p => normalizarNome(p.nome) === alvo);
  if (exatas.length >= 1) return { tipo: 'exata', pessoa: exatas[0] };
  const [primeiro, segundo] = alvo.split(' ');
  // Sobrenomes diferentes ditos dos dois lados = pessoas diferentes.
  const sobrenomeOk = (ps?: string) => !(segundo && ps && segundo !== ps);
  const mesmas = lista.filter(p => {
    const [pp, ps] = normalizarNome(p.nome).split(' ');
    return pp === primeiro && sobrenomeOk(ps);
  });
  if (mesmas.length === 1) return { tipo: 'primeiro_nome', pessoa: mesmas[0] };
  if (mesmas.length > 1) return { tipo: 'ambigua', candidatas: mesmas };
  // Aproximado (ex.: "Marcello" → "Marcelo"): só nomes com 5+ letras, 1 letra de diferença, e único.
  if (primeiro.length < MIN_APROX) return { tipo: 'nova' };
  const parecidas = lista.filter(p => {
    const [pp, ps] = normalizarNome(p.nome).split(' ');
    return pp.length >= MIN_APROX && edicaoAte1(pp, primeiro) && sobrenomeOk(ps);
  });
  if (parecidas.length === 1) return { tipo: 'aproximado', pessoa: parecidas[0] };
  if (parecidas.length > 1) return { tipo: 'ambigua', candidatas: parecidas };
  return { tipo: 'nova' };
}

export const MIN_APROX = 5;
/** Distância de edição (Levenshtein) ≤ 1. Espelha public.fn_edicao_ate_1. */
export function edicaoAte1(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  const [l, c] = a.length >= b.length ? [a, b] : [b, a];
  let i = 0;
  while (i < c.length && l[i] === c[i]) i++;
  return l.length === c.length ? l.slice(i + 1) === c.slice(i + 1) : l.slice(i + 1) === c.slice(i);
}

export type PessoaContato = PessoaOrg & { telefone?: string | null; celular?: string | null; e_decisor?: boolean | null };
export type Contato = { nome: string; cargo: string | null; tem_telefone: boolean; decisor: boolean };
const telOk = (t?: string | null) => (t ?? '').replace(/\D/g, '').length >= 10;
/** Até 8 contatos da organização para a Júlia confirmar a pessoa (placeholders fora; decisores primeiro). */
export function contatosOrganizacao(pessoas: PessoaContato[] | null | undefined): Contato[] {
  return (pessoas ?? [])
    .filter(valido)
    .map(p => ({ nome: (p.nome ?? '').trim(), cargo: p.cargo?.trim() || null, tem_telefone: telOk(p.telefone) || telOk(p.celular), decisor: !!p.e_decisor }))
    .sort((a, b) => Number(b.decisor) - Number(a.decisor))
    .slice(0, 8);
}
const umContato = (c: Contato) => c.cargo ? `${c.nome} (${c.cargo})` : c.nome;
/** Frase dos contatos; com `empresa`, diz de qual organização (útil quando a busca devolve várias). */
export function fraseContatos(contatos: Contato[], empresa?: string): string {
  const onde = empresa ? ` na ${empresa}` : '';
  if (!contatos.length) return `Nenhum contato cadastrado${onde}.`;
  return `Contatos cadastrados${onde}: ${contatos.map(umContato).join(', ')}.`;
}

// Mesmo padrão de public.fn_registrar_decisores: "Nome (cargo)".
export function nomesDecisores(texto: string | null | undefined): string[] {
  if (!texto) return [];
  const re = /(\p{Lu}\p{L}+(?: \p{Lu}\p{L}+)?)\s*\(([^()]{2,80})\)/gu;
  return [...texto.matchAll(re)].map(m => m[1].trim());
}

export function avisosContatos(body: { contato_nome?: unknown; decisores?: unknown }, pessoas: PessoaOrg[]): string[] {
  const nomes = [typeof body.contato_nome === 'string' ? body.contato_nome : '', ...nomesDecisores(typeof body.decisores === 'string' ? body.decisores : '')].filter(Boolean);
  const avisos: string[] = [];
  for (const n of new Set(nomes)) {
    const c = casarContato(n, pessoas);
    if (c.tipo === 'ambigua') avisos.push(`"${n}" bate com mais de uma pessoa (${c.candidatas.map(p => p.nome).join(', ')}); não criei contato novo — confirme o nome completo pelo CRM.`);
  }
  return avisos;
}

type ParadaCtx = { id: string; visitada?: boolean | null; organizacao_id?: string | null; organizacao?: { nome?: string | null; nome_fantasia?: string | null; pessoas?: PessoaOrg[] | null } | null };
export function contatosParadas(paradas: ParadaCtx[]) {
  return (paradas ?? [])
    .filter(p => p.visitada == null && p.organizacao_id && p.organizacao)
    .map(p => ({
      parada_id: p.id,
      empresa: p.organizacao?.nome_fantasia || p.organizacao?.nome || '',
      contatos: (p.organizacao?.pessoas ?? []).filter(valido).slice(0, 8).map(x => ({ nome: x.nome, cargo: x.cargo ?? null })),
    }))
    .filter(x => x.contatos.length);
}

export const primeiroNome = (nome: string | null | undefined) => {
  const p = (nome ?? '').trim().split(/\s+/)[0] ?? '';
  return p ? p.charAt(0).toLocaleUpperCase('pt-BR') + p.slice(1).toLocaleLowerCase('pt-BR') : '';
};
