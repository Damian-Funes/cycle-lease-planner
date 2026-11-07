import { assertEquals } from "jsr:@std/assert@1";
import { ACOES_LIVRES, faltaCompletarContato, faltaResolver, mensagemAtividades, mensagemCompletarContato } from "./livre.ts";
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

Deno.test("completar_contato: liberado nos dois modos e exige um único caminho", () => {
  assertEquals(ACOES_LIVRES.includes("completar_contato"), true);
  assertEquals(faltaCompletarContato({ contato_existente: "Marcelo Guerra" }), null);
  assertEquals(faltaCompletarContato({ contato_novo_confirmado: true }), null);
  assertEquals(typeof faltaCompletarContato({}), "string");
  assertEquals(typeof faltaCompletarContato({ contato_novo_confirmado: false }), "string");
  assertEquals(typeof faltaCompletarContato({ contato_existente: "Marcelo", contato_novo_confirmado: true }), "string");
});
Deno.test("completar_contato: normaliza confirmação, telefone e papel", () => {
  const { body } = prepararEntrada({ acao: "completar_contato", ligacao_id: L, rota_id: "", organizacao_id: O, nome_falado: "Rafael", contato_novo_confirmado: "sim", contato_telefone: "+55 (43) 99999-0000", papel: "Decisor", extra: 1 }, "2026-11-07");
  const b = body as Record<string, unknown>;
  assertEquals([b.contato_novo_confirmado, b.contato_telefone, b.papel, "extra" in b], [true, "43999990000", "decisor", false]);
});
Deno.test("contato_novo_confirmado aceito em registrar_visita e registrar_contato_cliente", () => {
  const v = prepararEntrada({ acao: "registrar_visita", ligacao_id: L, rota_id: O, parada_id: O, visitada: true, resultado: "Visita feita", contato_nome: "Rafael", contato_novo_confirmado: "sim" }, "2026-11-07").body as Record<string, unknown>;
  assertEquals(v.contato_novo_confirmado, true);
  const c = prepararEntrada({ acao: "registrar_contato_cliente", ligacao_id: L, organizacao_id: O, canal: "telefone", resultado: "Conversou sobre a UBS nova", contato_novo_confirmado: false }, "2026-11-07").body as Record<string, unknown>;
  assertEquals(c.contato_novo_confirmado, false);
});
Deno.test("completar_contato: frases", () => {
  assertEquals(mensagemCompletarContato({ pessoa_nome: "Rafael Souza", criada: true, empresa: "Cocari", levantamentos_vinculados: 1 }), "Cadastrei Rafael Souza como contato novo da Cocari e liguei ao registro de hoje.");
  assertEquals(mensagemCompletarContato({ pessoa_nome: "Marcelo Guerra", criada: false, papel: "contato", levantamentos_vinculados: 1 }), "Pronto: usei o contato Marcelo Guerra e liguei ao registro de hoje.");
});
