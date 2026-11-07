// Variáveis dinâmicas da Júlia de viagem: uma única fonte para ligação feita (julia-viagem-ligar)
// e recebida (julia-viagem-entrada), para as duas nunca divergirem.
import { contatosParadas, primeiroNome } from './contatosOrg.ts';
import type { SituacaoAtual } from './jaSabemos.ts';
import { fraseJaRegistradas, jaRegistradasHoje } from './jaRegistradas.ts';

export const CHAVES_VARIAVEIS = ['vendedor_nome','vendedor_id','rota_id','rota_nome','data_hoje','noite','ultimo_dia','ligacao_id','pendencias','visitadas_hoje','ja_registradas_hoje','ja_registradas_hoje_frase','contatos_paradas','teste','origem','permitido'] as const;
export type Variaveis = Record<(typeof CHAVES_VARIAVEIS)[number], string | number>;

// deno-lint-ignore no-explicit-any
type Rota = { nome?: string | null; data_fim: string; paradas: any[] };

export function montarVariaveis(a: { rota: Rota; perfilNome: string | null; vendedorId: string; rotaId: string; ligacaoId: string; data: string; pendencias: unknown[]; teste: boolean; origem: string; permitido?: string; situacoes?: Map<string, SituacaoAtual> }): Variaveis {
  const ja = jaRegistradasHoje(a.rota.paradas, a.data);
  return {
    vendedor_nome: primeiroNome(a.perfilNome), vendedor_id: a.vendedorId, rota_id: a.rotaId,
    rota_nome: a.rota.nome || 'Viagem comercial', data_hoje: a.data.split('-').reverse().join('/'), noite: a.data,
    ultimo_dia: a.data === a.rota.data_fim ? 'sim' : 'não', ligacao_id: a.ligacaoId, pendencias: JSON.stringify(a.pendencias),
    visitadas_hoje: a.rota.paradas.filter((p: { dia: string; visitada: boolean | null }) => p.dia === a.data && p.visitada != null).length,
    ja_registradas_hoje: JSON.stringify(ja), ja_registradas_hoje_frase: fraseJaRegistradas(ja) || 'Nada registrado hoje ainda.',
    contatos_paradas: JSON.stringify(contatosParadas(a.rota.paradas, a.situacoes ?? new Map())), teste: a.teste ? 'sim' : 'não', origem: a.origem, permitido: a.permitido ?? 'sim',
  };
}

/** Variáveis vazias: a ElevenLabs exige todas as declaradas, mesmo quando a Júlia só se despede. */
export function variaveisVazias(permitido: string, nome = ''): Variaveis {
  const v = Object.fromEntries(CHAVES_VARIAVEIS.map(k => [k, ''])) as Variaveis;
  return { ...v, vendedor_nome: nome, pendencias: '[]', ja_registradas_hoje: '[]', contatos_paradas: '[]', visitadas_hoje: 0, teste: 'não', origem: 'entrada', permitido };
}

/** Chave de comparação de celular BR: DDD + últimos 8 dígitos (ignora 55 e o 9º dígito). */
export function chaveTelefone(tel: string | null | undefined): string | null {
  let d = (tel ?? '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
  if (d.startsWith('0')) d = d.slice(1);
  if (d.length < 10 || d.length > 11) return null;
  return d.slice(0, 2) + d.slice(-8);
}

export const MSG_ENTRADA = {
  nao: 'Oi! Esse número é exclusivo da equipe comercial da LS. Até mais!',
  livre: (n: string) => saudacaoCurta(n),
  ocupado: (n: string) => `Oi, ${n}! Já tem uma ligação minha em andamento com você. Vamos terminar por ela. Até já!`,
  erro: 'Tive um problema aqui, tenta de novo em instantes. Até já!',
  sim: (n: string) => saudacaoCurta(n),
};

function saudacaoCurta(n: string) {
  const nome = (n ?? '').trim();
  return nome ? `Oi, ${nome}! Em que posso te ajudar?` : 'Oi! Em que posso te ajudar?';
}

export type DecisaoEntrada = 'nao' | 'livre' | 'ocupado' | 'sim';
export function decidirEntrada(a: { vendedor: boolean; temViagem: boolean; ocupado: boolean }): DecisaoEntrada {
  if (!a.vendedor) return 'nao';
  if (a.ocupado) return 'ocupado';
  return a.temViagem ? 'sim' : 'livre';
}

export function respostaEntrada(dynamic_variables: Variaveis, first_message: string) {
  return { type: 'conversation_initiation_client_data', dynamic_variables, conversation_config_override: { agent: { first_message } } };
}
