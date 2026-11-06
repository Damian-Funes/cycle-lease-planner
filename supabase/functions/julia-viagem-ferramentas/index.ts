import { z } from 'npm:zod@3';
import { carregarRota, check, corsHeaders, dbAdmin, horarioBRT, json, secretIgual } from '../_shared/juliaViagem.ts';
import { permitidoLigar } from '../_shared/juliaViagemRegras.ts';
import { Cronometro } from './tempo.ts';
import { ACOES_LIVRES, ACOES_SO_LIVRES, faltaResolver, mensagemAtividades, mensagemCompromisso, mensagemContato, mensagemResolver } from './livre.ts';
import { horarioRetorno } from '../_shared/juliaViagemRegras.ts';
import { extrairRelato } from '../_shared/relatoVisita.ts';
import { prepararEntrada } from './schema.ts';
import { mensagensValidacao, fraseValidacao, pareceCompletar } from './entrada.ts';
import { mensagemBusca, mensagemCompletar, mensagemIncompleta, mensagemVinculo, type OrgIncompleta } from './organizacao.ts';
import { avisosContatos, contatosParadas } from '../_shared/contatosOrg.ts';
import { montarPendencias } from '../_shared/pendenciasDia.ts';
import { jaRegistradasHoje, fraseJaRegistradas } from './respostas.ts';
import { fraseErro, mensagemPernoite, mensagemRetorno, mensagemVisita, nomeEmpresa, visitaRepetida } from './respostas.ts';
const falha = (error: unknown, status = 400) => json({ salvo: false, error: fraseErro(error) }, status);
Deno.serve(async req => {
 const t = new Cronometro();
 const resp = await atender(req, t);
 t.registrar(resp.status);
 return resp;
});
async function atender(req: Request, t: Cronometro): Promise<Response> {
 if (req.method === 'OPTIONS') return new Response('ok',{ headers: corsHeaders });
 if (req.method !== 'POST') return falha('Use POST.',405);
 const recebido = req.headers.get('x-julia-secret') ?? req.headers.get('x-julia-token');
 if (!await secretIgual(recebido,'JULIA_TOOL_SECRET')) {
  // Diagnóstico sem expor valores: só nomes de headers e tamanhos.
  const presentes = ['x-julia-secret','x-julia-token','authorization'].filter(h => req.headers.has(h));
  console.warn('julia-viagem-ferramentas 401', JSON.stringify({ headers: presentes, recebido_len: recebido?.trim().length ?? 0, esperado_len: Deno.env.get('JULIA_TOOL_SECRET')?.trim().length ?? 0 }));
  return falha('Acesso não autorizado.',401);
 }
 t.marcar('auth');
 let chaves: string[] = []; let acao = 'desconhecida';
 const avisar400 = (issues: { path: (string | number)[]; code: string }[] = []) => console.warn('julia-viagem-ferramentas 400', JSON.stringify({ acao, chaves, mensagens_zod: mensagensValidacao(issues) }));
 const recusar = (error: string) => { avisar400(); return falha(error); };
 try {
  const original = await req.json(); t.marcar('json');
  if (original && typeof original === 'object' && !Array.isArray(original)) chaves = Object.keys(original);
  if (original && typeof original === 'object' && 'acao' in original && ['listar_pendentes','registrar_visita','registrar_pernoite','agendar_retorno','buscar_organizacao','vincular_organizacao','listar_organizacoes_incompletas','completar_organizacao',...ACOES_SO_LIVRES].includes(String(original.acao))) acao = String(original.acao);
  const { data } = horarioBRT();
  // ElevenLabs mal configurado (constante acao errada): corpo com dados de completar vira completar_organizacao.
  if (pareceCompletar(original)) {
   console.warn('julia-viagem-ferramentas acao_corrigida', JSON.stringify({ recebida: 'listar_organizacoes_incompletas', tratada: 'completar_organizacao', chaves }));
   (original as Record<string, unknown>).acao = 'completar_organizacao'; acao = 'completar_organizacao';
  }
  const { body, avisos } = prepararEntrada(original,data); const db = dbAdmin(); t.acao = body.acao; t.marcar('validacao');
  // Ligação e viagem em paralelo (antes: em sequência, mais perfil e papéis).
  const [lr, rotaCarregada] = await Promise.all([
   db.from('ligacoes_viagem').select('*').eq('id',body.ligacao_id).maybeSingle(),
   body.rota_id ? carregarRota(db, body.rota_id).catch(() => null) : Promise.resolve(null),
  ]);
  const l = check(lr); t.marcar('ligacao+rota');
  if (!l || !['discando','em_andamento'].includes(l.status) || l.data_ref !== data) return falha('Ligação não está ativa.',403);
  const modoLivre = !l.rota_id;
  // Modo livre: só ações sem viagem; com viagem, rota_id tem de bater com a ligação.
  if (modoLivre && !ACOES_LIVRES.includes(body.acao)) return falha('Sem viagem hoje: essa ação é só para viagem.',403);
  if (!modoLivre && body.rota_id !== l.rota_id) return falha('Ligação não está ativa nesta viagem.',403);
  const rota = rotaCarregada;
  if (!modoLivre && !rota) return falha('Viagem indisponível.',403);
  // deno-lint-ignore no-explicit-any
  const c = { rota: rota as any };
  if (!modoLivre && (c.rota.vendedor_id !== l.vendedor_id || c.rota.status !== 'aprovada')) return falha('Viagem indisponível.',403);
  const precisaOrg = body.acao === 'listar_pendentes' || body.acao === 'listar_organizacoes_incompletas';
  // Papéis (whitelist) e organização incompleta em paralelo; nunca a organização derruba a ligação.
  const [roles, orgPri] = await Promise.all([
   db.from('user_roles').select('role').eq('user_id', l.vendedor_id),
   precisaOrg ? db.rpc('fn_organizacoes_incompletas_priorizadas', { p_vendedor: l.vendedor_id, p_rota: l.rota_id, p_limite: 1 }) : Promise.resolve(null),
  ]);
  const papeis = (check(roles) ?? []).map((x: { role: string }) => x.role);
  if (!permitidoLigar(l.vendedor_id, papeis) && !papeis.includes('gerente_comercial')) return falha('Acesso não autorizado.',403);
  t.marcar('papeis+org');
  if (body.acao === 'registrar_contato_cliente') {
   const { acao: _a, ligacao_id: _l, rota_id: _r, organizacao_id, ...dados } = body;
   const r = check(await db.rpc('julia_registrar_contato', { p_ligacao: l.id, p_org: organizacao_id, p_dados: dados })); t.marcar('rpc_contato');
   if (r?.contato_ambiguo) avisos.push('Há mais de uma pessoa com esse nome na empresa: contato não vinculado; diga o nome completo.');
   return json({ ok: true, salvo: true, ...r, mensagem: mensagemContato(r?.empresa, body.canal, r?.proximo_passo_atividade_id ? body.proximo_passo_data : null), avisos });
  }
  if (body.acao === 'listar_atividades_vencidas') {
   const lista = check(await db.rpc('julia_listar_atividades', { p_ligacao: l.id, p_limite: 10 })) ?? []; t.marcar('rpc_atividades');
   return json({ ok: true, salvo: true, mensagem: mensagemAtividades(lista), avisos, atividades: lista });
  }
  if (body.acao === 'resolver_atividade') {
   const falta = faltaResolver(body);
   if (falta) return recusar(falta);
   const r = check(await db.rpc('julia_resolver_atividade', { p_ligacao: l.id, p_atividade: body.atividade_id, p_acao: body.resolucao, p_resultado: body.resultado ?? null, p_nova_data: body.nova_data ?? null, p_motivo: body.motivo ?? null })); t.marcar('rpc_resolver');
   return json({ ok: true, salvo: true, mensagem: mensagemResolver(r?.titulo, body.resolucao, body.nova_data), avisos, atividade_id: body.atividade_id });
  }
  if (body.acao === 'criar_compromisso') {
   const { acao: _a, ligacao_id: _l, rota_id: _r, ...dados } = body;
   const r = check(await db.rpc('julia_criar_compromisso', { p_ligacao: l.id, p_dados: dados })); t.marcar('rpc_compromisso');
   return json({ ok: true, salvo: true, ...r, mensagem: mensagemCompromisso(body.tipo, body.data, body.hora, r?.empresa), avisos });
  }
 const recarregar = async () => { const r = await carregarRota(db, l.rota_id); t.marcar('recarregar_rota'); return r; };
  // Fonte única: a Júlia cobra o mesmo que vira notificação depois.
  const pendencias = (rota: typeof c.rota) => { const p = montarPendencias(rota, data, { completo: true }); t.marcar('montarPendencias'); return p; };
  // Uma organização incompleta por ligação, priorizada pela proximidade da viagem (falha aqui nunca derruba a ligação).
  const orgIncompleta = async (): Promise<OrgIncompleta | null> => (!orgPri || orgPri.error) ? null : ((orgPri.data ?? [])[0] as OrgIncompleta | undefined) ?? null;
  if (body.acao === 'listar_pendentes') {
   const oi = await orgIncompleta();
   const ja = jaRegistradasHoje(c.rota.paradas, data);
   const frase = fraseJaRegistradas(ja);
   return json({ ok: true, salvo: true, mensagem: frase ? `Pendências atualizadas. ${frase}` : 'Pendências atualizadas.', avisos, pendencias: montarPendencias(c.rota, data, { completo: true, organizacaoIncompleta: oi }), ja_registradas_hoje: ja, contatos_paradas: contatosParadas(c.rota.paradas) });
  }
  if (body.acao === 'listar_organizacoes_incompletas') {
   const oi = await orgIncompleta();
   return json({ ok: true, salvo: true, mensagem: mensagemIncompleta(oi), avisos, organizacoes: oi ? [oi] : [] });
  }
  if (body.acao === 'completar_organizacao') {
   const { acao: _a, ligacao_id: _l, rota_id: _r, organizacao_id, ...dados } = body;
   if (!Object.keys(dados).length) return recusar('Informe o contato, a cidade/UF, a data para descobrir, a sugestão de visita ou o motivo do descarte.');
   const [rr, or] = await Promise.all([
    db.rpc('julia_completar_organizacao', { p_ligacao: l.id, p_org: organizacao_id, p_dados: dados }),
    db.from('organizacoes').select('nome,nome_fantasia').eq('id', organizacao_id).maybeSingle(),
   ]);
   const r = check(rr); const o = check(or); t.marcar('rpc_completar');
   const nome = o?.nome_fantasia || o?.nome || 'A organização';
   const gravou = (r?.acoes ?? []).some((x: string) => x !== 'telefone_ja_existia' && x !== 'ja_descartada');
   return json({ ok: true, salvo: gravou, empresa: nome, mensagem: mensagemCompletar(r, nome), avisos: [...avisos, ...(r?.avisos ?? [])], faltas: r?.faltas ?? [] });
  }
  if (body.acao === 'buscar_organizacao') {
   const opcoes = check(await db.rpc('julia_buscar_organizacao',{ p_ligacao: l.id, p_texto: body.texto, p_cidade: body.cidade ?? null, p_uf: body.uf ?? null })) ?? []; t.marcar('rpc_buscar');
   const lista = (opcoes as { id: string; nome: string; cidade: string | null; uf: string | null; matriz_id: string | null; matriz_nome: string | null }[]).map(o => ({ id: o.id, nome: o.nome, cidade: o.cidade, uf: o.uf, matriz: o.matriz_nome, matriz_id: o.matriz_id }));
   return json({ ok: true, salvo: true, mensagem: mensagemBusca(lista), avisos, organizacoes: lista });
  }
  if (body.acao === 'vincular_organizacao') {
   if (!!body.organizacao_id === !!body.criar) return recusar('Informe a empresa encontrada ou os dados para criar uma nova, não os dois.');
   const p = (c.rota.paradas ?? []).find((x: { id: string }) => x.id === body.parada_id);
   if (!p) return recusar('Essa parada não pertence à viagem.');
   t.marcar('pre_vincular'); const r = check(await db.rpc('julia_vincular_organizacao',{ p_ligacao: l.id, p_parada: body.parada_id, p_organizacao: body.organizacao_id ?? null, p_criar: body.criar ?? null }));
   return json({ ok: true, salvo: true, empresa: r?.nome, mensagem: mensagemVinculo(r, !!body.criar?.matriz_id), avisos, organizacao_id: r?.organizacao_id, pendencias: pendencias(await recarregar()) });
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
   if (body.visitada) avisos.push(...avisosContatos(body as Record<string, unknown>, p.organizacao?.pessoas ?? []));
   const result = check(await db.rpc('julia_registrar_voz',{ p_ligacao: l.id, p_rota: l.rota_id, p_acao: body.acao, p_dados: body })); t.marcar('rpc_registrar');
   if (body.visitada && (body as Record<string, unknown>).proximo_passo && body.proximo_passo_data && !result?.atividade_id) avisos.push(p.organizacao_id ? 'Próximo passo salvo, mas a atividade não foi criada; confira no CRM.' : 'Próximo passo salvo sem atividade: a parada não tem empresa vinculada.');
   return json({ ...result, salvo: true, empresa, mensagem: mensagemVisita(empresa,body.visitada,result?.atividade_id,relato.proximo_passo_data as string), avisos, pendencias: pendencias(await recarregar()) });
  }
  if(body.acao==='registrar_pernoite') {
   if(body.tipo!=='voltou_base' && (!body.cidade || !body.uf)) return recusar('Informe os campos cidade e UF.');
   if(body.tipo==='hotel' && (!body.hotel_nome || !body.valor)) return recusar('Informe os campos hotel e valor real.');
   if(body.tipo!=='hotel' && !body.observacao) return recusar('Informe o campo observação com a justificativa.');
   if ((c.rota.pernoites ?? []).some((x: { noite: string }) => x.noite === data)) return json({ ok: true, salvo: true, mensagem: 'Pernoite dessa noite já estava salvo.', avisos, pendencias: pendencias(c.rota) });
  }
  const result = check(await db.rpc('julia_registrar_voz',{ p_ligacao: l.id, p_rota: l.rota_id, p_acao: body.acao, p_dados: body })); t.marcar('rpc_registrar');
  return json({ ...result, salvo: true, mensagem: body.acao==='registrar_pernoite' ? mensagemPernoite(body) : 'Salvo.', avisos, pendencias: pendencias(await recarregar()) });
 } catch(e) {
  if (e instanceof z.ZodError) { avisar400(e.issues); return falha(fraseValidacao(e.issues)); }
  if (e instanceof SyntaxError) return recusar('Confira os dados enviados: formato inválido.');
  const msg = e instanceof Error ? e.message : ''; const status = msg.startsWith('401:') ? 401 : msg.startsWith('403:') ? 403 : 400; if (status === 400) avisar400(); return falha(msg,status);
 }
}
