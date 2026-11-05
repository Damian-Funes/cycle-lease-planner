import { z } from 'npm:zod@3';
import { check, contexto, corsHeaders, dbAdmin, erro, horarioBRT, json, secretIgual } from '../_shared/juliaViagem.ts';
import { horarioRetorno } from '../_shared/juliaViagemRegras.ts';
import { extrairRelato } from '../_shared/relatoVisita.ts';
import { prepararEntrada } from './schema.ts';
import { mensagensValidacao, fraseValidacao } from './entrada.ts';
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
 let chaves: string[] = []; let acao = 'desconhecida';
 const avisar400 = (issues: { path: (string | number)[]; code: string }[] = []) => console.warn('julia-viagem-ferramentas 400', JSON.stringify({ acao, chaves, mensagens_zod: mensagensValidacao(issues) }));
 const recusar = (error: string) => { avisar400(); return json({ error },400); };
 try {
  const original = await req.json();
  if (original && typeof original === 'object' && !Array.isArray(original)) chaves = Object.keys(original);
  if (original && typeof original === 'object' && 'acao' in original && ['listar_pendentes','registrar_visita','registrar_pernoite','agendar_retorno'].includes(String(original.acao))) acao = String(original.acao);
  const { data } = horarioBRT();
  const { body, avisos } = prepararEntrada(original,data); const db = dbAdmin();
  const l = check(await db.from('ligacoes_viagem').select('*').eq('id',body.ligacao_id).eq('rota_id',body.rota_id).maybeSingle());
  if (!l || !['discando','em_andamento'].includes(l.status) || l.data_ref !== data) return json({ error: 'Ligação não está ativa nesta viagem.' },403);
  const c = await contexto(db,body.rota_id,data);
  if (c.rota.vendedor_id !== l.vendedor_id || c.rota.status !== 'aprovada') return json({ error: 'Viagem indisponível.' },403);
  if (body.acao === 'listar_pendentes') return json({ ok: true, avisos, pendencias: c.pendencias });
  if (body.acao === 'agendar_retorno') {
   const quando = horarioRetorno(data,body.horario,new Date()); if (!quando) return recusar('Confira o campo horário: escolha um horário futuro de hoje até 22h.');
   if (l.teste) return recusar('Teste manual não agenda retorno automático.');
   const next = check(await db.rpc('julia_reservar_ligacao',{ p_rota: l.rota_id, p_origem: 'retorno', p_quando: quando }));
   return json({ ok: true, avisos, agendada_para: next.agendada_para });
  }
  if(body.acao==='registrar_visita' && !(body.visitada?body.resultado:body.motivo)) return recusar(body.visitada ? 'Informe o campo resultado da visita.' : 'Informe o campo motivo da não visita.');
  if(body.acao==='registrar_visita') {
   const relato = extrairRelato(body,data);
   if(!body.visitada && Object.keys(relato).length) return recusar('Confira o relato: permitido somente para visita realizada.');
  }
  if(body.acao==='registrar_pernoite') {
   if(body.tipo!=='voltou_base' && (!body.cidade || !body.uf)) return recusar('Informe os campos cidade e UF.');
   if(body.tipo==='hotel' && (!body.hotel_nome || !body.valor)) return recusar('Informe os campos hotel e valor real.');
   if(body.tipo!=='hotel' && !body.observacao) return recusar('Informe o campo observação com a justificativa.');
  }
  const result = check(await db.rpc('julia_registrar_voz',{ p_ligacao: l.id, p_rota: l.rota_id, p_acao: body.acao, p_dados: body }));
  return json({ ...result, avisos, pendencias: (await contexto(db,l.rota_id,data)).pendencias });
 } catch(e) {
  if (e instanceof z.ZodError) { avisar400(e.issues); return json({ error: fraseValidacao(e.issues) },400); }
  if (e instanceof SyntaxError) return recusar('Confira os dados enviados: formato inválido.');
  const response = erro(e); if (response.status === 400) avisar400(); return response;
 }
});