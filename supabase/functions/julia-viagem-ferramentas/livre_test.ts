import { assertEquals } from "jsr:@std/assert@1";
import { ACOES_LIVRES, faltaResolver, mensagemAtividades } from "./livre.ts";
import { prepararEntrada } from "./schema.ts";

const L = "11111111-1111-4111-8111-111111111111";
const O = "22222222-2222-4222-8222-222222222222";

Deno.test("sem viagem bloqueia ações de viagem", () => {
  for (const a of ["registrar_visita", "registrar_pernoite", "vincular_organizacao", "agendar_retorno", "listar_pendentes"]) assertEquals(ACOES_LIVRES.includes(a), false);
  for (const a of ["registrar_contato_cliente", "resolver_atividade", "criar_compromisso", "listar_atividades_vencidas", "completar_organizacao"]) assertEquals(ACOES_LIVRES.includes(a), true);
});
Deno.test("rota_id vazio é aceito no modo livre", () => {
  const { body } = prepararEntrada({ acao: "listar_atividades_vencidas", ligacao_id: L, rota_id: "" }, "2026-11-06");
  assertEquals(body.acao, "listar_atividades_vencidas");
});
Deno.test("contato: canal falado e concorrente 'Nenhum' vira vazio", () => {
  const { body } = prepararEntrada({ acao: "registrar_contato_cliente", ligacao_id: L, organizacao_id: O, canal: "WhatsApp", resultado: "Conversou sobre a safra e o layout", concorrente: "Nenhum", proximo_passo: "Enviar proposta", proximo_passo_data: "10/12" }, "2026-11-06");
  assertEquals((body as Record<string, unknown>).canal, "whatsapp");
  assertEquals("concorrente" in body, false);
  assertEquals((body as Record<string, unknown>).proximo_passo_data, "2026-12-10");
});
Deno.test("resolver: reagendar exige data e motivo", () => {
  assertEquals(faltaResolver({ resolucao: "reagendar", motivo: "cliente viajou" }), "Informe o campo nova data (hoje ou futura).");
  assertEquals(faltaResolver({ resolucao: "feito", resultado: "Ligou e confirmou" }), null);
  const { body } = prepararEntrada({ acao: "resolver_atividade", ligacao_id: L, atividade_id: O, resolucao: "remarcar", nova_data: "20/11", motivo: "cliente viajou" }, "2026-11-06");
  assertEquals((body as Record<string, unknown>).resolucao, "reagendar");
});
Deno.test("compromisso: tipo falado normalizado", () => {
  const { body } = prepararEntrada({ acao: "criar_compromisso", ligacao_id: L, titulo: "Ligar para o Marcelo", tipo: "ligacao", data: "2026-11-10", hora: "14:00" }, "2026-11-06");
  assertEquals((body as Record<string, unknown>).tipo, "Ligação");
});
Deno.test("lista de atividades: frase", () => {
  assertEquals(mensagemAtividades([]), "Nenhuma atividade vencida ou para hoje.");
  assertEquals(mensagemAtividades([{ titulo: "Ligar", data: "2026-11-01", vencida: true }, { titulo: "X", data: "2026-11-06", vencida: false }]), "Você tem 1 vencida e 1 para hoje. A primeira: Ligar, de 01/11.");
});
