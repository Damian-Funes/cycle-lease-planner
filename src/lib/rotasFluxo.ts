export type StatusRota = 'rascunho' | 'aguardando_aprovacao' | 'aprovada' | 'reprovada' | 'concluida' | 'cancelada';
export const STATUS_ROTAS: Record<StatusRota, string> = {
  rascunho: 'Rascunho', aguardando_aprovacao: 'Aguardando aprovação', aprovada: 'Aprovada',
  reprovada: 'Reprovada', concluida: 'Concluída', cancelada: 'Cancelada',
};
export function hojeRota() {
  // Supabase uses UTC for current_date; match the database boundary exactly.
  return new Date().toISOString().slice(0, 10);
}
export function diaRota(data: string) { const [, mes, dia] = data.split('-'); return `${dia}/${mes}`; }
export function prestacaoPendente(rota: { status: string; data_rota: string }, hoje = hojeRota()) {
  return rota.status === 'aprovada' && rota.data_rota < hoje;
}
export function paradaInformada(p: { visitada?: boolean | null; resultado?: string | null; motivo_nao_visita?: string | null }) {
  return p.visitada === true ? Boolean(p.resultado?.trim()) : p.visitada === false && Boolean(p.motivo_nao_visita?.trim());
}
export function validarEnvio(data: string, paradas: { objetivo?: string | null; tipo: string; organizacao_id: string | null }[], pendente?: { data_rota: string }, hoje = hojeRota()) {
  const erros: string[] = [];
  if (!data || data < hoje) erros.push('A data da rota deve ser hoje ou uma data futura.');
  if (!paradas.length) erros.push('Adicione ao menos uma parada.');
  paradas.forEach((p, i) => {
    if (!p.objetivo?.trim()) erros.push(`Parada ${i + 1}: informe o objetivo.`);
    if (p.tipo === 'visita' && !p.organizacao_id) erros.push(`Parada ${i + 1}: selecione uma organização.`);
  });
  if (pendente) erros.push(`Preste contas da rota de ${diaRota(pendente.data_rota)} antes de pedir nova viagem.`);
  return erros;
}
export function resumoMensal(rotas: { vendedor_id: string; data_rota: string; paradas: { visitada: boolean | null }[] }[]) {
  const grupos = new Map<string, { vendedor_id: string; rotas: number; dias: Set<string>; visitadas: number; naoVisitadas: number }>();
  for (const r of rotas) {
    const g = grupos.get(r.vendedor_id) ?? { vendedor_id: r.vendedor_id, rotas: 0, dias: new Set<string>(), visitadas: 0, naoVisitadas: 0 };
    g.rotas++; g.dias.add(r.data_rota);
    for (const p of r.paradas) { if (p.visitada === true) g.visitadas++; if (p.visitada === false) g.naoVisitadas++; }
    grupos.set(r.vendedor_id, g);
  }
  return [...grupos.values()].map(g => ({ ...g, dias: g.dias.size }));
}