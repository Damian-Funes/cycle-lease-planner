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

export type OrgIncompleta = { organizacao_id: string; nome: string; cidade: string | null; uf: string | null; falta: string[]; prioridade: number; motivo: string; distancia_km: number | null };
const ROTULO: Record<string, string> = { contato: 'o contato com telefone', cidade: 'a cidade', uf: 'a UF', responsavel: 'o responsável' };
const juntar = (xs: string[]) => xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`;
/** Uma organização por ligação: frase curta para a Júlia perguntar. */
export function mensagemIncompleta(o: OrgIncompleta | null): string {
 if (!o) return 'Nenhuma organização incompleta para perguntar hoje.';
 return `Uma organização para completar: ${o.nome}${o.cidade ? ` (${[o.cidade, o.uf].filter(Boolean).join('/')})` : ''}, ${o.motivo}. Falta ${juntar(o.falta.map(f => ROTULO[f] ?? f))}.`;
}
export function mensagemCompletar(r: { acoes?: string[]; avisos?: string[]; faltas?: string[] } | null, nome: string): string {
 const a = new Set(r?.acoes ?? []);
 if (a.has('ja_descartada')) return `${nome} já estava descartada.`;
 if (a.has('descartou')) return `${nome} descartada — não vou mais perguntar dela.`;
 const partes: string[] = [];
 if (a.has('pessoa_criada')) partes.push('contato cadastrado');
 if (a.has('telefone_completado') || a.has('cargo_completado')) partes.push('contato atualizado');
 if (a.has('telefone_adicional')) partes.push('telefone novo guardado como adicional');
 if (a.has('telefone_ja_existia')) partes.push('esse telefone já estava cadastrado');
 if (a.has('cidade_completada') || a.has('uf_completada')) partes.push('cidade/UF salvas');
 if (a.has('descobrir')) partes.push('criei a tarefa para pegar o contato');
 if (a.has('sugerir_visita')) partes.push('anotei a sugestão de visita (a viagem não mudou)');
 const faltam = r?.faltas?.length ? ` Ainda falta ${juntar(r.faltas.map(f => ROTULO[f] ?? f))}.` : ` ${nome} está completa.`;
 return `${partes.length ? partes.join('; ').replace(/^./, c => c.toUpperCase()) + '.' : 'Salvo.'}${faltam}`;
}
