import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it, beforeAll } from 'vitest';

// Opt-in: Postgres descartável (nunca produção). Usa VIAGENS_TEST_DATABASE_URL.
const url = process.env.VIAGENS_TEST_DATABASE_URL;
const sql = (q: string) => execFileSync('psql', [url ?? '', '-X', '-v', 'ON_ERROR_STOP=1', '-At', '-c', q], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
const dono = '00000000-0000-0000-0000-000000000001';
const admin = '00000000-0000-0000-0000-000000000002';
const outro = '00000000-0000-0000-0000-000000000003';
const rota = '10000000-0000-0000-0000-000000000001';
const parada = '20000000-0000-0000-0000-000000000001';
const hoje = "(now() AT TIME ZONE 'America/Sao_Paulo')::date";
const como = (id: string) => `SELECT set_config('request.jwt.claim.sub','${id}',true); SET LOCAL ROLE authenticated;`;
const viagem = (o: { status?: string; ini?: string; fim?: string; prestacao?: boolean } = {}) =>
  `INSERT INTO public.rotas(id,vendedor_id,status,data_rota,data_inicio,data_fim,prestacao_concluida_em) VALUES('${rota}','${dono}','${o.status ?? 'aprovada'}',${o.ini ?? hoje},${o.ini ?? hoje},${o.fim ?? `${hoje}+1`},${o.prestacao ? 'now()' : 'NULL'}); INSERT INTO public.rota_paradas(id,rota_id) VALUES('${parada}','${rota}');`;
const insDiario = (autor = dono) => `INSERT INTO public.rota_diario(rota_id,autor_id,texto,parada_id) VALUES('${rota}','${autor}','Visitei a Cotrijal','${parada}');`;
const insGasto = (autor = dono) => `INSERT INTO public.rota_gastos(rota_id,autor_id,categoria,valor,data) VALUES('${rota}','${autor}','combustivel',350.5,${hoje});`;
const run = (q: string) => sql(`BEGIN; ${q} ROLLBACK;`);
function erro(q: string) { try { run(q); return ''; } catch (e) { return String((e as { stderr?: string }).stderr); } }

describe.skipIf(!url)('diário, gastos e arquivos das viagens (RLS real)', () => {
  beforeAll(() => {
    sql(`DO $$ BEGIN
      IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
      IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
      IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF; END $$;
      DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA IF EXISTS storage CASCADE;
      CREATE SCHEMA public; CREATE SCHEMA auth; CREATE SCHEMA storage;
      GRANT USAGE ON SCHEMA public, auth, storage TO authenticated, anon;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      CREATE TYPE public.app_role AS ENUM('admin','comercial');
      CREATE TABLE public.user_roles(user_id uuid, role public.app_role); INSERT INTO public.user_roles VALUES('${admin}','admin');
      CREATE FUNCTION public.has_role(_user_id uuid,_role public.app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role) $$;
      CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at=now(); RETURN NEW; END $$;
      CREATE TABLE public.organizacoes(id uuid PRIMARY KEY);
      CREATE TABLE public.rotas(id uuid PRIMARY KEY, vendedor_id uuid NOT NULL, status text NOT NULL, data_rota date NOT NULL, data_inicio date, data_fim date, prestacao_concluida_em timestamptz);
      CREATE TABLE public.rota_paradas(id uuid PRIMARY KEY, rota_id uuid REFERENCES public.rotas ON DELETE CASCADE);
      GRANT SELECT ON public.rota_paradas TO authenticated;
      CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text);
      CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
      GRANT SELECT, INSERT, DELETE ON storage.objects TO authenticated;
      -- Política de outro bucket com pastas não-UUID (como modelos-3d), liberada a todos
      CREATE POLICY outros_select ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'modelos-3d');
      INSERT INTO storage.objects(bucket_id,name) VALUES ('modelos-3d','plantas/LSB150/modelo.glb'), ('viagens','nao-uuid/diario/x.jpg'), ('viagens','${rota}/diario/a.jpg');`);
    const migs = readdirSync('supabase/migrations').filter((f) => f.startsWith('20261104145856') || f.startsWith('20261104145922') || f.startsWith('20261104150721')).sort();
    expect(migs.length).toBe(3);
    for (const f of migs) sql(readFileSync(`supabase/migrations/${f}`, 'utf8'));
    for (const f of migs) sql(readFileSync(`supabase/migrations/${f}`, 'utf8')); // idempotente
  });

  // ---- Diário ----
  it('dono escreve durante a viagem aprovada', () => expect(run(`${viagem()} ${como(dono)} ${insDiario()} SELECT count(*) FROM public.rota_diario;`)).toMatch(/INSERT 0 1\n1/));
  it('dono escreve até fim + 1 dia, e não no dia seguinte a isso', () => {
    expect(erro(`${viagem({ ini: `${hoje}-3`, fim: `${hoje}-1` })} ${como(dono)} ${insDiario()}`)).toBe('');
    expect(erro(`${viagem({ ini: `${hoje}-3`, fim: `${hoje}-2` })} ${como(dono)} ${insDiario()}`)).toContain('row-level security');
  });
  it('janela: antes do início e viagem não aprovada são recusados', () => {
    expect(erro(`${viagem({ ini: `${hoje}+1`, fim: `${hoje}+2` })} ${como(dono)} ${insDiario()}`)).toContain('row-level security');
    expect(erro(`${viagem({ status: 'rascunho' })} ${como(dono)} ${insDiario()}`)).toContain('row-level security');
  });
  it('outro vendedor não escreve nem lê; admin lê', () => {
    expect(erro(`${viagem()} ${como(outro)} ${insDiario(outro)}`)).toContain('row-level security');
    const base = `${viagem()} INSERT INTO public.rota_diario(rota_id,autor_id,texto) VALUES('${rota}','${dono}','x');`;
    expect(run(`${base} ${como(outro)} SELECT count(*) FROM public.rota_diario;`)).toMatch(/\n0$/m);
    expect(run(`${base} ${como(admin)} SELECT count(*) FROM public.rota_diario;`)).toMatch(/\n1$/m);
    expect(run(`${base} ${como(dono)} SELECT count(*) FROM public.rota_diario;`)).toMatch(/\n1$/m);
  });
  it('diário é imutável (sem UPDATE, nem como superusuário) e só admin apaga', () => {
    const base = `${viagem()} INSERT INTO public.rota_diario(rota_id,autor_id,texto) VALUES('${rota}','${dono}','x');`;
    expect(erro(`${base} ${como(dono)} UPDATE public.rota_diario SET texto='y';`)).toContain('permission denied');
    expect(erro(`${base} UPDATE public.rota_diario SET texto='y';`)).toContain('não pode ser alterado');
    expect(run(`${base} ${como(dono)} DELETE FROM public.rota_diario; RESET ROLE; SELECT count(*) FROM public.rota_diario;`)).toMatch(/DELETE 0[\s\S]*\n1$/m);
    expect(run(`${base} ${como(admin)} DELETE FROM public.rota_diario;`)).toContain('DELETE 1');
  });
  it('foto do informativo precisa estar na pasta da própria rota', () =>
    expect(erro(`${viagem()} ${como(dono)} INSERT INTO public.rota_diario(rota_id,autor_id,texto,fotos) VALUES('${rota}','${dono}','x',ARRAY['outra-rota/diario/a.jpg']);`)).toContain('row-level security'));

  // ---- Gastos ----
  it('dono lança gasto durante a viagem; outro vendedor não lê nem lança', () => {
    expect(erro(`${viagem()} ${como(dono)} ${insGasto()}`)).toBe('');
    expect(erro(`${viagem()} ${como(outro)} ${insGasto(outro)}`)).toContain('row-level security');
    expect(run(`${viagem()} ${insGasto()} ${como(outro)} SELECT count(*) FROM public.rota_gastos;`)).toMatch(/\n0$/m);
    expect(run(`${viagem()} ${insGasto()} ${como(admin)} SELECT count(*) FROM public.rota_gastos;`)).toMatch(/\n1$/m);
  });
  it('depois da prestação concluída só admin altera', () => {
    const base = `${viagem({ prestacao: true })} ${insGasto()}`;
    expect(erro(`${viagem({ prestacao: true })} ${como(dono)} ${insGasto()}`)).toContain('row-level security');
    expect(run(`${base} ${como(dono)} UPDATE public.rota_gastos SET valor=1; DELETE FROM public.rota_gastos;`)).toContain('UPDATE 0\nDELETE 0');
    expect(run(`${base} ${como(admin)} UPDATE public.rota_gastos SET valor=1;`)).toContain('UPDATE 1');
  });

  // ---- Storage ----
  it('arquivos: dono e admin leem a pasta da rota; outro vendedor não', () => {
    const q = `SELECT count(*) FROM storage.objects WHERE bucket_id='viagens';`;
    expect(run(`${viagem()} ${como(dono)} ${q}`)).toMatch(/\n1$/m);
    expect(run(`${viagem()} ${como(admin)} ${q}`)).toMatch(/\n1$/m);
    expect(run(`${viagem()} ${como(outro)} ${q}`)).toMatch(/\n0$/m);
  });
  it('outro bucket com pasta não-UUID lista sem erro; viagens com pasta não-UUID é negado', () => {
    expect(run(`${viagem()} ${como(outro)} SELECT count(*) FROM storage.objects;`)).toMatch(/\n1$/m);
    expect(run(`${viagem()} ${como(admin)} SELECT name FROM storage.objects WHERE bucket_id='viagens' ORDER BY name;`)).not.toContain('nao-uuid');
    expect(erro(`${viagem()} ${como(admin)} INSERT INTO storage.objects(bucket_id,name) VALUES('viagens','nao-uuid/diario/b.jpg');`)).toContain('row-level security');
  });
  it('upload: dono envia em diario/ e notas/ na janela; outro vendedor não; só admin apaga', () => {
    expect(erro(`${viagem()} ${como(dono)} INSERT INTO storage.objects(bucket_id,name) VALUES('viagens','${rota}/diario/b.jpg'),('viagens','${rota}/notas/n.jpg');`)).toBe('');
    expect(erro(`${viagem()} ${como(dono)} INSERT INTO storage.objects(bucket_id,name) VALUES('viagens','${rota}/outra/b.jpg');`)).toContain('row-level security');
    expect(erro(`${viagem()} ${como(outro)} INSERT INTO storage.objects(bucket_id,name) VALUES('viagens','${rota}/diario/b.jpg');`)).toContain('row-level security');
    expect(run(`${viagem()} ${como(dono)} DELETE FROM storage.objects WHERE bucket_id='viagens';`)).toContain('DELETE 0');
    expect(run(`${viagem()} ${como(admin)} DELETE FROM storage.objects WHERE name='${rota}/diario/a.jpg';`)).toContain('DELETE 1');
  });
});
