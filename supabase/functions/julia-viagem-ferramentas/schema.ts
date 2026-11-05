import { z } from 'npm:zod@3';
import { CAMPOS_TEXTO_RELATO } from '../_shared/relatoVisita.ts';
const relatoCampos = Object.fromEntries(CAMPOS_TEXTO_RELATO.map(c => [c, z.string().trim().min(1).max(500).optional()]));
const comum = { ligacao_id: z.string().uuid(), rota_id: z.string().uuid() };
export const Schema = z.discriminatedUnion('acao', [
 z.object({ ...comum, acao: z.literal('listar_pendentes') }).strip(),
 z.object({ ...comum, ...relatoCampos, sacos_safra: z.number().finite().nonnegative().optional(), interesse: z.enum(['alto','medio','baixo']).optional(), objecoes: z.array(z.string().trim().min(1).max(500)).max(20).optional(), proximo_passo_data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), acao: z.literal('registrar_visita'), parada_id: z.string().uuid(), visitada: z.boolean(), resultado: z.string().trim().min(1).max(4500).optional(), motivo: z.string().trim().min(1).max(4500).optional() }).strip(),
 z.object({ ...comum, acao: z.literal('registrar_pernoite'), tipo: z.enum(['hotel','sem_custo','voltou_base']), cidade: z.string().trim().min(1).max(200).optional(), uf: z.string().regex(/^[A-Z]{2}$/).optional(), hotel_nome: z.string().trim().min(1).max(200).optional(), valor: z.number().positive().lt(100000).optional(), observacao: z.string().trim().min(1).max(2000).optional() }).strip(),
 z.object({ ...comum, acao: z.literal('agendar_retorno'), horario: z.string().regex(/^\d{2}:\d{2}$/) }).strip(),
]);