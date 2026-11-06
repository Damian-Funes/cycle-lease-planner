/**
 * Busca tolerante de organizações (pura, sem dependências).
 * Normaliza texto, casa por palavras em qualquer ordem, aceita prefixo/plural,
 * "contém" e erro de digitação (distância de edição), e ordena por relevância.
 */

export interface OrgBuscavel {
  nome?: string | null;
  nome_fantasia?: string | null;
  cidade?: string | null;
  estado?: string | null;
  uf?: string | null;
  cnpj?: string | null;
}

export function normalizarBusca(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function soDigitos(s: string | null | undefined) {
  return (s ?? "").replace(/\D/g, "");
}

export function distanciaEdicao(a: string, b: string, max = Infinity): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let menor = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < menor) menor = cur[j];
    }
    if (menor > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

function tolerancia(len: number) {
  if (len >= 8) return 2;
  if (len >= 5) return 1;
  if (len === 4) return 1;
  return 0;
}

/** Pontuação de uma palavra digitada contra as palavras dos campos: 3 exato/prefixo, 2 contém, 1 aproximado, 0 nada. */
function pontuarPalavra(q: string, palavras: string[], digitos: string): number {
  let melhor = 0;
  const qDig = /^\d+$/.test(q);
  if (qDig && q.length >= 2 && digitos.includes(q)) melhor = digitos.startsWith(q) ? 3 : 2;
  for (const w of palavras) {
    if (w === q || w.startsWith(q)) return 3;
    // plural/singular: "sementes" digitado acha "semente"
    if (q.length >= 4 && q.endsWith("s") && w === q.slice(0, -1)) return 3;
    if (q.length >= 3 && w.includes(q)) melhor = Math.max(melhor, 2);
  }
  if (melhor > 0) return melhor;
  const tol = tolerancia(q.length);
  if (tol === 0) return 0;
  for (const w of palavras) {
    if (w.length < 3) continue;
    if (distanciaEdicao(q, w, tol) <= tol) return 1;
    // prefixo aproximado: "sement" errado contra início de palavra maior
    if (w.length > q.length && distanciaEdicao(q, w.slice(0, q.length), tol) <= tol) return 1;
  }
  return 0;
}

/** Relevância (>0 casa; maior = melhor). Termo vazio retorna 1. */
export function pontuarOrganizacao(o: OrgBuscavel, termo: string): number {
  const qs = normalizarBusca(termo).split(" ").filter(Boolean);
  if (qs.length === 0) return 1;
  const texto = normalizarBusca([o.nome, o.nome_fantasia, o.cidade, o.estado, o.uf].filter(Boolean).join(" "));
  const palavras = texto.split(" ").filter(Boolean);
  const digitos = soDigitos(o.cnpj);
  const termoDig = soDigitos(termo);
  // CNPJ digitado com pontuação (ex.: "12.345.678/0001-90")
  if (termoDig.length >= 5 && /^[\d.\-/\s]+$/.test(termo.trim())) {
    return digitos.includes(termoDig) ? 300 : 0;
  }
  let total = 0;
  for (const q of qs) {
    const p = pontuarPalavra(q, palavras, digitos);
    if (p === 0) return 0;
    total += p;
  }
  const nomeNorm = normalizarBusca(o.nome);
  const bonus = nomeNorm.startsWith(normalizarBusca(termo)) ? 1 : 0;
  return (total / qs.length) * 100 + bonus;
}

export function filtrarOrganizacoes<T extends OrgBuscavel>(lista: T[], termo: string): T[] {
  if (!normalizarBusca(termo) && !soDigitos(termo)) return lista;
  return lista
    .map((o, i) => ({ o, i, s: pontuarOrganizacao(o, termo) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.o);
}

/**
 * Filtro para o <Command filter> (cmdk) dos seletores de organização.
 * O value do item é o texto buscável (nome, fantasia, cidade...). Itens com value
 * iniciado por "__" (ex.: "Nenhuma", "Criar nova") ficam sempre visíveis.
 */
export function filtroCmdkOrganizacao(value: string, search: string): number {
  if (value.startsWith("__")) return 0.0001;
  if (!search.trim()) return 1;
  const s = pontuarOrganizacao({ nome: value }, search);
  return s > 0 ? Math.min(1, s / 400) : 0;
}
