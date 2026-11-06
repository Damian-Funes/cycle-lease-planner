import { assert, assertEquals } from "jsr:@std/assert@1";
import { CHAVES_VARIAVEIS, chaveTelefone, decidirEntrada, montarVariaveis, respostaEntrada, variaveisVazias } from "../_shared/variaveisLigacao.ts";

Deno.test("telefone: com/sem 55 e com/sem 9º dígito batem", () => {
  const k = chaveTelefone("+5544999887766");
  assertEquals(chaveTelefone("44999887766"), k);
  assertEquals(chaveTelefone("+55 (44) 9988-7766"), k);
  assertEquals(chaveTelefone("5544999887766"), k);
  assertEquals(chaveTelefone("123"), null);
});
Deno.test("decisão da entrada", () => {
  assertEquals(decidirEntrada({ vendedor: false, temViagem: true, ocupado: false }), "nao");
  assertEquals(decidirEntrada({ vendedor: true, temViagem: false, ocupado: false }), "livre");
  assertEquals(decidirEntrada({ vendedor: true, temViagem: true, ocupado: true }), "ocupado");
  assertEquals(decidirEntrada({ vendedor: true, temViagem: false, ocupado: true }), "ocupado");
  assertEquals(decidirEntrada({ vendedor: true, temViagem: true, ocupado: false }), "sim");
});
Deno.test("mesmas chaves na saída, na entrada e nas vazias", () => {
  const v = montarVariaveis({ rota: { nome: "X", data_fim: "2026-11-06", paradas: [] }, perfilNome: "renan silva", vendedorId: "v", rotaId: "r", ligacaoId: "l", data: "2026-11-06", pendencias: [], teste: false, origem: "entrada" });
  assertEquals(Object.keys(v).sort(), [...CHAVES_VARIAVEIS].sort());
  assertEquals(Object.keys(variaveisVazias("nao")).sort(), [...CHAVES_VARIAVEIS].sort());
  assertEquals(v.vendedor_nome, "Renan");
  assertEquals(v.ultimo_dia, "sim");
});
Deno.test("resposta sempre tem first_message", () => {
  const r = respostaEntrada(variaveisVazias("erro"), "Tive um problema");
  assert(r.conversation_config_override.agent.first_message.length > 0);
  assertEquals(r.type, "conversation_initiation_client_data");
});

import { secretIgualAlgum as _sia } from '../_shared/juliaViagem.ts';
Deno.test('segredo: aceita JULIA_TOOL_SECRET ou JULIA_ENTRADA_SECRET, com trim', async () => {
  Deno.env.set('JULIA_TOOL_SECRET', ' ferramenta ');
  Deno.env.delete('JULIA_ENTRADA_SECRET');
  const nomes = ['JULIA_ENTRADA_SECRET', 'JULIA_TOOL_SECRET'];
  if (!await _sia('ferramenta', nomes)) throw new Error('tool sem entrada');
  if (await _sia('entrada', nomes)) throw new Error('entrada inexistente aceita');
  Deno.env.set('JULIA_ENTRADA_SECRET', 'entrada');
  if (!await _sia(' entrada ', nomes)) throw new Error('entrada');
  if (!await _sia('ferramenta', nomes)) throw new Error('tool com entrada');
  if (await _sia('errado', nomes) || await _sia(null, nomes) || await _sia('', nomes)) throw new Error('errado aceito');
});
