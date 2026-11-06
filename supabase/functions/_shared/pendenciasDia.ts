export type TipoPendenciaDia =
  | "parada_pendente" | "pernoite_noite" | "nota_hotel"
  | "proximo_passo_sem_data" | "levantamento_incompleto" | "parada_sem_empresa" | "paradas_restantes"
  | "organizacao_incompleta";
export interface PendenciaDia { tipo: TipoPendenciaDia; id: string; titulo: string; detalhe: string }
type Relato = Record<string, unknown> | null | undefined;
export interface ParadaPendencia {
  id: string; visitada: boolean | null; cidade?: string | null; estado?: string | null; tipo?: string | null;
  organizacao_id?: string | null; relato?: Relato;
  organizacao?: { nome?: string | null; nome_fantasia?: string | null } | null;
}
export interface ContextoPendencias {
  id: string; data_inicio: string; data_fim: string;
  paradas: ParadaPendencia[];
  pernoites: { id: string; noite: string; tipo: string; gasto_id: string | null }[];
  gastos: { id: string; arquivo_path: string | null }[];
}
const vazio = (v: unknown) => v === undefined || v === null || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && !v.length);
/** Os 6 pontos do debrief; devolve os rótulos que ficaram vazios. */
export function faltasLevantamento(relato: Relato): string[] {
  const r = relato ?? {};
  const pontos: [string, boolean][] = [
    ["contato/decisor", vazio(r.contato_nome) && vazio(r.decisores)],
    ["sacos/safra", vazio(r.sacos_safra)],
    ["equipamento", vazio(r.equipamento_atual)],
    ["problema", vazio(r.problema_principal)],
    ["interesse", vazio(r.interesse)],
    ["concorrente/objeções", vazio(r.concorrente) && vazio(r.objecoes)],
  ];
  return pontos.filter(([, falta]) => falta).map(([rotulo]) => rotulo);
}
export const nomeParada = (p: ParadaPendencia) => p.organizacao?.nome_fantasia || p.organizacao?.nome || p.cidade || "Parada";
const lista = (itens: string[]) => itens.length <= 1 ? itens.join("") : `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;

/**
 * Fonte única das pendências. Sem `completo`, mantém só as do fechamento do dia (decidem se a Júlia liga).
 * Com `completo`, inclui o que faltou no debrief — usado pela Júlia em listar_pendentes e pelas notificações.
 */
/** Organização incompleta sugerida para a Júlia perguntar (opcional; nunca bloqueia o fechamento nem vira notificação). */
export interface OrganizacaoIncompletaSugerida { organizacao_id: string; nome: string; falta: string[]; motivo: string }
const ROTULO_FALTA: Record<string, string> = { contato: "contato com telefone", cidade: "cidade", uf: "UF", responsavel: "responsável" };

export function montarPendencias(contexto: ContextoPendencias, data: string, opcoes: { completo?: boolean; organizacaoIncompleta?: OrganizacaoIncompletaSugerida | null } = {}): PendenciaDia[] {
  const itens: PendenciaDia[] = contexto.paradas.filter(p => p.visitada == null).map(p => ({
    tipo: "parada_pendente", id: p.id, titulo: nomeParada(p),
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
  if (!opcoes.completo) return itens;
  for (const p of contexto.paradas.filter(x => x.visitada === true && x.tipo !== "pernoite")) {
    if (!p.organizacao_id) {
      itens.push({ tipo: "parada_sem_empresa", id: p.id, titulo: `Vincule a visita de ${p.cidade || "uma cidade"} a uma empresa`, detalhe: "Visita sem empresa vinculada" });
      continue;
    }
    const r = p.relato ?? {};
    if (vazio(r.proximo_passo_data)) itens.push({ tipo: "proximo_passo_sem_data", id: p.id, titulo: `Defina a data do próximo passo com ${nomeParada(p)}`, detalhe: vazio(r.proximo_passo) ? "Sem próximo passo combinado" : String(r.proximo_passo) });
    const faltas = faltasLevantamento(r);
    if (faltas.length) itens.push({ tipo: "levantamento_incompleto", id: p.id, titulo: `Complete o levantamento de ${nomeParada(p)}: faltou ${lista(faltas)}`, detalhe: faltas.join(", ") });
  }
  if (data >= contexto.data_fim && contexto.paradas.some(p => p.visitada == null)) {
    itens.push({ tipo: "paradas_restantes", id: contexto.id, titulo: "Informe as paradas que faltam antes de encerrar", detalhe: `${contexto.paradas.filter(p => p.visitada == null).length} parada(s) sem informação` });
  }
  const oi = opcoes.organizacaoIncompleta;
  if (oi) {
    const faltas = oi.falta.map(f => ROTULO_FALTA[f] ?? f);
    itens.push({ tipo: "organizacao_incompleta", id: oi.organizacao_id, titulo: `Completar ${oi.nome}: falta ${lista(faltas)}`, detalhe: `Opcional — ${oi.motivo}` });
  }
  return itens;
}

/** Tipos que viram notificação do vendedor (nota do hotel já tem aviso próprio). */
export const TIPOS_NOTIFICAVEIS: TipoPendenciaDia[] = ["proximo_passo_sem_data", "levantamento_incompleto", "parada_sem_empresa", "paradas_restantes"];
export const chavePendencia = (rotaId: string, p: PendenciaDia) => `pend:${rotaId}:${p.tipo}:${p.id}`;
export function linkPendencia(rotaId: string, p: PendenciaDia) {
  return p.tipo === "paradas_restantes" ? `/viagens/${rotaId}/hoje` : `/viagens/${rotaId}/hoje?parada=${p.id}`;
}
export function pendenciasNotificaveis(contexto: ContextoPendencias, data: string) {
  return montarPendencias(contexto, data, { completo: true }).filter(p => TIPOS_NOTIFICAVEIS.includes(p.tipo));
}
export function resumoAdmin(vendedor: string, contexto: ContextoPendencias, data: string) {
  const visitas = contexto.paradas.filter(p => p.visitada === true && p.tipo !== "pernoite").length;
  const pend = pendenciasNotificaveis(contexto, data).length;
  return `${vendedor} fechou o dia: ${visitas} ${visitas === 1 ? "visita" : "visitas"}, ${pend} ${pend === 1 ? "pendência" : "pendências"}`;
}
