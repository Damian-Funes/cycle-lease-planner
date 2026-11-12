// Itens de orçamento sem custo cadastrado (hoje: avulsos, cujo equipamento_id não é do cadastro).
// Só descrição/código/número: nunca custo.
export type OrcItens = { id: string; numero: string; itens: unknown };
export type ItemSemCusto = { chave: string; descricao: string; codigo: string; servico: boolean; orcamentos: { id: string; numero: string }[] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const normalizarTexto = (t: unknown) =>
  String(t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Palavras do CEO: estes viram "Serviços/frete"; o resto é "Produtos para cadastrar". */
export const PALAVRAS_SERVICO = ["frete", "mao de obra", "montagem", "desmontagem", "startup", "start up", "start-up",
  "comissionamento", "pintura", "reforma", "revisao", "munck", "locacao"];
export const ehServico = (...textos: unknown[]) => {
  const t = textos.map(normalizarTexto).join(" ");
  return PALAVRAS_SERVICO.some(p => t.includes(p));
};

/** `cadastrados` = ids que existem em equipamentos. Item sem id válido do cadastro = sem custo. */
export function itensSemCusto(orcs: OrcItens[], cadastrados: Set<string>): ItemSemCusto[] {
  const m = new Map<string, ItemSemCusto>();
  for (const o of orcs) {
    if (!Array.isArray(o.itens)) continue;
    for (const raw of o.itens) {
      const i = (raw ?? {}) as Record<string, unknown>;
      const eq = String(i.equipamento_id ?? "");
      if (UUID.test(eq) && cadastrados.has(eq.toLowerCase())) continue;
      const descricao = String(i.descricao ?? "").trim(), codigo = String(i.codigo ?? "").trim();
      const chave = `${normalizarTexto(descricao)}|${normalizarTexto(codigo)}`;
      const g = m.get(chave) ?? { chave, descricao: descricao || "(sem descrição)", codigo, servico: ehServico(descricao, codigo), orcamentos: [] };
      if (!g.orcamentos.some(x => x.id === o.id)) g.orcamentos.push({ id: o.id, numero: o.numero });
      m.set(chave, g);
    }
  }
  return [...m.values()].sort((a, b) => b.orcamentos.length - a.orcamentos.length || a.descricao.localeCompare(b.descricao, "pt-BR"));
}

/** ids de equipamento_id em formato uuid, para conferir no cadastro. */
export const idsCandidatos = (orcs: OrcItens[]) => [...new Set(orcs.flatMap(o => Array.isArray(o.itens)
  ? o.itens.map(i => String((i as Record<string, unknown>)?.equipamento_id ?? "")).filter(x => UUID.test(x)).map(x => x.toLowerCase()) : []))];
