import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
// Only opt in on a dedicated disposable database, never on the connected project.
const url=process.env.CAPACIDADE_TEST_DATABASE_URL;
const sql=(q:string)=>execFileSync('psql',[url??'','-X','-v','ON_ERROR_STOP=1','-At','-c',q],{encoding:'utf8',stdio:['pipe','pipe','pipe']});
const owner='00000000-0000-0000-0000-000000000001',admin='00000000-0000-0000-0000-000000000002',shared='00000000-0000-0000-0000-000000000003',other='00000000-0000-0000-0000-000000000004';
const org='10000000-0000-0000-0000-000000000001',deal='20000000-0000-0000-0000-000000000001',diag='30000000-0000-0000-0000-000000000001';
const actor=(id:string)=>`SELECT set_config('request.jwt.claim.sub','${id}',true); SET LOCAL ROLE authenticated;`;
const insert=(linked=true)=>`INSERT INTO public.diagnosticos_tecnicos(id,${linked?'oportunidade_id,organizacao_id,':''}cultura,sacos_safra,kg_por_saco,janela_dias,horas_trabalhadas_dia,lotes_liberados_dia_anterior,horas_perdidas_dia,tempo_receita_s,resultado) VALUES('${diag}',${linked?`'${deal}','${org}',`:''}'soja',200000,40,45,20,true,2,43,'{}');`;
function rejected(q:string,part:string){let error='';try{sql(`BEGIN;${q}ROLLBACK;`);}catch(e){error=String((e as {stderr?:string}).stderr);}expect(error).toContain(part);}
describe.skipIf(!url)('Capacidade: migration e RLS em Postgres descartável',()=>{
  beforeAll(()=>{
    sql(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role; CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; GRANT USAGE ON SCHEMA auth TO authenticated;
    CREATE TABLE public.user_roles(user_id uuid,role text); INSERT INTO public.user_roles VALUES('${admin}','admin');
    CREATE FUNCTION public.has_role(u uuid,r text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id=u AND role=r) $$;
    CREATE TABLE public.tipicos(id uuid PRIMARY KEY,tipo text); GRANT SELECT ON public.tipicos TO authenticated;
    CREATE TABLE public.organizacoes(id uuid PRIMARY KEY); INSERT INTO public.organizacoes VALUES('${org}');GRANT SELECT ON public.organizacoes TO authenticated;
    CREATE TABLE public.oportunidades(id uuid PRIMARY KEY,organizacao_id uuid);INSERT INTO public.oportunidades VALUES('${deal}','${org}');GRANT SELECT ON public.oportunidades TO authenticated;ALTER TABLE public.oportunidades ENABLE ROW LEVEL SECURITY;
    CREATE POLICY deal_acesso ON public.oportunidades FOR SELECT TO authenticated USING(auth.uid() IN('${owner}'::uuid,'${shared}'::uuid,'${admin}'::uuid));
    CREATE TABLE public.audit_log(id uuid,registro_id uuid,acao text);
    CREATE FUNCTION public.fn_audit_trigger() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN INSERT INTO audit_log VALUES(gen_random_uuid(),COALESCE(NEW.id,OLD.id),TG_OP);RETURN COALESCE(NEW,OLD);END $$;
    CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN NEW.updated_at=now();RETURN NEW;END $$;`);
    for(const prefix of ['20261025035406',CRESCIMENTO]){const file=readdirSync('supabase/migrations').find(f=>f.startsWith(prefix));
    if(!file)throw new Error('Migration não localizada');
    const migration=readFileSync(`supabase/migrations/${file}`,'utf8');sql(migration);sql(migration);}
  });
  it('seed idempotente preserva cinco modelos e o Duo de 570 kg',()=>{expect(sql("SELECT count(*),max(kg_batelada) FROM capacidade_modelos")).toContain('5|570');});
  it('padrões são 43 s, 20 h, perdas 2/4 h, 15%, soja 40; milho/trigo nulos',()=>{expect(sql('SELECT tempo_receita_padrao_s,horas_trabalhadas_padrao,horas_perdidas_padrao,horas_perdidas_lotes_desorganizados,folga_minima,peso_soja,peso_milho IS NULL,peso_trigo IS NULL FROM capacidade_parametros')).toContain('43|20|2|4|0.15|40|t|t');});
  it('autenticado lê todos modelos',()=>{expect(sql(`BEGIN;${actor(other)} SELECT count(*) FROM capacidade_modelos;ROLLBACK;`)).toContain('\n5\n');});
  it('não-admin não escreve modelos',()=>{rejected(`${actor(owner)}INSERT INTO capacidade_modelos(modelo,kg_batelada)VALUES('TESTE',1);`,'row-level security');});
  it('admin pode ajustar modelo e parâmetros',()=>{expect(sql(`BEGIN;${actor(admin)}UPDATE capacidade_modelos SET kg_batelada=151 WHERE modelo='LSB150';UPDATE capacidade_parametros SET peso_milho=60;SELECT kg_batelada FROM capacidade_modelos WHERE modelo='LSB150';ROLLBACK;`)).toContain('\n151\n');});
  it('responsável padrão vem da sessão e grava auditoria',()=>{expect(sql(`BEGIN;${actor(owner)}${insert()}SELECT responsavel_id FROM diagnosticos_tecnicos;RESET ROLE;SELECT acao FROM audit_log WHERE registro_id='${diag}';ROLLBACK;`)).toContain(`${owner}\nRESET\nINSERT`);});
  it('acesso ao deal permite ver e editar diagnóstico',()=>{expect(sql(`BEGIN;${actor(owner)}${insert()}RESET ROLE;${actor(shared)}UPDATE diagnosticos_tecnicos SET observacoes='revisado';SELECT observacoes FROM diagnosticos_tecnicos;ROLLBACK;`)).toContain('\nrevisado\n');});
  it('usuário sem acesso não vê diagnóstico de outro',()=>{expect(sql(`BEGIN;${actor(owner)}${insert()}RESET ROLE;${actor(other)}SELECT count(*) FROM diagnosticos_tecnicos;ROLLBACK;`)).toContain('\n0\n');});
  it('admin vê diagnóstico sem deal',()=>{expect(sql(`BEGIN;${actor(owner)}${insert(false)}RESET ROLE;${actor(admin)}SELECT count(*) FROM diagnosticos_tecnicos;ROLLBACK;`)).toContain('\n1\n');});
  it('não-admin não transfere responsável',()=>{rejected(`${actor(owner)}${insert()}UPDATE diagnosticos_tecnicos SET responsavel_id='${other}';`,'Somente admin');});
  it('diagnóstico não pode ter zero horas efetivas',()=>{rejected(`${actor(owner)}${insert()}UPDATE diagnosticos_tecnicos SET horas_perdidas_dia=20;`,'Diagnóstico inválido');});
  it('não permite típico de aluguel',()=>{rejected(`INSERT INTO tipicos VALUES('40000000-0000-0000-0000-000000000001','aluguel');${actor(admin)}UPDATE capacidade_modelos SET tipico_id='40000000-0000-0000-0000-000000000001' WHERE modelo='LSB150';`,'Típico do tipo orçamento');});
  it('crescimento: rejeita horizonte 0 e 16, 250% e meta 0',()=>{
    rejected(`${actor(owner)}${insert()}UPDATE diagnosticos_tecnicos SET crescimento_modo='percentual',crescimento_anual_pct=10,horizonte_anos=0;`,'horizonte');
    rejected(`${actor(owner)}${insert()}UPDATE diagnosticos_tecnicos SET crescimento_modo='percentual',crescimento_anual_pct=10,horizonte_anos=16;`,'horizonte');
    rejected(`${actor(owner)}${insert()}UPDATE diagnosticos_tecnicos SET crescimento_modo='percentual',crescimento_anual_pct=250,horizonte_anos=5;`,'percentual');
    rejected(`${actor(owner)}${insert()}UPDATE diagnosticos_tecnicos SET crescimento_modo='meta',meta_sacos=0,horizonte_anos=5;`,'meta');
    rejected(`${actor(admin)}UPDATE capacidade_parametros SET horizonte_padrao_anos=16;`,'crescimento');
  });
  it('crescimento válido e modo nulo são aceitos',()=>{expect(sql(`BEGIN;${actor(owner)}${insert()}UPDATE diagnosticos_tecnicos SET crescimento_modo='meta',meta_sacos=300000,horizonte_anos=5;UPDATE diagnosticos_tecnicos SET crescimento_modo=NULL,horizonte_anos=0;SELECT 'ok';ROLLBACK;`)).toContain('ok');});
});
