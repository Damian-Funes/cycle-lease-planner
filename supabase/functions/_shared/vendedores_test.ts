import { assertEquals } from "jsr:@std/assert@1";
import { casarVendedor, listaVendedores, resolverAtribuicao } from "./vendedores.ts";
import { custoEstimado, excedeLimite, extrairCusto, hashTelefone, mascararTelefone } from "./gastoJulia.ts";

const equipe = [
  { id: "f", nome: "Flávio Souza" }, { id: "r", nome: "Renan Silva" },
  { id: "m1", nome: "Marcos Lima" }, { id: "m2", nome: "Marcos Prado" },
];

Deno.test("vendedor: Flavio sem acento casa com Flávio Souza", () => {
  const c = casarVendedor("Flavio", equipe);
  assertEquals(c.tipo === "primeiro_nome" && c.vendedor.id, "f");
});
Deno.test("vendedor: aproximado (Flavyo) e nome curto não aproxima", () => {
  const c = casarVendedor("Flavyo", equipe);
  assertEquals(c.tipo === "aproximado" && c.vendedor.id, "f");
  assertEquals(casarVendedor("Rena", equipe).tipo, "nenhum");
});
Deno.test("vendedor: dois Marcos = ambíguo, não grava", () => {
  const r = resolverAtribuicao({ ehAdmin: true, vendedorNome: "Marcos", equipe });
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.confirmar_vendedor.opcoes, ["Marcos Lima", "Marcos Prado"]);
  const ok = resolverAtribuicao({ ehAdmin: true, vendedorNome: "Marcos Prado", equipe });
  assertEquals(ok.ok && ok.responsavel_id, "m2");
});
Deno.test("trava: vendedor pedindo para outro fica com ele mesmo", () => {
  const r = resolverAtribuicao({ ehAdmin: false, vendedorNome: "Renan", equipe });
  assertEquals(r.ok && r.responsavel_id, null);
  assertEquals(r.ok && r.avisos.length, 1);
});
Deno.test("sem vendedor_nome: sem atribuição", () => {
  const r = resolverAtribuicao({ ehAdmin: true, vendedorNome: "", equipe });
  assertEquals(r.ok && r.responsavel_id, null);
});
Deno.test("lista de vendedores por primeiro nome sem repetir", () => {
  assertEquals(listaVendedores(equipe), "Flávio, Marcos, Renan");
});
Deno.test("gasto: máscara, hash com sal, custo e limite", async () => {
  assertEquals(mascararTelefone("+5544999887766"), "***7766");
  assertEquals(mascararTelefone(""), "?");
  const a = await hashTelefone("+5544999887766", "sal"); const b = await hashTelefone("44999887766", "sal");
  assertEquals(a, b);
  assertEquals(await hashTelefone("44999887766", undefined), null);
  assertEquals(extrairCusto({ call_duration_secs: 42.4, cost: 120 }), { duracao_s: 42, creditos: 120 });
  assertEquals(extrairCusto(undefined), { duracao_s: 0, creditos: null });
  assertEquals(custoEstimado({ segundos: 120, creditos: null }, { reais_por_credito: null, reais_por_minuto: 0.5 }).reais, 1);
  assertEquals(custoEstimado({ segundos: 120, creditos: 100 }, { reais_por_credito: 0.01, reais_por_minuto: 0.5 }).base, "creditos");
  assertEquals(custoEstimado({ segundos: 120, creditos: null }, { reais_por_credito: null, reais_por_minuto: null }).reais, null);
  const c = { max_recusadas_dia: 5, max_minutos_recusadas_dia: 10 };
  assertEquals(excedeLimite({ qtd: 5, segundos: 600 }, c), false);
  assertEquals(excedeLimite({ qtd: 6, segundos: 0 }, c), true);
  assertEquals(excedeLimite({ qtd: 1, segundos: 601 }, c), true);
});
