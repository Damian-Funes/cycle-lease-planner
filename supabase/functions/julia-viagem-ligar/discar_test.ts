import { assertEquals } from "jsr:@std/assert@1";
import { MOTIVO_NADA_PENDENTE, motivoNaoDiscar } from "../_shared/juliaViagemRegras.ts";
const org = { tipo: "organizacao_incompleta" };
Deno.test("manual do admin disca só com organização incompleta", () => assertEquals(motivoNaoDiscar([org], true), null));
Deno.test("cron não disca só com organização incompleta", () => assertEquals(motivoNaoDiscar([org], false), MOTIVO_NADA_PENDENTE));
Deno.test("cron não disca só com nota do hotel", () => assertEquals(motivoNaoDiscar([{ tipo: "nota_hotel" }], false), MOTIVO_NADA_PENDENTE));
Deno.test("cron disca com parada pendente", () => assertEquals(motivoNaoDiscar([{ tipo: "parada_pendente" }, org], false), null));
Deno.test("manual sem nada cancela", () => assertEquals(motivoNaoDiscar([], true), MOTIVO_NADA_PENDENTE));
