import { z } from 'npm:zod@3';
import { check, contexto, corsHeaders, dbAdmin, erro, horarioBRT, json, secretIgual } from '../_shared/juliaViagem.ts';
import { horarioRetorno } from '../_shared/juliaViagemRegras.ts';
import { CAMPOS_TEXTO_RELATO, extrairRelato } from '../_shared/relatoVisita.ts';
const relatoCampos = Object.fromEntries(CAMPOS_TEXTO_RELATO.map(c => [c, z.string().trim().min(1).max(500).optional()]));
const comum = { ligacao_id: z.string().uuid(), rota_id: z.string().uuid() };
const Schema = z.discriminatedUnion('acao', [
 z.object({ ...comum, acao: z.literal('listar_pendentes') }).strict(),
 z.object({ ...comum, ...relatoCampos, sacos_safra: z.number().finite().nonnegative().optional(), interesse: z.enum(['alto','medio','baixo']).optional(), objecoes: z.array(z.string().trim().min(1).max(500)).max(20).optional(), proximo_passo_data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), acao: z.literal('registrar_visita'), parada_id: z.string().uuid(), visitada: z.boolean(), resultado: z.string().trim().min(1).max(4500).optional(), motivo: z.string().trim().min(1).max(4500).optional() }).strict(),
 z.object({ ...comum, acao: z.literal('registrar_pernoite'), tipo: z.enum(['hotel','sem_custo','voltou_base']), cidade: z.string().trim().min(1).max(200).optional(), uf: z.string().regex(/^[A-Z]{2}$/).optional(), hotel_nome: z.string().trim().min(1).max(200).optional(), valor: z.number().positive().lt(100000).optional(), observacao: z.string().trim().min(1).max(2000).optional() }).strict(),
 z.object({ ...comum, acao: z.literal('agendar_retorno'), horario: z.string().regex(/^\d{2}:\d{2}$/) }).strict(),
]);
Deno.serve(async req => {
 if (req.method === 'OPTIONS') return new Response('ok',{ headers: corsHeaders });
 if (req.method !== 'POST') return json({ error: 'Use POST.' },405);
 const recebido = req.headers.get('x-julia-secret') ?? req.headers.get('x-julia-token');
 if (!await secretIgual(recebido,'JULIA_TOOL_SECRET')) {
  // Diagnóstico sem expor valores: só nomes de headers e tamanhos.
  const presentes = ['x-julia-secret','x-julia-token','authorization'].filter(h => req.headers.has(h));
  console.warn('julia-viagem-ferramentas 401', JSON.stringify({ headers: presentes, recebido_len: recebido?.trim().length ?? 0, esperado_len: Deno.env.get('JULIA_TOOL_SECRET')?.trim().length ?? 0 }));
  return json({ error: 'Unauthorized' },401);
 }
 try {
  const body = Schema.parse(await req.json()); const db = dbAdmin(); const { data } = horarioBRT();
  const l = check(await db.from('ligacoes_viagem').select('*').eq('id',body.ligacao_id).eq('rota_id',body.rota_id).maybeSingle());
  if (!l || !['discando','em_andamento'].includes(l.status) || l.data_ref !== data) return json({ error: 'Ligação não está ativa nesta viagem.' },403);
  const c = await contexto(db,body.rota_id,data);
  if (c.rota.vendedor_id !== l.vendedor_id || c.rota.status !== 'aprovada') return json({ error: 'Viagem indisponível.' },403);
  if (body.acao === 'listar_pendentes') return json({ ok: true, pendencias: c.pendencias });
  if (body.acao === 'agendar_retorno') {
   const quando = horarioRetorno(data,body.horario,new Date()); if (!quando) return json({ error: 'Escolha um horário futuro de hoje até 22h.' },400);
   if (l.teste) return json({ error: 'Teste manual não agenda retorno automático.' },400);
   const next = check(await db.rpc('julia_reservar_ligacao',{ p_rota: l.rota_id, p_origem: 'retorno', p_quando: quando }));
   return json({ ok: true, agendada_para: next.agendada_para });
  }
  if(body.acao==='registrar_visita' && !(body.visitada?body.resultado:body.motivo)) return json({error:'Informe resultado da visita ou motivo da não visita.'},400);
  if(body.acao==='registrar_visita') {
   const relato = extrairRelato(body,data);
   if(!body.visitada && Object.keys(relato).length) return json({error:'Relato detalhado somente para visita realizada.'},400);
  }
  if(body.acao==='registrar_pernoite') {
   if(body.tipo!=='voltou_base' && (!body.cidade || !body.uf)) return json({error:'Informe cidade e UF.'},400);
   if(body.tipo==='hotel' && (!body.hotel_nome || !body.valor)) return json({error:'Informe hotel e valor real.'},400);
   if(body.tipo!=='hotel' && !body.observacao) return json({error:'Informe a justificativa.'},400);
  }
  const result = check(await db.rpc('julia_registrar_voz',{ p_ligacao: l.id, p_rota: l.rota_id, p_acao: body.acao, p_dados: body }));
  return json({ ...result, pendencias: (await contexto(db,l.rota_id,data)).pendencias });
 } catch(e) { return erro(e); }
});