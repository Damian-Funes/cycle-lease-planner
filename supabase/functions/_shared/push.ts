// Regras puras do push (PushAlert). Sem Deno/APIs: usado pela edge function push-enviar e pelos testes (vitest).

export type RegraPush = { prefixo: string; ativo: boolean; urgente: boolean };

/** Padrão — espelha o seed de push_regras na SQL. Chave da notificação começa com o prefixo. */
export const REGRAS_PADRAO: RegraPush[] = [
  { prefixo: 'atividade:', ativo: true, urgente: false },        // vencida / escalada / empurrando
  { prefixo: 'julia-admin:', ativo: true, urgente: false },      // "X marcou para você"
  { prefixo: 'caiu:', ativo: true, urgente: true },              // ligação da Júlia caiu
  { prefixo: 'falha:', ativo: true, urgente: false },            // Júlia não conseguiu ligar
  { prefixo: 'nota:', ativo: true, urgente: false },             // nota do hotel
  { prefixo: 'julia-recusadas:', ativo: true, urgente: true },   // alerta de gasto (admin)
  { prefixo: 'rota-', ativo: true, urgente: false },             // genérico de rota
  { prefixo: 'rota-enviada:', ativo: true, urgente: false },     // admins: rota enviada para aprovação
  { prefixo: 'rota-aprovada:', ativo: true, urgente: false },    // vendedor
  { prefixo: 'rota-reprovada:', ativo: true, urgente: false },   // vendedor (com motivo)
  { prefixo: 'rota-rascunho:', ativo: false, urgente: false },   // só sininho
  { prefixo: 'rota-prestacao:', ativo: false, urgente: false },  // só sininho
  { prefixo: 'orcamento-trava:', ativo: false, urgente: false }, // trava já aparece na tela
  { prefixo: 'pend:', ativo: false, urgente: false },            // só sininho
  { prefixo: 'resumo:', ativo: false, urgente: false },          // só sininho
  { prefixo: 'fechou:', ativo: true, urgente: false },           // admins: vendedor fechou o dia (respeita silêncio)
  { prefixo: 'naofechou:', ativo: true, urgente: false },        // admins: 22h não fechou (chega às 7h)
];

/** Prefixo mais longo que casa vence. Sem regra = só sininho. */
export function regraDaChave(chave: string | null | undefined, regras: RegraPush[] = REGRAS_PADRAO): RegraPush | null {
  if (!chave) return null;
  let melhor: RegraPush | null = null;
  for (const r of regras) if (chave.startsWith(r.prefixo) && (!melhor || r.prefixo.length > melhor.prefixo.length)) melhor = r;
  return melhor?.ativo ? melhor : null;
}

/** Hora em America/Sao_Paulo (sem horário de verão desde 2019: UTC-3). */
export function horaBRT(agora: Date): number {
  return (agora.getUTCHours() + 21) % 24;
}

/** Silêncio 21h–7h BRT (21:00 até 06:59). */
export function emSilencio(agora: Date): boolean {
  const h = horaBRT(agora);
  return h >= 21 || h < 7;
}

export function decidirEnvio(regra: RegraPush | null, agora: Date): 'enviar' | 'adiar' | 'ignorar' {
  if (!regra) return 'ignorar';
  if (regra.urgente || !emSilencio(agora)) return 'enviar';
  return 'adiar';
}

const corta = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

/** Remove valores em R$, números grandes, telefones e e-mails: o push aparece na tela bloqueada. */
export function limparTexto(t: string | null | undefined): string {
  return (t ?? '')
    .replace(/R\$\s?[\d.,]+(\s?(mil|mi|milhões?|k))?/gi, '')
    .replace(/\S+@\S+\.\S+/g, '')
    .replace(/\+?\d[\d\s().-]{7,}\d/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .trim();
}

export const SITE_PUSH = 'https://crmls.com.br';

export function montarPush(n: { titulo: string; texto?: string | null; link?: string | null }) {
  const titulo = corta(limparTexto(n.titulo) || 'CRM LS', 64);
  const msg = corta(limparTexto(n.texto) || 'Toque para abrir no CRM.', 140);
  const link = n.link && n.link.startsWith('/') && !n.link.startsWith('//') ? n.link : '/';
  return { title: titulo, message: msg, url: SITE_PUSH + link, icon: SITE_PUSH + '/icons/icon-192.png' };
}

export function montarResumoAdiados(qtd: number) {
  return {
    title: qtd === 1 ? 'Você tem 1 aviso no CRM' : `Você tem ${qtd} avisos no CRM`,
    message: 'Chegaram durante a noite. Toque para ver.',
    url: SITE_PUSH + '/',
    icon: SITE_PUSH + '/icons/icon-192.png',
  };
}

/** Resposta do PushAlert que indica inscrito que não existe mais → marcar inativo. */
// API v2 responde erros como {success:false, code:"<codigo>", msg:"..."}. Erros da conta/chave
// (versão errada, chave inválida, sem permissão, limite) NUNCA desativam aparelhos.
const ERRO_DA_CONTA = /version_mismatch|api_key|unauthori[sz]ed|forbidden|permission|rate_limit|too_many|quota|plan|website|site/i;
const ERRO_DO_INSCRITO = /invalid[_ ]subscriber|subscriber[_ ].*(not[_ ]found|invalid|unsubscribed|expired|inactive)|unsubscribed|expired_subscription/i;

export function inscritoInvalido(status: number, corpo: unknown): boolean {
  const obj = corpo && typeof corpo === 'object' ? (corpo as { code?: unknown; msg?: unknown; message?: unknown }) : null;
  const codigo = obj && typeof obj.code === 'string' ? obj.code : '';
  if (codigo && ERRO_DA_CONTA.test(codigo)) return false;
  if (status === 401 || status === 403 || status === 429 || status >= 500) return false;
  if (status === 410) return true;
  const txt = obj ? [codigo, obj.msg, obj.message].filter((x) => typeof x === 'string').join(' ') : String(corpo ?? '');
  return ERRO_DO_INSCRITO.test(txt);
}
