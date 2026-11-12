export const DAMIAN_ID = "660c2932-4404-48ca-ad2d-c76862bb9d74";
export const canalContato = "inapp" as const;
export function horarioBRT(agora = new Date()) {
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(agora);
  const p = (tipo: string) => partes.find(x => x.type === tipo)?.value ?? "";
  return { data: `${p("year")}-${p("month")}-${p("day")}`, hora: `${p("hour")}:${p("minute")}` };
}
export function permitidoLigar(userId: string, papeis: string[]) {
  return papeis.includes("comercial") || papeis.includes("rtv") || (userId === DAMIAN_ID && papeis.includes("admin"));
}
export function horarioRetorno(data: string, horario: string, agora: Date): string | null {
  if (!/^\d{2}:\d{2}$/.test(horario) || horario > "22:00" || Number(horario.slice(3)) > 59) return null;
  const t = new Date(`${data}T${horario}:00-03:00`);
  return Number.isFinite(t.getTime()) && t > agora && horarioBRT(agora).data === data ? t.toISOString() : null;
}
/** Limite de tentativas automáticas; só a nova tentativa após caixa postal pode ser a 4ª. */
export function podeTentar(tentativas: number, origem: "inicial" | "retentativa" | "retorno" | "retentativa_retorno", anteriores: string[], hora: string) {
  return tentativas < (origem === "retentativa_retorno" ? 4 : 3) && hora < "22:00" && !anteriores.includes(origem);
}
export function janelaCron(hora: string) {
  return (hora >= "15:50" && hora <= "22:00") || (hora >= "09:00" && hora <= "09:10");
}/**
 * Decide se a ligação pode discar. Ligação manual do admin disca com qualquer pendência
 * (inclusive organizacao_incompleta); cron/automática ignora nota_hotel e organizacao_incompleta (opcionais).
 */
export const MOTIVO_NADA_PENDENTE = "Nada pendente nesta viagem hoje.";
export function motivoNaoDiscar(pendencias: { tipo: string }[], manualAdmin: boolean): string | null {
  const relevantes = manualAdmin ? pendencias : pendencias.filter(p => p.tipo !== "nota_hotel" && p.tipo !== "organizacao_incompleta" && p.tipo !== "confirmar_extras");
  return relevantes.length ? null : MOTIVO_NADA_PENDENTE;
}
