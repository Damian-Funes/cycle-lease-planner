// Utilitários de normalização de texto para apresentação em documentos oficiais (PDFs, propostas).
// Garante imagem profissional independente de como o usuário digitou.

const LOWERCASE_WORDS = new Set([
  "de", "da", "do", "das", "dos", "e", "em", "na", "no", "nas", "nos",
  "a", "o", "as", "os", "para", "por", "com", "sem", "sob", "sobre",
  "à", "às", "ao", "aos",
]);

// Siglas comuns que devem permanecer em CAIXA ALTA
const UPPERCASE_TOKENS = new Set([
  "ltda", "me", "epp", "sa", "s/a", "eireli",
  "br", "go", "sp", "rj", "mg", "pr", "sc", "rs", "ba", "pe", "ce", "df",
  "es", "pa", "ma", "pb", "rn", "al", "se", "pi", "to", "mt", "ms", "ro", "ac", "am", "rr", "ap",
  "cep", "cnpj", "cpf", "ie", "rg", "uf",
  "ls", "lsb",
]);

function capitalizeWord(w: string, isFirst: boolean): string {
  if (!w) return w;
  const lower = w.toLowerCase();

  // Siglas
  if (UPPERCASE_TOKENS.has(lower)) return lower.toUpperCase();

  // Preposições/artigos minúsculos (exceto se for a primeira palavra)
  if (!isFirst && LOWERCASE_WORDS.has(lower)) return lower;

  // Preserva tokens com números/hífens (ex: LSB150-8L, B11000)
  if (/\d/.test(w)) return w.toUpperCase();

  // Preserva ordinal/abreviações com ponto (ex: Sr., Av.)
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** Title Case inteligente para nomes próprios, endereços, cidades. */
export function toTitleCase(input?: string | null): string {
  if (!input) return "";
  const cleaned = String(input).trim().replace(/\s+/g, " ");
  if (!cleaned) return "";

  return cleaned
    .split(" ")
    .map((word, idx) => {
      // Lida com hífens dentro da palavra (ex: maria-joão)
      if (word.includes("-")) {
        return word
          .split("-")
          .map((part, pIdx) => capitalizeWord(part, idx === 0 && pIdx === 0))
          .join("-");
      }
      return capitalizeWord(word, idx === 0);
    })
    .join(" ");
}

/** Capitaliza primeira letra de cada frase, mantém o restante. Para observações/condições. */
export function toSentenceCase(input?: string | null): string {
  if (!input) return "";
  const cleaned = String(input).trim().replace(/\s+/g, " ");
  if (!cleaned) return "";

  return cleaned
    .split(/([.!?]\s+)/)
    .map((part) => {
      if (!part || /^[.!?]\s+$/.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join("");
}

/** Mantém em CAIXA ALTA mas normaliza espaços. Para descrições de produtos. */
export function toUpperClean(input?: string | null): string {
  if (!input) return "";
  return String(input).trim().replace(/\s+/g, " ").toUpperCase();
}

/** Normaliza e-mail: minúsculo + trim. */
export function normalizeEmail(input?: string | null): string {
  if (!input) return "";
  return String(input).trim().toLowerCase();
}

/** Formata telefone BR removendo espaços extras. */
export function normalizePhone(input?: string | null): string {
  if (!input) return "";
  const digits = String(input).replace(/\D/g, "");
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return String(input).trim();
}

/** Formata CNPJ. */
export function normalizeCnpj(input?: string | null): string {
  if (!input) return "";
  const d = String(input).replace(/\D/g, "");
  if (d.length !== 14) return String(input).trim();
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/** Garante "X dias" se vier só número. */
export function normalizePrazo(input?: string | null): string {
  if (!input) return "";
  const s = String(input).trim();
  if (!s) return "";
  if (/^\d+$/.test(s)) return `${s} dias`;
  return toSentenceCase(s);
}
