import { supabase } from "@/integrations/supabase/client";

/** Regras puras da cobrança de atividades (espelham o SQL; o banco é a autoridade). */
export const LIMITE_DIAS_UTEIS_ESCALADA = 3;
export const LIMITE_EMPURRANDO = 3;

/** Dias úteis (seg–sex, sem feriados) depois de `de` até `ate`, inclusive. */
export function diasUteisEntre(de: Date, ate: Date): number {
  const d = new Date(Date.UTC(de.getFullYear(), de.getMonth(), de.getDate()));
  const fim = Date.UTC(ate.getFullYear(), ate.getMonth(), ate.getDate());
  let n = 0;
  while (true) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getTime() > fim) break;
    const w = d.getUTCDay();
    if (w !== 0 && w !== 6) n++;
  }
  return n;
}

export const escalada = (vencimento: Date, hoje = new Date()) => diasUteisEntre(vencimento, hoje) > LIMITE_DIAS_UTEIS_ESCALADA;
export const empurrando = (reagendamentos?: number | null) => (reagendamentos ?? 0) >= LIMITE_EMPURRANDO;
export const textoValido = (s?: string | null) => (s ?? "").trim().length >= 3;
export const MIN_RESULTADO = 10;
export const resultadoValido = (s?: string | null) => (s ?? "").trim().length >= MIN_RESULTADO;

/** Vencida "de ontem para trás": entra no aviso de abertura do CRM. */
export function vencidaAntesDeHoje(dataIso: string, agora = new Date()) {
  const d = new Date(dataIso);
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  return d < hoje;
}

export function percentualNoPrazo(noPrazo: number, total: number) {
  return total > 0 ? Math.round((noPrazo / total) * 100) : null;
}

const rpc = (fn: string, args: Record<string, unknown>) => (supabase as any).rpc(fn, args);

function erroAmigavel(e: any): Error {
  const msg = String(e?.message ?? e ?? "");
  if (/function .* does not exist|Could not find the function/i.test(msg)) {
    return new Error("Recurso ainda não ativado no banco (aguardando aprovação da migração).");
  }
  return new Error(msg || "Não foi possível salvar.");
}

export async function concluirAtividade(id: string, resultado: string) {
  if (!resultadoValido(resultado)) throw new Error(`Descreva o resultado (mínimo ${MIN_RESULTADO} caracteres).`);
  const { error } = await rpc("fn_atividade_concluir", { p_id: id, p_resultado: resultado.trim() });
  if (error) throw erroAmigavel(error);
}

export async function reagendarAtividade(id: string, novaData: Date, motivo: string) {
  if (!textoValido(motivo)) throw new Error("Informe o motivo.");
  const { data, error } = await rpc("fn_atividade_reagendar", { p_id: id, p_data: novaData.toISOString(), p_motivo: motivo.trim() });
  if (error) throw erroAmigavel(error);
  return data as number;
}

export async function cancelarAtividade(id: string, motivo: string) {
  if (!textoValido(motivo)) throw new Error("Informe o motivo.");
  const { error } = await rpc("fn_atividade_cancelar", { p_id: id, p_motivo: motivo.trim() });
  if (error) throw erroAmigavel(error);
}

/** Não fiz: culpa do vendedor (tempo/esquecimento). Exige motivo e nova data; conta como reagendamento. */
export async function naoFizAtividade(id: string, novaData: Date, motivo: string) {
  if (!textoValido(motivo)) throw new Error("Informe o motivo.");
  const { data, error } = await rpc("fn_atividade_nao_fiz", { p_id: id, p_data: novaData.toISOString(), p_motivo: motivo.trim() });
  if (error) throw erroAmigavel(error);
  return data as number;
}

export interface AtividadeTravando { id: string; titulo: string; data_inicio: string; organizacao: string | null }

/** Atividades vencidas há mais de 1 dia útil que travam o Novo orçamento. Sem migração aplicada: não trava. */
export async function buscarTravaOrcamento(): Promise<{ travado: boolean; itens: AtividadeTravando[] }> {
  const { data, error } = await rpc("fn_minha_trava_orcamento", {});
  if (error) return { travado: false, itens: [] };
  const linhas = (data ?? []) as any[];
  const travado = linhas.some((l) => l.travado);
  return { travado, itens: travado ? linhas.filter((l) => l.id).map((l) => ({ id: l.id, titulo: l.titulo, data_inicio: l.data_inicio, organizacao: l.organizacao })) : [] };
}

export async function liberarOrcamentoHoje(userId: string, motivo: string) {
  if (!textoValido(motivo)) throw new Error("Informe o motivo.");
  const { error } = await rpc("fn_liberar_orcamento", { p_user: userId, p_motivo: motivo.trim() });
  if (error) throw erroAmigavel(error);
}
