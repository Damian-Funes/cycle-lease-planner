export type TipoPendenciaDia =
  | "parada_pendente" | "pernoite_noite" | "nota_hotel"
  | "proximo_passo_sem_data" | "levantamento_incompleto" | "parada_sem_empresa" | "paradas_restantes"
  | "organizacao_incompleta" | "dia_sem_registro" | "confirmar_extras";
export interface PendenciaDia { tipo: TipoPendenciaDia; id: string; titulo: string; detalhe: string }
type Relato = Record<string, unknown> | null | undefined;
export interface ParadaPendencia {
  id: string; visitada: boolean | null; dia?: string | null; cidade?: string | null; estado?: string | null; tipo?: string | null;
  organizacao_id?: string | null; relato?: Relato;
  organizacao?: { nome?: string | null; nome_fantasia?: string | null } | null;
}
export interface ContextoPendencias {
  id: string; data_inicio: string; data_fim: string;
  paradas: ParadaPendencia[];
  pernoites: { id: string; noite: string; tipo: string; gasto_id: string | null }[];
  gastos: { id: string; arquivo_path: string | null }[];
  /** Dias marcados "sem visita" (deslocamento/folga). Ausente = schema antigo: dias anteriores não são cobrados. */
  dias_sem_visita?: { dia: string }[] | null;
  /** Dias em que o vendedor já respondeu "visitou mais alguém?". Ausente/null = não perguntar (leitura falhou ou fora da Júlia). */
  extras_confirmados?: string[] | null;
}
export const PREFIXO_EXTRAS = "Júlia — extras ";
export const textoExtras = (dia: string, resposta: "sim" | "nao") => `${PREFIXO_EXTRAS}${dia}: ${resposta}`;
/** Dias AAAA-MM-DD já respondidos, a partir dos textos do diário. */
export function extrasConfirmados(textos: string[]): string[] {
  return textos.map(t => t.startsWith(PREFIXO_EXTRAS) ? t.slice(PREFIXO_EXTRAS.length, PREFIXO_EXTRAS.length + 10) : "").filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d));
}
const DIAS_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
/** "domingo, 08/11" a partir de AAAA-MM-DD. */
export function dataExtenso(iso: string) {
  const [a, m, d] = iso.split("-").map(Number);
  return `${DIAS_SEMANA[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]}, ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}
const somarDia = (iso: string, n: number) => { const [a, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10); };
/** Limite de dias antigos cobrados por ligação (o resto fica para a próxima). */
export const LIMITE_DIAS_ANTERIORES = 3;
/** Pendências dos dias anteriores da viagem (noite sem pernoite; dia sem visita registrada), da mais antiga para a mais nova. */
export function pendenciasDiasAnteriores(contexto: ContextoPendencias, data: string): PendenciaDia[] {
  if (!Array.isArray(contexto.dias_sem_visita)) return [];
  const dias: string[] = [];
  for (let d = contexto.data_inicio; d < data && d <= contexto.data_fim; d = somarDia(d, 1)) dias.push(d);
  const itens: PendenciaDia[] = []; const comPendencia = new Set<string>();
  for (const d of dias) {
    const temVisita = contexto.paradas.some(p => p.dia === d && p.visitada != null && p.tipo !== "pernoite");
    if (!temVisita && !contexto.dias_sem_visita.some(x => x.dia === d)) {
      itens.push({ tipo: "dia_sem_registro", id: d, titulo: `Visitas de ${dataExtenso(d)}`, detalhe: `Dia ${d} sem visita registrada: registre as visitas ou marque como dia sem visita` }); comPendencia.add(d);
    }
    if (d < contexto.data_fim && !contexto.pernoites.some(p => p.noite === d)) {
      itens.push({ tipo: "pernoite_noite", id: d, titulo: "Onde dormiu", detalhe: `Noite de ${dataExtenso(d)} (${d})` }); comPendencia.add(d);
    }
  }
  const permitidos = new Set([...comPendencia].sort().slice(0, LIMITE_DIAS_ANTERIORES));
  return itens.filter(i => permitidos.has(i.id));
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
  const itens: PendenciaDia[] = pendenciasDiasAnteriores(contexto, data);
  itens.push(...contexto.paradas.filter(p => p.visitada == null).map(p => ({
    tipo: "parada_pendente" as const, id: p.id, titulo: nomeParada(p),
    detalhe: [p.cidade, p.estado].filter(Boolean).join(" / "),
  })));
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
  // Uma vez por dia, depois de ao menos uma parada do dia informada: "visitou mais alguém que não estava na rota?".
  const extras = contexto.extras_confirmados;
  if (Array.isArray(extras) && !extras.includes(data) && contexto.paradas.some(p => p.dia === data && p.visitada != null && p.tipo !== "pernoite")) {
    itens.push({ tipo: "confirmar_extras", id: data, titulo: "Perguntar se visitou mais alguém fora da rota", detalhe: "Pergunte uma vez; se sim, buscar_organizacao → adicionar_parada → registrar_visita" });
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
