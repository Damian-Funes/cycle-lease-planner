// Extração de cidade/UF de respostas do Google (Geocoder legado e Places New). Funções puras.

type Componente = {
  types?: string[];
  long_name?: string; short_name?: string; // Geocoder
  longText?: string; shortText?: string;   // Places API (New)
};

/** UF: só sigla de 2 letras maiúsculas (aceita digitação parcial). */
export function normalizarUf(v: string | null | undefined): string {
  return (v ?? "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2);
}

function longo(c?: Componente) { return (c?.long_name ?? c?.longText ?? "").trim(); }
function curto(c?: Componente) { return (c?.short_name ?? c?.shortText ?? "").trim(); }

/** Cidade = locality (fallback administrative_area_level_2); UF = short_name de administrative_area_level_1. */
export function extrairCidadeUf(componentes: Componente[] | null | undefined): { cidade: string; uf: string } | null {
  const lista = componentes ?? [];
  const achar = (t: string) => lista.find((c) => c.types?.includes(t));
  const cidade = longo(achar("locality")) || longo(achar("administrative_area_level_2"));
  const ufBruta = curto(achar("administrative_area_level_1"));
  const uf = /^[A-Za-z]{2}$/.test(ufBruta) ? ufBruta.toUpperCase() : "";
  if (!cidade) return null;
  return { cidade, uf };
}

/** Primeiro resultado do Geocoder que tenha cidade. */
export function cidadeDeResultados(resultados: { address_components?: Componente[] }[] | null | undefined) {
  for (const r of resultados ?? []) {
    const x = extrairCidadeUf(r.address_components);
    if (x) return x;
  }
  return null;
}

/** "Não-Me-Toque - RS" / "Não-Me-Toque, RS" → separa só no ÚLTIMO " - " ou ",", preservando hífens do nome. */
export function separarCidadeUfTexto(texto: string): { cidade: string; uf: string } {
  const t = texto.trim();
  const m = t.match(/^(.*\S)\s*(?:\s-\s|,|\/)\s*([A-Za-z]{2})$/);
  if (m) return { cidade: m[1].trim(), uf: m[2].toUpperCase() };
  return { cidade: t, uf: "" };
}

/** Sigla da UF no texto secundário do autocomplete ("RS, Brasil" → "RS"). */
export function siglaDoTexto(sec: string): string {
  return sec.match(/\b([A-Z]{2})\b/)?.[1] ?? "";
}
