import { z } from 'npm:zod@3';
import { carregarRota, check, corsHeaders, dbAdmin, horarioBRT, json, secretIgual } from '../_shared/juliaViagem.ts';
import { permitidoLigar } from '../_shared/juliaViagemRegras.ts';
import { Cronometro } from './tempo.ts';
import { ACOES_LIVRES, ACOES_SO_LIVRES, faltaCompletarContato, faltaResolver, mensagemAtividades, mensagemCompletarContato, mensagemCompromisso, mensagemContato, mensagemResolver } from './livre.ts';
import { horarioRetorno } from '../_shared/juliaViagemRegras.ts';
import { extrairRelato } from '../_shared/relatoVisita.ts';
import { prepararEntrada } from './schema.ts';
import { comOrg, resolverOrgContato } from './contatoOrg.ts';
import { mensagensValidacao, fraseValidacao, pareceCompletar } from './entrada.ts';
import { mensagemBusca, mensagemCompletar, mensagemIncompleta, mensagemVinculo, type OrgIncompleta } from './organizacao.ts';
import { avisosContatos, contatosOrganizacao, contatosParadas, fraseContatos, orgsParadasPendentes, respostaContatos, type PessoaContato } from '../_shared/contatosOrg.ts';
import { carregarSituacoes, fraseJaSabemos, montarJaSabemos } from '../_shared/jaSabemos.ts';
import { carregarEquipe, resolverAtribuicao } from '../_shared/vendedores.ts';
import { dataExtenso, montarPendencias } from '../_shared/pendenciasDia.ts';
import { conferirFechamento } from '../_shared/notificacoesViagem.ts';
import { jaRegistradasHoje, fraseJaRegistradas } from './respostas.ts';
import { fraseErro, mensagemParadaExtra, mensagemPernoite, mensagemRetorno, retornoConfirmado, mensagemVisita, nomeEmpresa, visitaRepetida } from './respostas.ts';
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
  if (original && typeof original === 'object' && 'acao' in original && ['listar_pendentes','registrar_visita','registrar_pernoite','registrar_dia_sem_visita','agendar_retorno','adicionar_parada','confirmar_extras','buscar_organizacao','vincular_organizacao','listar_organizacoes_incompletas','completar_organizacao','completar_contato',...ACOES_SO_LIVRES].includes(String(original.acao))) acao = String(original.acao);
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
  // Pessoas das organizações já liberadas ao vendedor pela RPC (busca/vínculo): uma ida ao banco.
  const pessoasDasOrgs = async (ids: string[]): Promise<Map<string | undefined, PessoaContato[]>> => {
   const mapa = new Map<string | undefined, PessoaContato[]>();
   if (!ids.length) return mapa;
   const r = await db.from('pessoas').select('organizacao_id,nome,cargo,telefone,celular,e_decisor,created_at').in('organizacao_id', ids).order('created_at').limit(200);
   if (r.error) { console.warn('julia-viagem-ferramentas pessoas_falhou', r.error.code); return mapa; }
   for (const p of r.data ?? []) mapa.set(p.organizacao_id, [...(mapa.get(p.organizacao_id) ?? []), p]);
   return mapa;
  };
  // Admin por voz atribui a um vendedor; vendedor nunca (o banco força de novo em fn_julia_responsavel).
  const ehAdmin = l.papel_ligacao === 'admin' && papeis.includes('admin');
  const atribuir = async (nomeFalado?: string) => {
   const r = resolverAtribuicao({ ehAdmin, vendedorNome: nomeFalado, equipe: ehAdmin && nomeFalado ? await carregarEquipe(db) : [] });
   if (r.ok) avisos.push(...r.avisos);
   return r;
  };
  const semVendedor = (r: { ok: false; confirmar_vendedor: unknown; mensagem: string }) => json({ ok: true, salvo: false, mensagem: r.mensagem, avisos, confirmar_vendedor: r.confirmar_vendedor });
  const paraQuem = (nome?: string | null) => nome ? ` Ficou com ${nome}.` : '';
  if (body.acao === 'registrar_contato_cliente') {
   const { acao: _a, ligacao_id: _l, rota_id: _r, organizacao_id, vendedor_nome, ...dadosBase } = body;
   const at = await atribuir(vendedor_nome); if (!at.ok) return semVendedor(at);
   const dados = at.responsavel_id ? { ...dadosBase, responsavel_id: at.responsavel_id } : dadosBase;
   // Pessoas da empresa (só para a frase de confirmação) em paralelo com a gravação.
   const [rr, porOrg] = await Promise.all([
    db.rpc('julia_registrar_contato', { p_ligacao: l.id, p_org: organizacao_id, p_dados: dados }),
    pessoasDasOrgs([organizacao_id]),
   ]);
   const { contatos_resolvidos, ...r } = check(rr) ?? {}; t.marcar('rpc_contato');
   let mensagem = mensagemContato(r?.empresa, body.canal, r?.proximo_passo_atividade_id ? body.proximo_passo_data : null);
   let confirmar_contato = null;
   if (contatos_resolvidos !== undefined) {
    const rc = respostaContatos(contatos_resolvidos, porOrg.get(organizacao_id) ?? [], r?.empresa || 'empresa');
    avisos.push(...rc.avisos); confirmar_contato = comOrg(rc.confirmar_contato, organizacao_id, r?.empresa); if (rc.pergunta) mensagem = `${mensagem} ${rc.pergunta}`;
   } else if (r?.contato_ambiguo) avisos.push('Há mais de uma pessoa com esse nome na empresa: contato não vinculado; diga o nome completo.');
   if (at.responsavel_id) mensagem += paraQuem(r?.responsavel_nome ?? at.nome);
   return json({ ok: true, salvo: true, ...r, mensagem, avisos, confirmar_contato });
  }
  if (body.acao === 'completar_contato') {
   const falta = faltaCompletarContato(body);
   if (falta) return recusar(falta);
   const { acao: _a, ligacao_id: _l, rota_id: _r, organizacao_id: orgInformada, parada_id, ...dados } = body;
   const organizacao_id = await resolverOrgContato(db, l.vendedor_id, orgInformada, parada_id);
   if (!organizacao_id) return recusar('Use o organizacao_id que veio em confirmar_contato (ou o parada_id da visita).');
   const { avisos: avisosSql, ...r } = check(await db.rpc('julia_completar_contato', { p_ligacao: l.id, p_org: organizacao_id, p_dados: dados })) ?? {}; t.marcar('rpc_completar_contato');
   return json({ ok: true, salvo: true, ...r, mensagem: mensagemCompletarContato(r), avisos: [...avisos, ...(avisosSql ?? [])] });
  }
  if (body.acao === 'listar_atividades_vencidas') {
   const at = await atribuir(body.vendedor_nome); if (!at.ok) return semVendedor(at);
   const lista = check(await db.rpc('julia_listar_atividades', { p_ligacao: l.id, p_limite: 10, ...(at.responsavel_id ? { p_vendedor: at.responsavel_id } : {}) })) ?? []; t.marcar('rpc_atividades');
   const extra = at.responsavel_id ? ` (atividades de ${at.nome}; só ${at.nome} pode resolver)` : '';
   return json({ ok: true, salvo: true, mensagem: mensagemAtividades(lista) + extra, avisos, atividades: lista, ...(at.responsavel_id ? { somente_leitura: true } : {}) });
  }
  if (body.acao === 'resolver_atividade') {
   const falta = faltaResolver(body);
   if (falta) return recusar(falta);
   const r = check(await db.rpc('julia_resolver_atividade', { p_ligacao: l.id, p_atividade: body.atividade_id, p_acao: body.resolucao, p_resultado: body.resultado ?? null, p_nova_data: body.nova_data ?? null, p_motivo: body.motivo ?? null })); t.marcar('rpc_resolver');
   return json({ ok: true, salvo: true, mensagem: mensagemResolver(r?.titulo, body.resolucao, body.nova_data), avisos, atividade_id: body.atividade_id });
  }
  if (body.acao === 'criar_compromisso') {
   const { acao: _a, ligacao_id: _l, rota_id: _r, vendedor_nome, ...dadosBase } = body;
   const at = await atribuir(vendedor_nome); if (!at.ok) return semVendedor(at);
   const dados = at.responsavel_id ? { ...dadosBase, responsavel_id: at.responsavel_id } : dadosBase;
   const comContato = !!(body.contato_nome && body.organizacao_id);
   if (body.contato_nome && !body.organizacao_id) avisos.push('Contato não ligado: diga a empresa para ligar o contato ao compromisso.');
   const [rr, porOrg] = await Promise.all([
    db.rpc('julia_criar_compromisso', { p_ligacao: l.id, p_dados: dados }),
    comContato ? pessoasDasOrgs([body.organizacao_id!]) : Promise.resolve(new Map()),
   ]);
   const { contatos_resolvidos, ...r } = check(rr) ?? {}; t.marcar('rpc_compromisso');
   let mensagem = mensagemCompromisso(body.tipo, body.data, body.hora, r?.empresa) + (at.responsavel_id ? paraQuem(r?.responsavel_nome ?? at.nome) : '');
   let confirmar_contato = null;
   if (comContato && Array.isArray(contatos_resolvidos)) {
    const rc = respostaContatos(contatos_resolvidos, porOrg.get(body.organizacao_id!) ?? [], r?.empresa || 'empresa');
    avisos.push(...rc.avisos); confirmar_contato = rc.confirmar_contato; if (rc.pergunta) mensagem = `${mensagem} ${rc.pergunta}`;
   }
   return json({ ok: true, salvo: true, ...r, mensagem, avisos, confirmar_contato });
  }
 const recarregar = async () => { const r = await carregarRota(db, l.rota_id); t.marcar('recarregar_rota'); return r; };
  // Fonte única: a Júlia cobra o mesmo que vira notificação depois.
  // Respostas a "visitou mais alguém?" ficam no diário ("Júlia — extras AAAA-MM-DD: sim|nao"); falha ao ler só omite a pergunta.
  const lerExtras = async () => { const r = await db.from('rota_diario').select('texto').eq('rota_id', l.rota_id).like('texto', `${PREFIXO_EXTRAS}%`); return r.error ? null : extrasConfirmados((r.data ?? []).map(x => x.texto)); };
  let extras = await lerExtras(); t.marcar('extras');
  const pendencias = (rota: typeof c.rota) => { const p = montarPendencias({ ...rota, extras_confirmados: extras }, data, { completo: true }); t.marcar('montarPendencias'); return p; };
  // Uma organização incompleta por ligação, priorizada pela proximidade da viagem (falha aqui nunca derruba a ligação).
  const orgIncompleta = async (): Promise<OrgIncompleta | null> => (!orgPri || orgPri.error) ? null : ((orgPri.data ?? [])[0] as OrgIncompleta | undefined) ?? null;
  if (body.acao === 'confirmar_extras') {
   if (!extras?.includes(data)) check(await db.from('rota_diario').insert({ rota_id: l.rota_id, autor_id: l.vendedor_id, texto: textoExtras(data, body.resposta) }));
   extras = [...(extras ?? []), data];
   return json({ ok: true, salvo: true, mensagem: body.resposta === 'sim' ? 'Anotado: houve visita fora da rota.' : 'Anotado: nenhuma visita fora da rota hoje.', avisos, pendencias: pendencias(c.rota) });
  }
  if (body.acao === 'listar_pendentes') {
   const [oi, situacoes] = await Promise.all([orgIncompleta(), carregarSituacoes(db, orgsParadasPendentes(c.rota.paradas))]); t.marcar('ja_sabemos');
   const ja = jaRegistradasHoje(c.rota.paradas, data);
   const frase = fraseJaRegistradas(ja);
   return json({ ok: true, salvo: true, mensagem: frase ? `Pendências atualizadas. ${frase}` : 'Pendências atualizadas.', avisos, pendencias: montarPendencias({ ...c.rota, extras_confirmados: extras }, data, { completo: true, organizacaoIncompleta: oi }), ja_registradas_hoje: ja, contatos_paradas: contatosParadas(c.rota.paradas, situacoes) });
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
   const base = (opcoes as { id: string; nome: string; cidade: string | null; uf: string | null; matriz_id: string | null; matriz_nome: string | null }[]).map(o => ({ id: o.id, nome: o.nome, cidade: o.cidade, uf: o.uf, matriz: o.matriz_nome, matriz_id: o.matriz_id }));
   const ids = base.map(o => o.id);
   const [porOrg, situacoes] = await Promise.all([pessoasDasOrgs(ids), carregarSituacoes(db, ids)]); t.marcar('pessoas_busca');
   const varias = base.length > 1;
   const lista = base.map(o => ({ ...o, contatos: contatosOrganizacao(porOrg.get(o.id)), ja_sabemos: montarJaSabemos(situacoes.get(o.id), porOrg.get(o.id)) }));
   const frases = lista.flatMap(o => [fraseContatos(o.contatos, varias ? o.nome : undefined), fraseJaSabemos(o.ja_sabemos, varias ? o.nome : undefined)]).filter(Boolean);
   return json({ ok: true, salvo: true, mensagem: [mensagemBusca(base), ...frases].join(' '), avisos, organizacoes: lista });
  }
  if (body.acao === 'vincular_organizacao') {
   if (!!body.organizacao_id === !!body.criar) return recusar('Informe a empresa encontrada ou os dados para criar uma nova, não os dois.');
   const p = (c.rota.paradas ?? []).find((x: { id: string }) => x.id === body.parada_id);
   if (!p) return recusar('Essa parada não pertence à viagem.');
   t.marcar('pre_vincular'); const r = check(await db.rpc('julia_vincular_organizacao',{ p_ligacao: l.id, p_parada: body.parada_id, p_organizacao: body.organizacao_id ?? null, p_criar: body.criar ?? null }));
   const orgIds = r?.organizacao_id ? [r.organizacao_id] : [];
   const [rotaNova, porOrg, situacoes] = await Promise.all([recarregar(), pessoasDasOrgs(orgIds), carregarSituacoes(db, orgIds)]);
   const contatos = contatosOrganizacao(porOrg.get(r?.organizacao_id));
   const ja_sabemos = montarJaSabemos(situacoes.get(r?.organizacao_id ?? ''), porOrg.get(r?.organizacao_id));
   const mensagem = [mensagemVinculo(r, !!body.criar?.matriz_id), fraseContatos(contatos), fraseJaSabemos(ja_sabemos)].filter(Boolean).join(' ');
   return json({ ok: true, salvo: true, empresa: r?.nome, mensagem, avisos, organizacao_id: r?.organizacao_id, contatos, ja_sabemos, pendencias: pendencias(rotaNova) });
  }
  if (body.acao === 'agendar_retorno') {
   const quando = horarioRetorno(data,body.horario,new Date()); if (!quando) return recusar('Confira o campo horário: escolha um horário futuro de hoje até 22h.');
   if (l.teste) return recusar('Teste manual não agenda retorno automático.');
   const next = check(await db.rpc('julia_reservar_ligacao',{ p_rota: l.rota_id, p_origem: 'retorno', p_quando: quando }));
   // Só confirma se o retorno ficou de fato agendado no horário pedido (antes, um retorno cancelado voltava como "ok").
   if (!retornoConfirmado(next, quando)) { console.warn('julia-viagem-ferramentas retorno_nao_gravado', JSON.stringify({ status: next?.status ?? null })); return falha('Não consegui agendar o retorno; avise que o admin vai ligar.', 409); }
   return json({ ok: true, salvo: true, mensagem: mensagemRetorno(next.agendada_para), avisos, agendada_para: next.agendada_para });
  }
  if (body.acao === 'adicionar_parada') {
   if (!body.organizacao_id && !(body.nome_empresa && body.cidade && body.uf)) return recusar('Informe organizacao_id (de buscar_organizacao) ou nome_empresa, cidade e uf.');
   const dia = body.dia ?? data;
   if (dia > data || dia < c.rota.data_inicio || dia > c.rota.data_fim) return recusar(`O dia ${dia.split('-').reverse().join('/')} não é um dia desta viagem até hoje.`);
   const r = check(await db.rpc('julia_adicionar_parada', { p_ligacao: l.id, p_rota: l.rota_id, p_dados: { ...body, dia } }));
   const orgIds = r?.organizacao_id ? [r.organizacao_id] : [];
   const [rotaNova, porOrg, situacoes] = await Promise.all([recarregar(), pessoasDasOrgs(orgIds), carregarSituacoes(db, orgIds)]);
   const contatos = contatosOrganizacao(porOrg.get(r?.organizacao_id));
   const ja_sabemos = montarJaSabemos(situacoes.get(r?.organizacao_id ?? ''), porOrg.get(r?.organizacao_id));
   const mensagem = [mensagemParadaExtra(r), fraseContatos(contatos), fraseJaSabemos(ja_sabemos)].filter(Boolean).join(' ');
   return json({ ok: true, salvo: true, parada_id: r?.parada_id, empresa: r?.empresa, organizacao_id: r?.organizacao_id, ja_existia: !!r?.ja_existia, mensagem, avisos, contatos, ja_sabemos, pendencias: pendencias(rotaNova) });
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
   const existentes = p.organizacao?.pessoas ?? [];
   const { contatos_resolvidos, ...result } = check(await db.rpc('julia_registrar_voz',{ p_ligacao: l.id, p_rota: l.rota_id, p_acao: body.acao, p_dados: body })) ?? {}; t.marcar('rpc_registrar');
   if (body.visitada && (body as Record<string, unknown>).proximo_passo && body.proximo_passo_data && !result?.atividade_id) avisos.push(p.organizacao_id ? 'Próximo passo salvo, mas a atividade não foi criada; confira no CRM.' : 'Próximo passo salvo sem atividade: a parada não tem empresa vinculada.');
   let mensagem = mensagemVisita(empresa,body.visitada,result?.atividade_id,relato.proximo_passo_data as string);
   let confirmar_contato = null;
   // Banco com a trava (devolve contatos_resolvidos): fala o que ele decidiu. Antes da migração: aviso antigo de ambíguo.
   if (contatos_resolvidos !== undefined) {
    const rc = respostaContatos(contatos_resolvidos, existentes, empresa);
    avisos.push(...rc.avisos); confirmar_contato = comOrg(rc.confirmar_contato, p.organizacao_id, empresa, p.id); if (rc.pergunta) mensagem = `${mensagem} ${rc.pergunta}`;
   } else if (body.visitada) avisos.push(...avisosContatos(body as Record<string, unknown>, existentes));
   const rotaVisita = await recarregar();
   try { await conferirFechamento(db, rotaVisita, data); } catch { /* idem */ }
   return json({ ...result, salvo: true, empresa, mensagem, avisos, confirmar_contato, pendencias: pendencias(rotaVisita) });
  }
  if(body.acao==='registrar_pernoite') {
   if(body.tipo!=='voltou_base' && (!body.cidade || !body.uf)) return recusar('Informe os campos cidade e UF.');
   if(body.tipo==='hotel' && !body.hotel_nome) return recusar('Informe o campo hotel_nome.');
   if(body.tipo==='hotel' && !body.valor && !body.pago_pela_empresa) return recusar('Informe o valor real ou, se a empresa reservou/pagou, pago_pela_empresa=true.');
   if(body.tipo==='hotel' && body.pago_pela_empresa) delete body.valor;
   if(body.tipo!=='hotel' && !body.observacao) return recusar('Informe o campo observação com a justificativa.');
   const noite = body.noite ?? data;
   if (noite > data || noite < c.rota.data_inicio || noite >= c.rota.data_fim) return recusar(`A noite ${noite.split('-').reverse().join('/')} não é uma noite desta viagem até hoje.`);
   if (noite !== data && !Array.isArray(c.rota.dias_sem_visita)) return recusar('Noites anteriores ainda não podem ser registradas por voz; registre pelo app.');
   if ((c.rota.pernoites ?? []).some((x: { noite: string }) => x.noite === noite)) return json({ ok: true, salvo: true, mensagem: 'Pernoite dessa noite já estava salvo.', avisos, pendencias: pendencias(c.rota) });
  }
  if (body.acao === 'registrar_dia_sem_visita') {
   if (!Array.isArray(c.rota.dias_sem_visita)) return recusar('Dia sem visita ainda não está disponível; registre pelo app.');
   if (body.dia >= data || body.dia < c.rota.data_inicio) return recusar('Só dá para marcar como sem visita um dia anterior desta viagem.');
   if (body.motivo === 'outro' && !body.observacao) return recusar('Informe o campo observação explicando o motivo.');
  }
  const result = check(await db.rpc('julia_registrar_voz',{ p_ligacao: l.id, p_rota: l.rota_id, p_acao: body.acao, p_dados: body })); t.marcar('rpc_registrar');
  const rotaNova = await recarregar();
  try { await conferirFechamento(db, rotaNova, data); } catch { /* aviso aos admins nunca derruba a ligação */ }
  const quando = (d?: string) => d && d !== data ? ` (${dataExtenso(d)})` : '';
  const mensagem = body.acao==='registrar_pernoite' ? mensagemPernoite(body) + quando(body.noite) : body.acao==='registrar_dia_sem_visita' ? `Anotei ${dataExtenso(body.dia)} como dia sem visita.` : 'Salvo.';
  return json({ ...result, salvo: true, mensagem, avisos, pendencias: pendencias(rotaNova) });
 } catch(e) {
  if (e instanceof z.ZodError) { avisar400(e.issues); return falha(fraseValidacao(e.issues)); }
  if (e instanceof SyntaxError) return recusar('Confira os dados enviados: formato inválido.');
  const msg = e instanceof Error ? e.message : ''; const status = msg.startsWith('401:') ? 401 : msg.startsWith('403:') ? 403 : 400; if (status === 400) avisar400(); return falha(msg,status);
 }
}
