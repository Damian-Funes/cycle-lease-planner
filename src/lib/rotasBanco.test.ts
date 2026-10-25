import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it, beforeAll } from 'vitest';

// Opt-in integration suite for an isolated disposable Postgres, never production.
const ativo = Boolean(process.env.ROTAS_TEST_DATABASE_URL);
const sql = (query: string) => execFileSync('psql', [process.env.ROTAS_TEST_DATABASE_URL ?? '', '-X', '-v', 'ON_ERROR_STOP=1', '-At', '-c', query], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
const vendedor = '00000000-0000-0000-0000-000000000001';
const admin = '00000000-0000-0000-0000-000000000002';
const actor = (id = vendedor) => `SELECT set_config('request.jwt.claim.sub','${id}',false);`;
const rota = '10000000-0000-0000-0000-000000000001';
const parada = '20000000-0000-0000-0000-000000000001';
function fixture(data = 'current_date', objetivo = "'apresentar LSB150'") {
  return `${actor()} INSERT INTO public.rotas(id,vendedor_id,data_rota) VALUES('${rota}','${vendedor}',${data}); INSERT INTO public.rota_paradas(id,rota_id,tipo,objetivo) VALUES('${parada}','${rota}','prospeccao',${objetivo});`;
}
function aprovar() { return `UPDATE public.rotas SET status='aguardando_aprovacao' WHERE id='${rota}'; ${actor(admin)} UPDATE public.rotas SET status='aprovada' WHERE id='${rota}'; ${actor()}`; }
function bloqueado(query: string, trecho: string) {
  let mensagem = '';
  try { sql(`BEGIN; ${query} ROLLBACK;`); } catch (e) { mensagem = String((e as { stderr?: string }).stderr); }
  expect(mensagem).toContain(trecho);
}
describe.skipIf(!ativo)('triggers reais de autorização em Postgres descartável', () => {
  beforeAll(() => {
    sql(`DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF; IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF; IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF; END $$;
      CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      CREATE TYPE public.app_role AS ENUM('admin','comercial');
      CREATE TABLE public.user_roles(user_id uuid,role public.app_role);
      INSERT INTO public.user_roles VALUES('${admin}','admin');
      CREATE FUNCTION public.has_role(_user_id uuid,_role public.app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role) $$;
      CREATE TABLE public.rotas(id uuid PRIMARY KEY,vendedor_id uuid NOT NULL,data_rota date NOT NULL,status text NOT NULL DEFAULT 'planejada',observacoes text,km_total_estimado numeric,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
      CREATE TABLE public.rota_paradas(id uuid PRIMARY KEY,rota_id uuid REFERENCES public.rotas ON DELETE CASCADE,organizacao_id uuid,oportunidade_id uuid,cidade text,estado text,ordem int DEFAULT 0,tipo text DEFAULT 'visita',latitude numeric,longitude numeric,atividade_id uuid,concluida boolean DEFAULT false,observacoes text);`);
    const migrations = readdirSync('supabase/migrations').filter(f => f.startsWith('20261025031715') || f.startsWith('20261025032100') || f.startsWith('20261025032329')).sort();
    for (const f of migrations) sql(readFileSync(`supabase/migrations/${f}`, 'utf8'));
    // Running the migrations again proves idempotence on the isolated database.
    for (const f of migrations) sql(readFileSync(`supabase/migrations/${f}`, 'utf8'));
  });
  it('bloqueio 1: vendedor não aprova ou reprova', () => { for (const status of ['aprovada','reprovada']) bloqueado(`${fixture()} UPDATE public.rotas SET status='aguardando_aprovacao' WHERE id='${rota}'; UPDATE public.rotas SET status='${status}' WHERE id='${rota}';`, 'Somente admin'); });
  it('reprovação admin exige motivo', () => bloqueado(`${fixture()} UPDATE public.rotas SET status='aguardando_aprovacao' WHERE id='${rota}'; ${actor(admin)} UPDATE public.rotas SET status='reprovada' WHERE id='${rota}';`, 'motivo da reprovação'));
  it('aprovação grava aprovador e data', () => expect(sql(`BEGIN; ${fixture()} ${aprovar()} SELECT (aprovada_por='${admin}' AND aprovada_em IS NOT NULL)::text FROM public.rotas WHERE id='${rota}'; ROLLBACK;`)).toContain('true'));
  it('bloqueio 2: data passada, plano vazio, objetivo vazio e visita sem organização', () => {
    bloqueado(`${fixture('current_date-1')} UPDATE public.rotas SET status='aguardando_aprovacao' WHERE id='${rota}';`, 'data da rota');
    bloqueado(`${fixture()} DELETE FROM public.rota_paradas; UPDATE public.rotas SET status='aguardando_aprovacao' WHERE id='${rota}';`, 'ao menos uma parada');
    bloqueado(`${fixture('current_date', "' '")} UPDATE public.rotas SET status='aguardando_aprovacao' WHERE id='${rota}';`, 'objetivo');
    bloqueado(`${fixture()} UPDATE public.rota_paradas SET tipo='visita'; UPDATE public.rotas SET status='aguardando_aprovacao' WHERE id='${rota}';`, 'organização');
  });
  it('bloqueio 3: aprovada passada impede próxima viagem', () => {
    bloqueado(`${fixture()} ${aprovar()} ALTER TABLE public.rotas DISABLE TRIGGER rotas_autorizacao; UPDATE public.rotas SET data_rota=current_date-1 WHERE id='${rota}'; ALTER TABLE public.rotas ENABLE TRIGGER rotas_autorizacao; INSERT INTO public.rotas(id,vendedor_id,data_rota) VALUES('10000000-0000-0000-0000-000000000002','${vendedor}',current_date+1); INSERT INTO public.rota_paradas(id,rota_id,tipo,objetivo) VALUES('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','prospeccao','fechar orçamento'); UPDATE public.rotas SET status='aguardando_aprovacao' WHERE id='10000000-0000-0000-0000-000000000002';`, 'antes de pedir nova viagem');
  });
  it('bloqueio 4: conclusão exige visitada e relato correspondente', () => {
    for (const patch of ['', "UPDATE public.rota_paradas SET visitada=true;", "UPDATE public.rota_paradas SET visitada=false;"]) bloqueado(`${fixture()} ${aprovar()} ${patch} UPDATE public.rotas SET status='concluida' WHERE id='${rota}';`, 'Informe todas as paradas');
  });
  it('relato não reaprova e conclusão carimba a prestação', () => expect(sql(`BEGIN; ${fixture()} ${aprovar()} UPDATE public.rota_paradas SET visitada=true,resultado='LSB150 apresentado'; SELECT status FROM public.rotas; UPDATE public.rotas SET status='concluida'; SELECT (prestacao_concluida_em IS NOT NULL)::text FROM public.rotas; ROLLBACK;`)).toContain('aprovada\nUPDATE 1\ntrue'));
  it('mudança de objetivo reabre aprovação', () => expect(sql(`BEGIN; ${fixture()} ${aprovar()} UPDATE public.rota_paradas SET objetivo='fechar orçamento ORC-xxx'; SELECT status FROM public.rotas; ROLLBACK;`)).toContain('aguardando_aprovacao'));
  it('concluída impede editar parada por vendedor', () => bloqueado(`${fixture()} ${aprovar()} UPDATE public.rota_paradas SET visitada=false,motivo_nao_visita='Cliente ausente'; UPDATE public.rotas SET status='concluida'; UPDATE public.rota_paradas SET resultado='alteração';`, 'encerrada'));
  it('impede criar aprovada diretamente', () => bloqueado(`${actor()} INSERT INTO public.rotas(id,vendedor_id,data_rota,status) VALUES('${rota}','${vendedor}',current_date,'aprovada');`, 'rascunho'));
  it('vendedor não elimina pendência por status ou exclusão', () => {
    for (const query of ["UPDATE public.rotas SET status='rascunho';", "UPDATE public.rotas SET status='cancelada';", 'DELETE FROM public.rotas;']) bloqueado(`${fixture()} ${aprovar()} ${query}`, query.startsWith('DELETE') ? 'não pode ser apagada' : query.includes('cancelada') ? 'Somente admin' : 'não pode voltar');
  });
  it('RLS oculta rota de outro vendedor e admin vê todas', () => {
    const outro = '00000000-0000-0000-0000-000000000003';
    expect(sql(`BEGIN; ${fixture()} ${actor(outro)} SET LOCAL ROLE authenticated; SELECT count(*) FROM public.rotas; ROLLBACK;`)).toContain('SET\n0');
    expect(sql(`BEGIN; ${fixture()} ${actor(admin)} SET LOCAL ROLE authenticated; SELECT count(*) FROM public.rotas; ROLLBACK;`)).toContain('SET\n1');
  });
});