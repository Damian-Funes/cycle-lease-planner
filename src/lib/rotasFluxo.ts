export type StatusRota = 'rascunho' | 'aguardando_aprovacao' | 'aprovada' | 'reprovada' | 'concluida' | 'cancelada';
export const STATUS_ROTAS: Record<StatusRota, string> = {
  rascunho: 'Rascunho', aguardando_aprovacao: 'Aguardando aprovação', aprovada: 'Aprovada',
  reprovada: 'Reprovada', concluida: 'Concluída', cancelada: 'Cancelada',
};
export function hojeRota() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}
export function diaRota(data: string) { const [, mes, dia] = data.split('-'); return `${dia}/${mes}`; }
export function fimRota(r: { data_rota: string; data_fim?: string | null }) { return r.data_fim ?? r.data_rota; }
export function periodoRota(r: { data_rota: string; data_inicio?: string | null; data_fim?: string | null }) {
  const ini = r.data_inicio ?? r.data_rota; const fim = fimRota(r);
  return fim === ini ? diaRota(ini) : `${diaRota(ini)} a ${diaRota(fim)}`;
}
export function prestacaoPendente(rota: { status: string; data_rota: string; data_fim?: string | null }, hoje = hojeRota()) {
  return rota.status === 'aprovada' && fimRota(rota) < hoje;
}
export function paradaInformada(p: { visitada?: boolean | null; resultado?: string | null; motivo_nao_visita?: string | null }) {
  return p.visitada === true ? Boolean(p.resultado?.trim()) : p.visitada === false && Boolean(p.motivo_nao_visita?.trim());
}
export function validarEnvio(data: string, paradas: { objetivo?: string | null; tipo: string; organizacao_id: string | null; hotel_nome?: string | null; valor_diaria_est?: number | null }[], pendente?: { data_rota: string; data_fim?: string | null }, hoje = hojeRota(), dataFim?: string | null) {
  const erros: string[] = [];
  if (!data || (dataFim ?? data) < hoje) erros.push('A data da rota deve ser hoje ou uma data futura.');
  if (dataFim && dataFim < data) erros.push('A data de fim não pode ser antes do início.');
  if (!paradas.length) erros.push('Adicione ao menos uma parada.');
  paradas.forEach((p, i) => {
    if (!p.objetivo?.trim()) erros.push(`Parada ${i + 1}: informe o objetivo.`);
    if (p.tipo === 'visita' && !p.organizacao_id) erros.push(`Parada ${i + 1}: selecione uma organização.`);
    if (p.tipo === 'pernoite' && (!p.hotel_nome?.trim() || p.valor_diaria_est == null)) erros.push(`Parada ${i + 1}: informe hotel e valor da diária.`);
  });
  if (pendente) erros.push(`Preste contas da rota de ${diaRota(fimRota(pendente))} antes de pedir nova viagem.`);
  return erros;
}
export function resumoMensal(rotas: { vendedor_id: string; data_rota: string; data_fim?: string | null; paradas: { visitada: boolean | null }[] }[]) {
  const grupos = new Map<string, { vendedor_id: string; rotas: number; dias: Set<string>; visitadas: number; naoVisitadas: number }>();
  for (const r of rotas) {
    const g = grupos.get(r.vendedor_id) ?? { vendedor_id: r.vendedor_id, rotas: 0, dias: new Set<string>(), visitadas: 0, naoVisitadas: 0 };
    g.rotas++;
    for (const d = new Date(`${r.data_rota}T12:00:00Z`), f = new Date(`${fimRota(r)}T12:00:00Z`); d <= f; d.setUTCDate(d.getUTCDate() + 1)) g.dias.add(d.toISOString().slice(0, 10));
    for (const p of r.paradas) { if (p.visitada === true) g.visitadas++; if (p.visitada === false) g.naoVisitadas++; }
    grupos.set(r.vendedor_id, g);
  }
  return [...grupos.values()].map(g => ({ ...g, dias: g.dias.size }));
}
/** Pernoite não tem prestação "Visitei/Não visitei". */
export function paradasParaPrestar<T extends { tipo: string }>(paradas: T[]) { return paradas.filter((p) => p.tipo !== 'pernoite'); }
