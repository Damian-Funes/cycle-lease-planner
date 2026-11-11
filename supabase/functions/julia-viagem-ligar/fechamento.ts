// Regra pura: o cron liga de novo no fim do dia se o dia não fechou e nada está marcado/rolando.
export type LigacaoDia = { origem: string; status: string; teste?: boolean; created_at?: string; updated_at?: string };
const PENDENTES = ['agendada', 'aguardando_escolha', 'discando', 'em_andamento'];
/** inicioFim = ISO do horário de contato (ex.: 17h BRT de hoje). */
export function precisaLigacaoFechamento(ls: LigacaoDia[], inicioFim: string): boolean {
  const reais = ls.filter(l => !l.teste);
  if (!reais.length) return false; // sem ligação no dia: o fluxo 'inicial' cuida
  if (reais.some(l => l.origem === 'fechamento')) return false; // no máximo uma por dia
  if (reais.some(l => PENDENTES.includes(l.status))) return false; // retorno futuro ou ligação em curso
  const t = new Date(inicioFim).getTime();
  // Já conversou de verdade depois do horário de contato: não insiste.
  return !reais.some(l => l.status === 'concluida' && new Date(l.updated_at ?? l.created_at ?? 0).getTime() >= t);
}
