import { z } from 'npm:zod@3';
import { CAMPOS_TEXTO_RELATO } from '../_shared/relatoVisita.ts';
import { normalizarBody } from './entrada.ts';
const relatoCampos = Object.fromEntries(CAMPOS_TEXTO_RELATO.map(c => [c, z.string().trim().min(1).max(500).optional()]));
const comum = { ligacao_id: z.string().uuid(), rota_id: z.string().uuid() };
export const Schema = z.discriminatedUnion('acao', [
 z.object({ ...comum, acao: z.literal('listar_pendentes') }).strip(),
 z.object({ ...comum, ...relatoCampos, sacos_safra: z.number().finite().nonnegative().optional(), interesse: z.enum(['alto','medio','baixo']).optional(), objecoes: z.array(z.string().trim().min(1).max(500)).max(20).optional(), proximo_passo_data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), acao: z.literal('registrar_visita'), parada_id: z.string().uuid(), visitada: z.boolean(), resultado: z.string().trim().min(1).max(4500).optional(), motivo: z.string().trim().min(1).max(4500).optional() }).strip(),
 z.object({ ...comum, acao: z.literal('registrar_pernoite'), tipo: z.enum(['hotel','sem_custo','voltou_base']), cidade: z.string().trim().min(1).max(200).optional(), uf: z.string().regex(/^[A-Z]{2}$/).optional(), hotel_nome: z.string().trim().min(1).max(200).optional(), valor: z.number().positive().lt(100000).optional(), observacao: z.string().trim().min(1).max(2000).optional() }).strip(),
 z.object({ ...comum, acao: z.literal('agendar_retorno'), horario: z.string().regex(/^\d{2}:\d{2}$/) }).strip(),
]);

/** Optional debrief failures never block a valid visit; identity stays mandatory. */
export function prepararEntrada(original: unknown, hojeBRT: string) {
 const avisos: string[] = [];
 const dados = normalizarBody(original, hojeBRT, avisos);
 if (dados && typeof dados === 'object' && !Array.isArray(dados)) {
  const registro = dados as Record<string, unknown>;
  const opcionais = [...CAMPOS_TEXTO_RELATO, 'sacos_safra', 'interesse', 'objecoes', 'proximo_passo_data'];
  if (registro.acao === 'registrar_visita') {
   if (registro.visitada === false) {
    for (const campo of opcionais) if (campo in registro) { delete registro[campo]; avisos.push(`Campo ${campo.replace(/_/g, ' ')} descartado: visita não realizada.`); }
   }
   const validacao = Schema.safeParse(registro);
   if (!validacao.success) for (const issue of validacao.error.issues) {
    const campo = String(issue.path[0]);
    if (opcionais.includes(campo) && campo in registro) { delete registro[campo]; avisos.push(`Campo ${campo.replace(/_/g, ' ')} descartado: formato ou limite inválido.`); }
   }
  }
 }
 const body = Schema.parse(dados);
 if (body.acao === 'registrar_visita' && !(body.visitada ? body.resultado : body.motivo)) {
  throw new z.ZodError([{ code: 'custom', path: [body.visitada ? 'resultado' : 'motivo'], message: 'Campo obrigatório.' }]);
 }
 return { body, avisos: [...new Set(avisos)] };
}