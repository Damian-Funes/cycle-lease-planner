// Regras puras dos envios de orçamento para multinacionais (BASF, CTVA, Syngenta…).
// O banco é a autoridade (fn_enviar_multinacional, fn_envio_situacao, fn_voltar_negociacao_direta,
// fn_definir_cliente_final); aqui ficam só textos, agrupamentos e padrões de tela.

export type SituacaoEnvio = "enviado" | "negociando" | "venceu" | "perdeu";
export const SITUACOES_ENVIO: { valor: SituacaoEnvio; rotulo: string }[] = [
  { valor: "enviado", rotulo: "Enviado" },
  { valor: "negociando", rotulo: "Negociando" },
  { valor: "venceu", rotulo: "Venceu" },
  { valor: "perdeu", rotulo: "Perdeu" },
];
export const rotuloSituacao = (s: string) => SITUACOES_ENVIO.find(x => x.valor === s)?.rotulo ?? s;
export const envioAberto = (s: string) => s === "enviado" || s === "negociando";

export const COBRAR_DIAS_PADRAO = 60;
/** Data padrão para cobrar o retorno (hoje + 60 dias), em YYYY-MM-DD no fuso local. */
export function dataCobrancaPadrao(hoje = new Date(), dias = COBRAR_DIAS_PADRAO) {
  const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const SUFIXOS = new Set(["LTDA", "LTDA.", "S/A", "SA", "S.A.", "ME", "EIRELI", "EPP"]);
/** Nome curto para "via BASF, CTVA": primeira palavra útil; siglas ficam em maiúsculas. */
export function nomeCurto(nome: string | null | undefined) {
  const p = (nome ?? "").trim().split(/\s+/).filter(w => w && !SUFIXOS.has(w.toUpperCase()));
  const w = p[0] ?? "";
  if (!w) return "";
  return w.length <= 4 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
}

/** "via BASF, CTVA" — sem repetir e na ordem de envio. Vazio se não houver envio aberto. */
export function textoVia(nomes: (string | null | undefined)[]) {
  const vistos: string[] = [];
  for (const n of nomes) { const c = nomeCurto(n); if (c && !vistos.includes(c)) vistos.push(c); }
  return vistos.length ? `via ${vistos.join(", ")}` : "";
}

/** Cabeçalho do PDF de um envio: "À BASF … — Projeto: Sementes São Francisco, Rio Verde/GO". */
export function cabecalhoEnvio(multinacional: string, clienteFinal: string, cidade?: string | null, uf?: string | null) {
  const local = [cidade?.trim(), uf?.trim()].filter(Boolean).join("/");
  const projeto = [clienteFinal.trim(), local].filter(Boolean).join(", ");
  return { destinatario: multinacional.trim(), projeto, linha: `À ${multinacional.trim()} — Projeto: ${projeto}` };
}

export type LinhaParada = {
  envio_id: string; oportunidade_id: string | null; titulo: string | null; responsavel_id: string | null;
  numero_base: string; multinacional: string | null; cliente_final: string | null; situacao: string;
  cobrar_em: string | null; multinacional_desde: string | null; dias_desde_envio: number; dias_parado: number;
};
export type NegocioParado = {
  chave: string; oportunidade_id: string | null; titulo: string; cliente_final: string | null;
  responsavel_id: string | null; numero_base: string; dias_parado: number; dias_no_funil: number | null;
  via: string; envios: LinhaParada[];
};

/** Agrupa por negócio (um card por negócio), parado = menor tempo sem movimento entre os envios
 *  (o negócio só está parado se nenhuma multinacional se mexeu); ordena do mais parado. */
export function agruparParados(linhas: LinhaParada[], hoje = new Date()): NegocioParado[] {
  const m = new Map<string, LinhaParada[]>();
  for (const l of linhas) {
    const k = l.oportunidade_id ?? `orc:${l.numero_base}`;
    m.set(k, [...(m.get(k) ?? []), l]);
  }
  const dia = 86_400_000;
  return [...m.entries()].map(([chave, envios]) => {
    const e = [...envios].sort((a, b) => b.dias_parado - a.dias_parado);
    const desde = e.find(x => x.multinacional_desde)?.multinacional_desde;
    return {
      chave, oportunidade_id: e[0].oportunidade_id, titulo: e[0].titulo || e[0].numero_base,
      cliente_final: e[0].cliente_final, responsavel_id: e[0].responsavel_id, numero_base: e[0].numero_base,
      dias_parado: Math.min(...e.map(x => x.dias_parado)),
      dias_no_funil: desde ? Math.max(0, Math.floor((hoje.getTime() - new Date(desde).getTime()) / dia)) : null,
      via: textoVia(e.map(x => x.multinacional)), envios: e,
    };
  }).sort((a, b) => b.dias_parado - a.dias_parado || (b.dias_no_funil ?? 0) - (a.dias_no_funil ?? 0));
}
