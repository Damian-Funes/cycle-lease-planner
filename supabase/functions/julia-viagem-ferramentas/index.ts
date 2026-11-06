import { z } from 'npm:zod@3';
import { check, contexto, corsHeaders, dbAdmin, horarioBRT, json, secretIgual } from '../_shared/juliaViagem.ts';
import { horarioRetorno } from '../_shared/juliaViagemRegras.ts';
import { extrairRelato } from '../_shared/relatoVisita.ts';
import { prepararEntrada } from './schema.ts';
import { mensagensValidacao, fraseValidacao } from './entrada.ts';
import { mensagemBusca, mensagemVinculo } from './organizacao.ts';
import { montarPendencias } from '../_shared/pendenciasDia.ts';
import { fraseErro, mensagemPernoite, mensagemRetorno, mensagemVisita, nomeEmpresa, visitaRepetida } from './respostas.ts';
const falha = (error: unknown, status = 400) => json({ salvo: false, error: fraseErro(error) }, status);
Deno.serve(async req => {
 if (req.method === 'OPTIONS') return new Response('ok',{ headers: corsHeaders });
 if (req.method !== 'POST') return falha('Use POST.',405);
 const recebido = req.headers.get('x-julia-secret') ?? req.headers.get('x-julia-token');
 if (!await secretIgual(recebido,'JULIA_TOOL_SECRET')) {
  // Diagnóstico sem expor valores: só nomes de headers e tamanhos.
  const presentes = ['x-julia-secret','x-julia-token','authorization'].filter(h => req.headers.has(h));
  console.warn('julia-viagem-ferramentas 401', JSON.stringify({ headers: presentes, recebido_len: recebido?.trim().length ?? 0, esperado_len: Deno.env.get('JULIA_TOOL_SECRET')?.trim().length ?? 0 }));
  return falha('Acesso não autorizado.',401);
 }
 let chaves: string[] = []; let acao = 'desconhecida';
 const avisar400 = (issues: { path: (string | number)[]; code: string }[] = []) => console.warn('julia-viagem-ferramentas 400', JSON.stringify({ acao, chaves, mensagens_zod: mensagensValidacao(issues) }));
 const recusar = (error: string) => { avisar400(); return falha(error); };
 try {
  const original = await req.json();
  if (original && typeof original === 'object' && !Array.isArray(original)) chaves = Object.keys(original);
  if (original && typeof original === 'object' && 'acao' in original && ['listar_pendentes','registrar_visita','registrar_pernoite','agendar_retorno','buscar_organizacao','vincular_organizacao'].includes(String(original.acao))) acao = String(original.acao);
  const { data } = horarioBRT();
  const { body, avisos } = prepararEntrada(original,data); const db = dbAdmin();
  const l = check(await db.from('ligacoes_viagem').select('*').eq('id',body.ligacao_id).eq('rota_id',body.rota_id).maybeSingle());
  if (!l || !['discando','em_andamento'].includes(l.status) || l.data_ref !== data) return falha('Ligação não está ativa nesta viagem.',403);
  const c = await contexto(db,body.rota_id,data);
  if (c.rota.vendedor_id !== l.vendedor_id || c.rota.status !== 'aprovada') return falha('Viagem indisponível.',403);
  // Fonte única: a Júlia cobra o mesmo que vira notificação depois.
  const pendencias = (rota: typeof c.rota) => montarPendencias(rota, data, { completo: true });
  if (body.acao === 'listar_pendentes') return json({ ok: true, salvo: true, mensagem: 'Pendências atualizadas.', avisos, pendencias: pendencias(c.rota) });
  if (body.acao === 'buscar_organizacao') {
   const opcoes = check(await db.rpc('julia_buscar_organizacao',{ p_ligacao: l.id, p_texto: body.texto, p_cidade: body.cidade ?? null, p_uf: body.uf ?? null })) ?? [];
   const lista = (opcoes as { id: string; nome: string; cidade: string | null; uf: string | null; matriz_id: string | null; matriz_nome: string | null }[]).map(o => ({ id: o.id, nome: o.nome, cidade: o.cidade, uf: o.uf, matriz: o.matriz_nome, matriz_id: o.matriz_id }));
   return json({ ok: true, salvo: true, mensagem: mensagemBusca(lista), avisos, organizacoes: lista });
  }
  if (body.acao === 'vincular_organizacao') {
   if (!!body.organizacao_id === !!body.criar) return recusar('Informe a empresa encontrada ou os dados para criar uma nova, não os dois.');
   const p = (c.rota.paradas ?? []).find((x: { id: string }) => x.id === body.parada_id);
   if (!p) return recusar('Essa parada não pertence à viagem.');
   const r = check(await db.rpc('julia_vincular_organizacao',{ p_ligacao: l.id, p_parada: body.parada_id, p_organizacao: body.organizacao_id ?? null, p_criar: body.criar ?? null }));
   return json({ ok: true, salvo: true, empresa: r?.nome, mensagem: mensagemVinculo(r, !!body.criar?.matriz_id), avisos, organizacao_id: r?.organizacao_id, pendencias: pendencias((await contexto(db,l.rota_id,data)).rota) });
  }
  if (body.acao === 'agendar_retorno') {
   const quando = horarioRetorno(data,body.horario,new Date()); if (!quando) return recusar('Confira o campo horário: escolha um horário futuro de hoje até 22h.');
   if (l.teste) return recusar('Teste manual não agenda retorno automático.');
   const next = check(await db.rpc('julia_reservar_ligacao',{ p_rota: l.rota_id, p_origem: 'retorno', p_quando: quando }));
   return json({ ok: true, salvo: true, mensagem: mensagemRetorno(next.agendada_para), avisos, agendada_para: next.agendada_para });
  }
  if(body.acao==='registrar_visita' && !(body.visitada?body.resultado:body.motivo)) return recusar(body.visitada ? 'Informe o campo resultado da visita.' : 'Informe o campo motivo da não visita.');
  if(body.acao==='registrar_visita') {
   const relato = extrairRelato(body,data);
   if(!body.visitada && Object.keys(relato).length) return recusar('Confira o relato: permitido somente para visita realizada.');
   const p = (c.rota.paradas ?? []).find((x: { id: string }) => x.id === body.parada_id);
   if (!p) return recusar('Essa parada não pertence à viagem.');
   const empresa = nomeEmpresa(p); const estado = visitaRepetida(p,body.visitada,data);
   if (estado === 'repetida') {
    // Mesclar relato exigiria alterar a trava do banco; só avisamos dos campos não gravados.
    const novos = Object.keys(relato).filter(k => k !== 'atividade_id' && (p.relato?.[k] === undefined || p.relato?.[k] === null || p.relato?.[k] === ''));
    return json({ ok: true, salvo: true, empresa, mensagem: 'Essa visita já estava salva — tudo certo.', avisos: novos.length ? [...avisos, `Campos novos não gravados: ${novos.join(', ')}; complete pelo CRM.`] : avisos, pendencias: pendencias(c.rota) });
   }
   if (estado === 'conflito') return recusar(p.dia === data ? `A ${empresa} já foi informada hoje de outro jeito; corrija pelo CRM.` : `A ${empresa} já foi informada em outro dia; corrija pelo CRM.`);
   const result = check(await db.rpc('julia_registrar_voz',{ p_ligacao: l.id, p_rota: l.rota_id, p_acao: body.acao, p_dados: body }));
   return json({ ...result, salvo: true, empresa, mensagem: mensagemVisita(empresa,body.visitada,result?.atividade_id,relato.proximo_passo_data as string), avisos, pendencias: pendencias((await contexto(db,l.rota_id,data)).rota) });
  }
  if(body.acao==='registrar_pernoite') {
   if(body.tipo!=='voltou_base' && (!body.cidade || !body.uf)) return recusar('Informe os campos cidade e UF.');
   if(body.tipo==='hotel' && (!body.hotel_nome || !body.valor)) return recusar('Informe os campos hotel e valor real.');
   if(body.tipo!=='hotel' && !body.observacao) return recusar('Informe o campo observação com a justificativa.');
   if ((c.rota.pernoites ?? []).some((x: { noite: string }) => x.noite === data)) return json({ ok: true, salvo: true, mensagem: 'Pernoite dessa noite já estava salvo.', avisos, pendencias: pendencias(c.rota) });
  }
  const result = check(await db.rpc('julia_registrar_voz',{ p_ligacao: l.id, p_rota: l.rota_id, p_acao: body.acao, p_dados: body }));
  return json({ ...result, salvo: true, mensagem: body.acao==='registrar_pernoite' ? mensagemPernoite(body) : 'Salvo.', avisos, pendencias: pendencias((await contexto(db,l.rota_id,data)).rota) });
 } catch(e) {
  if (e instanceof z.ZodError) { avisar400(e.issues); return falha(fraseValidacao(e.issues)); }
  if (e instanceof SyntaxError) return recusar('Confira os dados enviados: formato inválido.');
  const msg = e instanceof Error ? e.message : ''; const status = msg.startsWith('401:') ? 401 : msg.startsWith('403:') ? 403 : 400; if (status === 400) avisar400(); return falha(msg,status);
 }
});