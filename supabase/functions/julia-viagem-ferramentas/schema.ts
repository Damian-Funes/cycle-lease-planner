import { z } from 'npm:zod@3';
import { CAMPOS_TEXTO_RELATO } from '../_shared/relatoVisita.ts';
import { MOTIVOS_DESCARTE, normalizarBody, SEGMENTOS } from './entrada.ts';
export const PROXIMO_PASSO_SEM_DESCRICAO = '(sem descrição)';
const relatoCampos = Object.fromEntries(CAMPOS_TEXTO_RELATO.map(c => [c, z.string().trim().min(1).max(500).optional()]));
const comum = { ligacao_id: z.string().uuid(), rota_id: z.string().uuid() };
// Modo livre (ligação recebida sem viagem): rota_id vazio/ausente.
const livre = { ligacao_id: z.string().uuid(), rota_id: z.string().uuid().optional() };
const dataISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const Schema = z.discriminatedUnion('acao', [
 z.object({ ...comum, acao: z.literal('listar_pendentes') }).strip(),
 z.object({ ...comum, ...relatoCampos, sacos_safra: z.number().finite().nonnegative().optional(), interesse: z.enum(['alto','medio','baixo']).optional(), objecoes: z.array(z.string().trim().min(1).max(500)).max(20).optional(), proximo_passo_data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), acao: z.literal('registrar_visita'), parada_id: z.string().uuid(), visitada: z.boolean(), contato_novo_confirmado: z.boolean().optional(), resultado: z.string().trim().min(1).max(4500).optional(), motivo: z.string().trim().min(1).max(4500).optional() }).strip(),
 z.object({ ...comum, acao: z.literal('registrar_pernoite'), noite: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), tipo: z.enum(['hotel','sem_custo','voltou_base']), cidade: z.string().trim().min(1).max(200).optional(), uf: z.string().regex(/^[A-Z]{2}$/).optional(), hotel_nome: z.string().trim().min(1).max(200).optional(), valor: z.number().positive().lt(100000).optional(), observacao: z.string().trim().min(1).max(2000).optional() }).strip(),
 z.object({ ...comum, acao: z.literal('registrar_dia_sem_visita'), dia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), motivo: z.enum(['deslocamento','folga','outro']), observacao: z.string().trim().min(3).max(1000).optional() }).strip(),
 z.object({ ...comum, acao: z.literal('agendar_retorno'), horario: z.string().regex(/^\d{2}:\d{2}$/) }).strip(),
 z.object({ ...livre, acao: z.literal('buscar_organizacao'), texto: z.string().trim().min(3).max(200), cidade: z.string().trim().min(1).max(200).optional(), uf: z.string().regex(/^[A-Z]{2}$/).optional() }).strip(),
 z.object({ ...comum, acao: z.literal('vincular_organizacao'), parada_id: z.string().uuid(), organizacao_id: z.string().uuid().optional(),
  criar: z.object({ nome: z.string().trim().min(2).max(200), cidade: z.string().trim().min(1).max(200).optional(), uf: z.string().regex(/^[A-Z]{2}$/), matriz_id: z.string().uuid().optional(), segmento: z.enum(SEGMENTOS).optional() }).strip().optional() }).strip(),
 z.object({ ...livre, acao: z.literal('listar_organizacoes_incompletas') }).strip(),
 z.object({ ...livre, acao: z.literal('completar_organizacao'), organizacao_id: z.string().uuid(),
  pessoa_nome: z.string().trim().min(2).max(200).optional(), pessoa_cargo: z.string().trim().min(1).max(200).optional(),
  pessoa_telefone: z.string().regex(/^\d{10,11}$/).optional(),
  cidade: z.string().trim().min(1).max(200).optional(), uf: z.string().regex(/^[A-Z]{2}$/).optional(),
  descobrir_ate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sugerir_visita: z.boolean().optional(), visita_em: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  descartar_motivo: z.enum(MOTIVOS_DESCARTE).optional(), descartar_obs: z.string().trim().min(1).max(1000).optional() }).strip(),

 z.object({ ...livre, ...relatoCampos, acao: z.literal('registrar_contato_cliente'), vendedor_nome: z.string().trim().min(2).max(100).optional(), organizacao_id: z.string().uuid(), contato_novo_confirmado: z.boolean().optional(), canal: z.enum(['telefone','whatsapp','visita','email','outro']), sacos_safra: z.number().finite().nonnegative().optional(), interesse: z.enum(['alto','medio','baixo']).optional(), objecoes: z.array(z.string().trim().min(1).max(500)).max(20).optional(), proximo_passo_data: dataISO.optional(), resultado: z.string().trim().min(10).max(4500) }).strip(),
 // Depois da confirmação em voz: contato existente OU pessoa nova (nunca os dois; checado também no SQL).
 z.object({ ...livre, acao: z.literal('completar_contato'), organizacao_id: z.string().uuid().optional(), parada_id: z.string().uuid().optional(), nome_falado: z.string().trim().min(2).max(200),
  contato_existente: z.string().trim().min(2).max(200).optional(), contato_novo_confirmado: z.boolean().optional(),
  contato_nome: z.string().trim().min(3).max(200).optional(), contato_cargo: z.string().trim().min(1).max(200).optional(),
  contato_telefone: z.string().regex(/^\d{10,11}$/).optional(), papel: z.enum(['contato','decisor']).optional() }).strip(),
 z.object({ ...livre, acao: z.literal('listar_atividades_vencidas'), vendedor_nome: z.string().trim().min(2).max(100).optional() }).strip(),
 z.object({ ...livre, acao: z.literal('resolver_atividade'), atividade_id: z.string().uuid(), resolucao: z.enum(['feito','nao_fiz','reagendar','cancelar']), resultado: z.string().trim().min(10).max(4500).optional(), nova_data: dataISO.optional(), motivo: z.string().trim().min(3).max(1000).optional() }).strip(),
 z.object({ ...livre, acao: z.literal('criar_compromisso'), vendedor_nome: z.string().trim().min(2).max(100).optional(), organizacao_id: z.string().uuid().optional(), contato_nome: z.string().trim().min(2).max(200).optional(), contato_novo_confirmado: z.boolean().optional(), titulo: z.string().trim().min(3).max(200), tipo: z.enum(['Ligação','Visita','Reunião','Tarefa','WhatsApp']), data: dataISO, hora: z.string().regex(/^\d{2}:\d{2}$/).optional(), descricao: z.string().trim().min(1).max(2000).optional() }).strip(),
]);

/** Optional debrief failures never block a valid visit; identity stays mandatory. */
export function prepararEntrada(original: unknown, hojeBRT: string) {
 const avisos: string[] = [];
 const dados = normalizarBody(original, hojeBRT, avisos);
 if (dados && typeof dados === 'object' && !Array.isArray(dados)) {
  const registro = dados as Record<string, unknown>;
  const opcionais = [...CAMPOS_TEXTO_RELATO, 'sacos_safra', 'interesse', 'objecoes', 'proximo_passo_data'];
  if (registro.acao === 'registrar_contato_cliente') {
   const validacao = Schema.safeParse(registro);
   if (!validacao.success) for (const issue of validacao.error.issues) {
    const campo = String(issue.path[0]);
    if (opcionais.includes(campo) && campo !== 'resultado' && campo in registro) { delete registro[campo]; avisos.push(`Campo ${campo.replace(/_/g, ' ')} descartado: formato ou limite inválido.`); }
   }
  }
  if (registro.acao === 'registrar_visita') {
   if (registro.visitada === false) {
    for (const campo of opcionais) if (campo in registro) { delete registro[campo]; avisos.push(`Campo ${campo.replace(/_/g, ' ')} descartado: visita não realizada.`); }
   }
   // Data sem texto: cria a atividade mesmo assim, com título genérico e aviso.
   if (registro.visitada === true && registro.proximo_passo_data && !registro.proximo_passo) {
    registro.proximo_passo = PROXIMO_PASSO_SEM_DESCRICAO;
    avisos.push('Próximo passo veio só com a data: atividade criada como "Próximo passo (sem descrição)"; confirme o que foi combinado.');
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