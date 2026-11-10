import { assertEquals } from "jsr:@std/assert";
import { comOrg, resolverOrgContato } from "./contatoOrg.ts";

const PARADA = "06c993d9-a8ba-4603-9ffe-e216340f1d8a";
const ORG = "11111111-1111-1111-1111-111111111111";
const VEND = "v1";
// deno-lint-ignore no-explicit-any
function db(orgs: string[], paradas: Record<string, { organizacao_id: string; vendedor: string }>): any {
  return { from: (t: string) => ({ select: () => ({ eq: (_c: string, id: string) => ({ maybeSingle: async () => {
    if (t === "organizacoes") return { data: orgs.includes(id) ? { id } : null };
    const p = paradas[id]; return { data: p ? { organizacao_id: p.organizacao_id, rotas: { vendedor_id: p.vendedor } } : null };
  } }) }) }) };
}

Deno.test("caso real: parada_id enviado como organizacao_id resolve a organização da parada", async () => {
  assertEquals(await resolverOrgContato(db([ORG], { [PARADA]: { organizacao_id: ORG, vendedor: VEND } }), VEND, PARADA), ORG);
});
Deno.test("parada_id explícito", async () => {
  assertEquals(await resolverOrgContato(db([ORG], { [PARADA]: { organizacao_id: ORG, vendedor: VEND } }), VEND, undefined, PARADA), ORG);
});
Deno.test("parada de outro vendedor não resolve", async () => {
  assertEquals(await resolverOrgContato(db([ORG], { [PARADA]: { organizacao_id: ORG, vendedor: "outro" } }), VEND, PARADA), null);
});
Deno.test("confirmar_contato traz organizacao_id explícito", () => {
  assertEquals<unknown>(comOrg({ nome_falado: "Felipe" }, ORG, "Agrícola", PARADA), { nome_falado: "Felipe", organizacao_id: ORG, organizacao_nome: "Agrícola", parada_id: PARADA });
  assertEquals(comOrg(null, ORG), null);
});
