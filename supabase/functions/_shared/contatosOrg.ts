// Casamento de contato falado pela Júlia com pessoas já cadastradas na organização.
// Espelha public.fn_casar_pessoa_org (SQL é a autoridade ao gravar; aqui só avisos e contexto).
export type PessoaOrg = { id?: string; nome: string | null; cargo?: string | null };
export type Casamento =
  | { tipo: 'exata' | 'primeiro_nome'; pessoa: PessoaOrg }
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
  const mesmas = lista.filter(p => {
    const [pp, ps] = normalizarNome(p.nome).split(' ');
    // Sobrenomes diferentes ditos dos dois lados = pessoas diferentes.
    return pp === primeiro && !(segundo && ps && segundo !== ps);
  });
  if (mesmas.length === 1) return { tipo: 'primeiro_nome', pessoa: mesmas[0] };
  if (mesmas.length > 1) return { tipo: 'ambigua', candidatas: mesmas };
  return { tipo: 'nova' };
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
