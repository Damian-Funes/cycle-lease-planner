// Ligação recebida: webhook de iniciação da ElevenLabs (Twilio inbound). Só o comercial é atendido.
// Com viagem hoje: mesmo contexto da ligação feita. Sem viagem: modo livre (rota_id vazio).
import { carregarRota, check, dbAdmin, horarioBRT, json, secretIgualAlgum } from '../_shared/juliaViagem.ts';
import { permitidoLigar } from '../_shared/juliaViagemRegras.ts';
import { montarPendencias } from '../_shared/pendenciasDia.ts';
import { primeiroNome } from '../_shared/contatosOrg.ts';
import { chaveTelefone, decidirEntrada, montarVariaveis, MSG_ENTRADA, respostaEntrada, variaveisVazias } from '../_shared/variaveisLigacao.ts';

const PAPEIS = ['comercial', 'rtv', 'gerente_comercial'];
const mascarar = (t: string) => t.replace(/\d(?=\d{4})/g, '*');

export async function handler(req: Request) {
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  if (!await secretIgualAlgum(req.headers.get('x-julia-secret'), ['JULIA_ENTRADA_SECRET', 'JULIA_TOOL_SECRET'])) return json({ error: 'Unauthorized' }, 401);
  const t0 = Date.now();
  let nome = '';
  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const caller = String(body.caller_id ?? '');
    const chave = chaveTelefone(caller);
    const db = dbAdmin(); const { data } = horarioBRT(new Date());
    const perfis = chave ? check(await db.from('profiles').select('user_id,nome,celular').not('celular', 'is', null)) ?? [] : [];
    const perfil = perfis.find(p => chaveTelefone(p.celular) === chave) ?? null;
    let papeis: string[] = [];
    if (perfil) papeis = (check(await db.from('user_roles').select('role').eq('user_id', perfil.user_id)) ?? []).map(r => r.role as string);
    const comercial = papeis.some(p => PAPEIS.includes(p));
    const vendedor = !!perfil && (comercial || permitidoLigar(perfil.user_id, papeis));
    nome = perfil ? primeiroNome(perfil.nome) : '';
    const teste = vendedor && !comercial; // Damian admin
    let rota: { id: string; vendedor_id: string } | null = null;
    if (vendedor && perfil) {
      let q = db.from('rotas').select('id,vendedor_id').eq('status', 'aprovada').lte('data_inicio', data).gte('data_fim', data).order('data_inicio').limit(1);
      if (!teste) q = q.eq('vendedor_id', perfil.user_id);
      rota = (check(await q) ?? [])[0] ?? null;
    }
    const alvo = rota?.vendedor_id ?? perfil?.user_id;
    const ativa = vendedor ? check(await db.from('ligacoes_viagem').select('id').eq('vendedor_id', alvo).eq('data_ref', data).eq('teste', teste).in('status', ['discando', 'em_andamento']).limit(1)) ?? [] : [];
    const decisao = decidirEntrada({ vendedor, temViagem: !!rota, ocupado: ativa.length > 0 });
    console.log('julia-viagem-entrada', JSON.stringify({ caller: mascarar(caller), decisao, teste, ms: Date.now() - t0 }));
    if (decisao === 'nao') return json(respostaEntrada(variaveisVazias('nao'), MSG_ENTRADA.nao));
    if (decisao === 'ocupado') return json(respostaEntrada(variaveisVazias('ocupado', nome), MSG_ENTRADA.ocupado(nome)));
    // Reserva atômica (cancela agendadas não discadas, uma ativa por vendedor) — só existe após a SQL.
    const reserva = (rotaId: string | null, vend: string) => db.rpc('julia_reservar_entrada', { p_vendedor: vend, p_rota: rotaId, p_telefone: caller, p_call_sid: String(body.call_sid ?? '') || null, p_teste: teste, p_solicitante: perfil!.user_id });
    if (decisao === 'livre') {
      const lig = check(await reserva(null, perfil!.user_id)) as { id: string };
      const vars = { ...variaveisVazias('livre', nome), vendedor_id: perfil!.user_id, ligacao_id: lig.id, data_hoje: data.split('-').reverse().join('/'), teste: teste ? 'sim' : 'não' };
      console.log('julia-viagem-entrada livre', JSON.stringify({ ligacao: lig.id, ms: Date.now() - t0 }));
      return json(respostaEntrada(vars, MSG_ENTRADA.livre(nome)));
    }
    const [l, r] = await Promise.all([reserva(rota!.id, rota!.vendedor_id), carregarRota(db, rota!.id)]);
    const lig = check(l) as { id: string; vendedor_id: string };
    const org = await db.rpc('fn_organizacoes_incompletas_priorizadas', { p_vendedor: lig.vendedor_id, p_rota: rota!.id, p_limite: 1 });
    const pendencias = montarPendencias(r, data, { completo: true, organizacaoIncompleta: org.error ? null : ((org.data ?? [])[0] ?? null) });
    const vendNome = teste ? (check(await db.from('profiles').select('nome').eq('user_id', lig.vendedor_id).single()))?.nome ?? perfil!.nome : perfil!.nome;
    const vars = montarVariaveis({ rota: r, perfilNome: vendNome, vendedorId: lig.vendedor_id, rotaId: rota!.id, ligacaoId: lig.id, data, pendencias, teste, origem: 'entrada' });
    console.log('julia-viagem-entrada ok', JSON.stringify({ ligacao: lig.id, ms: Date.now() - t0 }));
    return json(respostaEntrada(vars, MSG_ENTRADA.sim(nome)));
  } catch (e) {
    console.error('julia-viagem-entrada erro', e instanceof Error ? e.message : 'erro');
    return json(respostaEntrada(variaveisVazias('erro', nome), MSG_ENTRADA.erro));
  }
}
Deno.serve(handler);
