import { addDays, startOfMonth, startOfWeek } from "date-fns";

/** 6 semanas (42 dias) começando no domingo da semana do dia 1. */
export function gradeMes(mes: Date): Date[] {
  const ini = startOfWeek(startOfMonth(mes), { weekStartsOn: 0 });
  return Array.from({ length: 42 }, (_, i) => addDays(ini, i));
}

// Prefixos genéricos que não dizem nada numa pílula estreita ("Próximo passo:", "WhatsApp -", "Ligação para o" …).
const PREFIXO = /^\s*(?:pr[oó]xim[oa]\s+(?:passo|a[cç][aã]o|etapa|contato)|whats\s*app|wpp|zap|liga[cç][aã]o|ligar|telefonema|reuni[aã]o|visita|e-?mail|follow[\s-]?up|tarefa|lembrete)\s*(?:[:\-–—·|]+\s*|\s+(?:para|pra|com)\s+(?:(?:o|a|os|as)\s+)?)/i;

/** Título sem prefixos genéricos; se sobrar nada, devolve o original. */
export function limparTitulo(titulo: string): string {
  let t = (titulo || "").trim();
  for (let i = 0; i < 4; i++) {
    const n = t.replace(PREFIXO, "").trim();
    if (n === t) break;
    t = n;
  }
  return t || (titulo || "").trim();
}

/** Texto da pílula: empresa da atividade/oportunidade; sem empresa, título limpo. */
export function rotuloPilula(titulo: string, empresa?: string | null): string {
  return empresa?.trim() || limparTitulo(titulo);
}

const LARANJA = "#f97316";
const VIOLETA = "#8b5cf6";

function hueSat(hex: string): { h: number; s: number } | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const x = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s };
}

/**
 * Cor do tipo no calendário do celular: vermelho é só de atrasada,
 * então tipos vermelhos viram laranja e rosas viram violeta.
 */
export function corCalendario(cor: string | null | undefined): string {
  const c = cor || "#64748b";
  const hs = hueSat(c);
  if (!hs || hs.s < 0.35) return c;
  if (hs.h >= 345 || hs.h <= 15) return LARANJA;
  if (hs.h >= 300) return VIOLETA;
  return c;
}

// Medidas da célula (px): número do dia, pílula + espaço, linha "+N".
const CABECALHO = 24, PILULA = 18, MAIS = 14, TETO = 4;

/** Quantas pílulas cabem na célula (até 4) e quantas sobram para o "+N". */
export function pilulasVisiveis(alturaCelula: number, total: number): { visiveis: number; extra: number } {
  const limite = alturaCelula > 0 ? Math.max(1, Math.min(TETO, Math.floor((alturaCelula - CABECALHO - MAIS) / PILULA))) : 3;
  const visiveis = total <= limite ? total : limite;
  return { visiveis, extra: total - visiveis };
}
