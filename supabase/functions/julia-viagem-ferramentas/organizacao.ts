export type OpcaoOrganizacao = { id: string; nome: string; cidade: string | null; uf: string | null; matriz: string | null; matriz_id: string | null };
const local = (o: OpcaoOrganizacao) => [o.cidade, o.uf].filter(Boolean).join('/');
/** Frase curta para a Júlia ler as opções. */
export function mensagemBusca(opcoes: OpcaoOrganizacao[]): string {
 if (!opcoes.length) return 'Não encontrei essa empresa. Posso cadastrar como nova; confirme o nome, a cidade e a UF.';
 const itens = opcoes.map((o, i) => `${i + 1}) ${o.nome}${local(o) ? ` (${local(o)})` : ''}${o.matriz ? `, filial de ${o.matriz}` : ''}`);
 return `Encontrei ${opcoes.length === 1 ? '1 empresa' : `${opcoes.length} empresas`}: ${itens.join('; ')}. Confirme qual é, ou se é outra unidade.`;
}
export function mensagemVinculo(r: { nome?: string; criada?: boolean; ja_vinculada?: boolean } | null, filial: boolean): string {
 const nome = r?.nome ?? 'a empresa';
 if (r?.ja_vinculada) return `Essa parada já estava vinculada à ${nome} — tudo certo.`;
 if (r?.criada) return filial ? `Criei a filial ${nome} como lead e vinculei a parada.` : `Criei ${nome} como lead e vinculei a parada.`;
 return `Parada vinculada à ${nome}.`;
}
