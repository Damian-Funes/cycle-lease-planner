import { contatosParadas, primeiroNome } from '../_shared/contatosOrg.ts';
import { z } from 'npm:zod@3';
import { montarPendencias } from '../_shared/pendenciasDia.ts';
import { jaRegistradasHoje, fraseJaRegistradas } from '../_shared/jaRegistradas.ts';
import { admins, check, contexto, corsHeaders, dbAdmin, enviarContato, erro, horarioBRT, json, notificar, secretIgual, usuario } from '../_shared/juliaViagem.ts';
import { DAMIAN_ID, janelaCron, motivoNaoDiscar } from '../_shared/juliaViagemRegras.ts';
import { configurarElevenLabs, erroElevenLabs } from './elevenlabs.ts';
const Body = z.discriminatedUnion('modo', [
  z.object({ modo: z.literal('cron') }).strict(),
  z.object({ modo: z.literal('manual'), rota_id: z.string().uuid(), teste: z.boolean().default(false) }).strict(),
  z.object({ modo: z.literal('escolha'), ligacao_id: z.string().uuid(), escolha: z.enum(['agora','18h','19h','20h','app']) }).strict(),
]);
export async function handler(req: Request) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  try {
    const input = Body.parse(await req.json());
    let actor: string | null = null;
    if (input.modo === 'cron') { if (!await secretIgual(req.headers.get('x-cron-secret'), 'JULIA_CRON_SECRET')) return json({ error: 'Unauthorized' }, 401); }
    else actor = await usuario(req, input.modo === 'manual');
    const db = dbAdmin(); const agora = new Date(); const { data, hora } = horarioBRT(agora);
    // Não toca tabelas novas antes de a migration ser aprovada/aplicada.
    const parametros = check(await db.from('viagem_parametros').select('*').eq('id', 'padrao').single());
    if (!Object.hasOwn(parametros, 'ligacao_ativa')) return json({ error: 'Aguardando aprovação e aplicação da SQL da Júlia.' }, 409);
    if (input.modo === 'escolha') {
      // RPC usa JWT real, nunca service role com identidade arbitrária do cliente.
      const { createClient } = await import('npm:@supabase/supabase-js@2');
      const client = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
      check(await client.rpc('julia_escolher_contato', { p_ligacao: input.ligacao_id, p_escolha: input.escolha }));
      if (input.escolha !== 'agora') return json({ ok: true });
    }
    if (input.modo === 'cron' && (!parametros.ligacao_ativa || !janelaCron(hora))) return json({ ok: true, desativada: !parametros.ligacao_ativa });
    const reservar = async (rotaId: string, origem: string, quando: string, teste = false) => check(await db.rpc('julia_reservar_ligacao', { p_rota: rotaId, p_origem: origem, p_quando: quando, p_admin: actor, p_teste: teste }));
    // Retorna null quando discou; senão o motivo exato para o botão.
    const discar = async (id: string, manualAdmin = false): Promise<string | null> => {
      // Claim atômico: só um executor chega à ElevenLabs, mesmo com cron e Agora simultâneos.
      const l = check(await db.from('ligacoes_viagem').update({ status: 'discando', updated_at: agora.toISOString() }).eq('id', id).in('status', ['agendada','aguardando_escolha']).lte('agendada_para', agora.toISOString()).select('*').maybeSingle());
      if (!l) return 'Ligação já encerrada.';
      try {
        if (l.data_ref !== data || hora >= '22:00') throw new Error('Janela de ligação encerrada.');
        const c = await contexto(db, l.rota_id, data);
        if (c.rota.status !== 'aprovada' || data < c.rota.data_inicio || data > c.rota.data_fim) throw new Error('Viagem fora do período.');
        let pendencias = c.pendencias;
        if (manualAdmin) {
          // Admin religa: considera também o debrief e a organização incompleta (falha na org não derruba).
          const org = await db.rpc('fn_organizacoes_incompletas_priorizadas', { p_vendedor: l.vendedor_id, p_rota: l.rota_id, p_limite: 1 });
          const oi = org.error ? null : ((org.data ?? [])[0] ?? null);
          pendencias = montarPendencias(c.rota, data, { completo: true, organizacaoIncompleta: oi });
        }
        const motivo = motivoNaoDiscar(pendencias, manualAdmin);
        if (motivo) { check(await db.from('ligacoes_viagem').update({ status: 'cancelada', erro: motivo }).eq('id', l.id)); return motivo; }
        let perfil = c.perfil;
        if (l.teste) {
          if (l.solicitado_por !== DAMIAN_ID) throw new Error('Teste fora da whitelist.');
          const admin = check(await db.from('user_roles').select('role').eq('user_id', l.solicitado_por).eq('role','admin').maybeSingle());
          if (!admin) throw new Error('Teste exige admin.');
          const perfilAdmin = check(await db.from('profiles').select('user_id,nome,celular').eq('user_id', l.solicitado_por).single());
          if (!perfilAdmin) throw new Error('Perfil do admin não encontrado.');
          perfil = perfilAdmin;
        }
        if (!perfil) throw new Error('Perfil do destinatário não encontrado.');
        if (!/^\+55[1-9]\d{9,10}$/.test(perfil.celular ?? '')) throw new Error('Celular do destinatário ausente ou inválido.');
        const config = configurarElevenLabs({ key: Deno.env.get('ELEVENLABS_API_KEY'), agent: Deno.env.get('ELEVENLABS_AGENT_ID_VIAGEM'), phone: Deno.env.get('ELEVENLABS_PHONE_NUMBER_ID'), telefonia: Deno.env.get('ELEVENLABS_TELEFONIA') });
        const { key, agent, phone } = config;
        check(await db.from('ligacoes_viagem').update({ telefone: perfil.celular }).eq('id', l.id));
        const res = await fetch(config.endpoint, { method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json' }, body: JSON.stringify({
          agent_id: agent, agent_phone_number_id: phone, to_number: perfil.celular,
          conversation_initiation_client_data: { dynamic_variables: { vendedor_nome: primeiroNome(c.perfil.nome), vendedor_id: l.vendedor_id, rota_id: l.rota_id, rota_nome: c.rota.nome || 'Viagem comercial', data_hoje: data.split('-').reverse().join('/'), noite: data, ultimo_dia: data === c.rota.data_fim ? 'sim' : 'não', ligacao_id: l.id, pendencias: JSON.stringify(c.pendencias), visitadas_hoje: c.rota.paradas.filter((p: { dia: string; visitada: boolean | null }) => p.dia === data && p.visitada != null).length, ja_registradas_hoje: JSON.stringify(jaRegistradasHoje(c.rota.paradas, data)), contatos_paradas: JSON.stringify(contatosParadas(c.rota.paradas)), ja_registradas_hoje_frase: fraseJaRegistradas(jaRegistradasHoje(c.rota.paradas, data)) || 'Nada registrado hoje ainda.', teste: l.teste ? 'sim' : 'não' } },
        }) });
        if (!res.ok) throw new Error(erroElevenLabs(res.status, await res.text(), [key, agent, phone, perfil.celular ?? '', Deno.env.get('ELEVENLABS_AGENT_ID_VIAGEM') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', Deno.env.get('JULIA_TOOL_SECRET') ?? '', Deno.env.get('JULIA_WEBHOOK_SECRET') ?? '', Deno.env.get('JULIA_CRON_SECRET') ?? '']));
        const result = await res.json();
        if (!result.conversation_id || result.success === false) throw new Error('ElevenLabs não confirmou a conversa.');
        check(await db.from('ligacoes_viagem').update({ status: 'em_andamento', conversation_id: result.conversation_id, call_sid: result.callSid ?? result.call_sid ?? null }).eq('id', l.id));
        return null;
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Falha ao ligar.';
        check(await db.from('ligacoes_viagem').update({ status: 'falhou', erro: message }).eq('id', l.id));
        for (const admin of await admins(db)) await notificar(db, admin, `falha:${l.id}`, 'Júlia não conseguiu ligar', `/viagens/${l.rota_id}/acompanhar`, message);
        throw e;
      }
    };
    if (input.modo === 'manual') {
      if (input.teste) {
        // Teste preso (webhook não chegou) expira após 10 min para não bloquear novo teste.
        const limite = new Date(agora.getTime() - 10 * 60000).toISOString();
        check(await db.from('ligacoes_viagem').update({ status: 'falhou', erro: 'expirado', updated_at: agora.toISOString() }).eq('teste', true).eq('data_ref', data).in('status', ['discando','em_andamento']).lt('updated_at', limite));
      }
      let origem = input.teste ? 'teste' : 'inicial';
      if (!input.teste) {
        // Já houve a inicial hoje: admin religa como 'manual' (tentativa seguinte, sem limite).
        const r = check(await db.from('rotas').select('vendedor_id').eq('id', input.rota_id).maybeSingle());
        const inicial = r && check(await db.from('ligacoes_viagem').select('id').eq('vendedor_id', r.vendedor_id).eq('data_ref', data).eq('origem', 'inicial').maybeSingle());
        if (inicial) origem = 'manual';
      }
      const l = await reservar(input.rota_id, origem, agora.toISOString(), input.teste);
      // Nunca responder ok sem discar (antes, a inicial já concluída voltava "ok" em silêncio).
      const motivo = await discar(l.id, true);
      if (motivo) return json({ error: `Não foi possível discar: ${motivo}` }, 409);
      return json({ ok: true, ligacao_id: l.id });
    }
    if (input.modo === 'escolha') { await discar(input.ligacao_id); return json({ ok: true }); }
    // 9h: inclui viagens terminadas ontem, mesmo fora da lista de "em andamento" de hoje.
    if (hora >= '09:00' && hora <= '09:10') {
      const ontem = new Date(agora.getTime() - 86400000); const ref = horarioBRT(ontem).data;
      const rs = check(await db.from('rotas').select('id,vendedor_id,data_fim').eq('status','aprovada').lte('data_inicio',ref).gte('data_fim',ref));
      for (const r of rs ?? []) {
        const c = await contexto(db,r.id,ref);
        const aberto = c.pendencias.some(p => p.tipo === 'pernoite_noite' || (r.data_fim === ref && p.tipo === 'parada_pendente'));
        if (aberto) for (const u of [r.vendedor_id,...await admins(db)]) await notificar(db,u,`dia_aberto:${r.id}:${ref}`,'Fechamento do dia pendente',`/viagens/${r.id}/hoje`,`Falta fechar o dia ${ref.split('-').reverse().join('/')}.`);
      }
      return json({ ok: true });
    }
    const rotas = check(await db.from('rotas').select('id,vendedor_id').eq('status','aprovada').lte('data_inicio',data).gte('data_fim',data).order('id'));
    const falhas: string[] = [];
    for (const r of rotas ?? []) {
      try {
        const c = await contexto(db,r.id,data);
        const precisa = c.pendencias.some(p => p.tipo === 'pernoite_noite') || (data === c.rota.data_fim && c.pendencias.some(p => p.tipo === 'parada_pendente'));
        if (!precisa || hora < String(parametros.contato_hora).slice(0,5)) continue;
        const existente = check(await db.from('ligacoes_viagem').select('id').eq('vendedor_id',r.vendedor_id).eq('data_ref',data).eq('origem','inicial').maybeSingle());
        if (!existente) {
          const horario = `${data}T${hora < '17:00' ? '17:00' : hora}:00-03:00`;
          const l = await reservar(r.id,'inicial',new Date(horario).toISOString());
          check(await db.from('ligacoes_viagem').update({ status: 'aguardando_escolha' }).eq('id',l.id).eq('status','agendada'));
          await enviarContato(db,r.vendedor_id,r.id,data);
        }
      } catch { falhas.push(r.id); }
    }
    const vencidas = check(await db.from('ligacoes_viagem').select('id').eq('data_ref',data).eq('teste',false).in('status',['agendada','aguardando_escolha']).lte('agendada_para',agora.toISOString()));
    for (const l of vencidas ?? []) { try { await discar(l.id); } catch { falhas.push(l.id); } }
    return json({ ok: falhas.length === 0, falhas });
  } catch (e) { return erro(e); }
}
Deno.serve(handler);