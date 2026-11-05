export type TipoPendenciaDia = "parada_pendente" | "pernoite_noite" | "nota_hotel";
export interface PendenciaDia { tipo: TipoPendenciaDia; id: string; titulo: string; detalhe: string }
export interface ContextoPendencias {
  id: string; data_inicio: string; data_fim: string;
  paradas: { id: string; visitada: boolean | null; cidade?: string | null; estado?: string | null; organizacao?: { nome?: string | null; nome_fantasia?: string | null } | null }[];
  pernoites: { id: string; noite: string; tipo: string; gasto_id: string | null }[];
  gastos: { id: string; arquivo_path: string | null }[];
}
/** Paradas não possuem dia planejado. A pendência não significa obrigação de visitar hoje. */
export function montarPendencias(contexto: ContextoPendencias, data: string): PendenciaDia[] {
  const itens: PendenciaDia[] = contexto.paradas.filter(p => p.visitada == null).map(p => ({
    tipo: "parada_pendente", id: p.id, titulo: p.organizacao?.nome_fantasia || p.organizacao?.nome || p.cidade || "Parada",
    detalhe: [p.cidade, p.estado].filter(Boolean).join(" / "),
  }));
  if (data >= contexto.data_inicio && data < contexto.data_fim && !contexto.pernoites.some(p => p.noite === data)) {
    itens.push({ tipo: "pernoite_noite", id: data, titulo: "Onde dormiu", detalhe: `Noite de ${data}` });
  }
  for (const p of contexto.pernoites) {
    if (p.tipo === "hotel" && p.noite <= data && p.gasto_id && !contexto.gastos.find(g => g.id === p.gasto_id)?.arquivo_path) {
      itens.push({ tipo: "nota_hotel", id: p.gasto_id, titulo: "Enviar nota do hotel", detalhe: `Noite de ${p.noite}` });
    }
  }
  return itens;
}