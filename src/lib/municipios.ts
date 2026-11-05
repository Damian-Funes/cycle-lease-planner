// Busca local de municípios (lista oficial IBGE em src/data/municipios.json). Funções puras.

export type Municipio = { n: string; uf: string };

/** Minúsculas, sem acento; hífen/pontuação viram espaço. */
export function normalizarBusca(s: string): string {
  return (s ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export type MunicipioIndexado = Municipio & { k: string };

export function indexarMunicipios(lista: Municipio[]): MunicipioIndexado[] {
  return lista.map((m) => ({ ...m, k: normalizarBusca(m.n) }));
}

/**
 * Prioridade: nome começa com o texto > alguma palavra começa > contém.
 * Empate: UF preferida (última parada do dia), depois ordem alfabética.
 */
export function buscarMunicipios(indice: MunicipioIndexado[], texto: string, ufPreferida?: string | null, limite = 8): Municipio[] {
  const q = normalizarBusca(texto);
  if (q.length < 2) return [];
  const uf = (ufPreferida ?? "").toUpperCase();
  const achados: { m: MunicipioIndexado; p: number }[] = [];
  for (const m of indice) {
    let p: number;
    if (m.k.startsWith(q)) p = 0;
    else if (m.k.includes(" " + q)) p = 1;
    else if (m.k.includes(q)) p = 2;
    else continue;
    achados.push({ m, p });
  }
  achados.sort((a, b) =>
    a.p - b.p
    || (a.m.uf === uf ? 0 : 1) - (b.m.uf === uf ? 0 : 1)
    || a.m.k.localeCompare(b.m.k)
    || a.m.uf.localeCompare(b.m.uf));
  return achados.slice(0, limite).map(({ m }) => ({ n: m.n, uf: m.uf }));
}
