# Multinacionais compartilhadas (sem duplicar)

Nada será aplicado sem o OK do CEO. Depois de aprovado, gravo o SQL abaixo em `docs/sql/multinacionais-compartilhadas-proposta.sql`, testo numa transação desfeita e espero o OK para aplicar.

## Como está hoje (conferido no banco)
- **Ver empresas:** só aparecem as da região do vendedor ou as que estão no nome dele. Por isso o Renan não vê a BASF do Murilo e cadastra outra.
- **Ver contatos:** seguem a mesma regra. Mesmo que o vendedor veja a multinacional, hoje ele **não veria os contatos** dela.
- **Orçamentos e negócios:** as regras de criar, editar e ver já excluem MULTINACIONAIS da visibilidade por região. Só o responsável ou o admin enxerga. **Essas regras não serão alteradas.**
- **Ligações com outras tabelas:** 15 tabelas apontam para a empresa. Entre elas: orçamentos, negócios, envios, contatos, atividades, paradas de viagem, diário, levantamentos, propostas, layouts, diagnósticos, dossiês, ligações e leads.

## Depois
1. **Todo usuário aprovado vê as multinacionais**, em qualquer região. Editar continua restrito a admin, gerente e responsável.
2. **Todo usuário aprovado vê os contatos das multinacionais.** Assim o vendedor consegue usá-los no orçamento.
3. **Orçamentos e negócios da BASF continuam privados.** Os do Renan ficam só com o Renan, e o mesmo vale para o Flávio e o Murilo.
4. **Aviso de empresa que já existe:** no cadastro de empresa, antes de salvar, a tela procura pelo começo do CNPJ (8 dígitos) e por nome parecido em **todas** as empresas.
   - Se encontrar uma multinacional, mostra "Já existe: X — use a existente" e não deixa salvar.
   - Se for uma empresa comum, só avisa e deixa salvar.
   - O banco também recusa multinacional duplicada, mesmo vinda de importação.
5. **Juntar duplicadas:** fica pronta uma função só para admin que junta duas empresas, mas **não será rodada em nenhuma empresa**. O CEO escolhe depois quais juntar, por exemplo BASF com BASF AGRICULTURAL e Syngenta com SYNGENTA PROTEÇÃO.

## Telas
- `OrganizacaoFormModal`: chamar `fn_organizacoes_parecidas` com debounce, ao digitar o nome ou o CNPJ e de novo antes de salvar. Mostrar a lista com botão "Usar esta". Se houver multinacional, bloquear o salvar e mostrar mensagem amigável para o erro do banco.
- `DefinirClienteFinal` e `ImportarOrganizacoesCsvModal`: mostrar a mesma mensagem amigável quando o banco recusar uma multinacional duplicada.

## SQL proposto
```sql
-- 1) Ver organizações: multinacionais visíveis a todos os aprovados
drop policy "Ver organizações" on public.organizacoes;
create policy "Ver organizações" on public.organizacoes for select to authenticated
using (is_approved(auth.uid()) and (
  pode_ver_organizacao(auth.uid(), estado_id, responsavel_id)
  or coalesce(segmento,'') = 'MULTINACIONAIS'));

-- 2) Ver pessoas: contatos de multinacional visíveis a todos os aprovados
drop policy "Ver pessoas" on public.pessoas;
create policy "Ver pessoas" on public.pessoas for select to authenticated
using (is_approved(auth.uid()) and (
  has_any_role(auth.uid(), array['admin','marketing','gerente_comercial','viewer',
    'engenharia','financeiro','operacao']::app_role[])
  or (organizacao_id is null and responsavel_id = auth.uid())
  or exists (select 1 from organizacoes o where o.id = pessoas.organizacao_id
     and (pode_ver_organizacao(auth.uid(), o.estado_id, o.responsavel_id)
          or coalesce(o.segmento,'') = 'MULTINACIONAIS'))));

-- 3) Busca de parecidas (só id, nome, cidade, segmento)
create or replace function public.fn_organizacoes_parecidas(_nome text, _cnpj text, _ignorar uuid default null)
returns table(id uuid, nome text, cidade text, segmento text, motivo text)
language sql stable security definer set search_path = public as $$
  with p as (select nullif(left(regexp_replace(coalesce(_cnpj,''),'\D','','g'),8),'') raiz,
                    fn_nome_normalizado(coalesce(_nome,'')) n)
  select o.id, o.nome, o.cidade, o.segmento,
         case when p.raiz is not null and left(regexp_replace(coalesce(o.cnpj,''),'\D','','g'),8) = p.raiz
              then 'cnpj' else 'nome' end
  from organizacoes o, p
  where is_approved(auth.uid())
    and (_ignorar is null or o.id <> _ignorar)
    and ((p.raiz is not null and length(p.raiz)=8
          and left(regexp_replace(coalesce(o.cnpj,''),'\D','','g'),8) = p.raiz)
      or (length(p.n) >= 4 and (fn_nome_normalizado(o.nome) like p.n || '%'
          or p.n like fn_nome_normalizado(o.nome) || '%'
          or fn_nome_normalizado(coalesce(o.nome_fantasia,'')) = p.n)))
  order by (o.segmento = 'MULTINACIONAIS') desc, o.nome limit 10 $$;
revoke all on function public.fn_organizacoes_parecidas(text,text,uuid) from public, anon;
grant execute on function public.fn_organizacoes_parecidas(text,text,uuid) to authenticated;

-- 4) Banco recusa multinacional duplicada (mesma raiz de CNPJ ou mesmo nome)
create or replace function public.fn_organizacoes_bloquear_mn_duplicada()
returns trigger language plpgsql security definer set search_path = public as $$
declare _raiz text := nullif(left(regexp_replace(coalesce(new.cnpj,''),'\D','','g'),8),'');
        _x text;
begin
  if coalesce(current_setting('app.mesclando_orgs', true),'') = 'on' then return new; end if;
  select o.nome into _x from organizacoes o
   where o.id <> new.id and (o.segmento = 'MULTINACIONAIS' or new.segmento = 'MULTINACIONAIS')
     and ((_raiz is not null and length(_raiz)=8
           and left(regexp_replace(coalesce(o.cnpj,''),'\D','','g'),8) = _raiz)
       or fn_nome_normalizado(o.nome) = fn_nome_normalizado(new.nome))
   limit 1;
  if _x is not null then
    raise exception 'Já existe: % — use a existente', _x using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public.fn_organizacoes_bloquear_mn_duplicada() from public, anon, authenticated;
create trigger trg_organizacoes_mn_duplicada before insert or update of cnpj, nome, segmento
  on public.organizacoes for each row execute function public.fn_organizacoes_bloquear_mn_duplicada();

-- 5) Mesclar (só admin; NÃO executar em dados)
create or replace function public.fn_mesclar_organizacoes(_origem uuid, _destino uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb := '{}'; n int; t text;
begin
  if not has_role(auth.uid(),'admin') then raise exception 'Só admin pode mesclar organizações'; end if;
  if _origem = _destino then raise exception 'Origem e destino são iguais'; end if;
  perform 1 from organizacoes where id in (_origem,_destino) for update;
  if (select count(*) from organizacoes where id in (_origem,_destino)) <> 2 then
    raise exception 'Organização não encontrada'; end if;
  perform set_config('app.mesclando_orgs','on',true);
  foreach t in array array['orcamentos','oportunidades','pessoas','atividades','propostas','layouts',
    'orcamentos_reforma','rota_paradas','rota_diario','ligacoes_bot','diagnosticos_tecnicos',
    'dossies_sementeiras','organizacao_levantamentos','leads_rd'] loop
    execute format('update public.%I set organizacao_id = $1 where organizacao_id = $2', t)
      using _destino, _origem;
    get diagnostics n = row_count; r := r || jsonb_build_object(t, n);
  end loop;
  update orcamento_envios set multinacional_id = _destino where multinacional_id = _origem;
  get diagnostics n = row_count; r := r || jsonb_build_object('orcamento_envios', n);
  update organizacoes set matriz_id = _destino where matriz_id = _origem;
  -- completa no destino o que estiver vazio (cnpj, cidade, estado, segmento, tags)
  update organizacoes d set cnpj = coalesce(d.cnpj, o.cnpj), cidade = coalesce(d.cidade, o.cidade),
    estado_id = coalesce(d.estado_id, o.estado_id), segmento = coalesce(d.segmento, o.segmento),
    tags = (select array(select distinct unnest(coalesce(d.tags,'{}') || coalesce(o.tags,'{}'))))
  from organizacoes o where d.id = _destino and o.id = _origem;
  insert into audit_log(tabela, acao, registro_id, usuario_id, dados_antigos)
  select 'organizacoes','mesclar', _origem, auth.uid(), to_jsonb(o) || jsonb_build_object('destino',_destino)
  from organizacoes o where o.id = _origem;
  delete from organizacoes where id = _origem;
  return r || jsonb_build_object('apagada', _origem, 'destino', _destino);
end $$;
revoke all on function public.fn_mesclar_organizacoes(uuid,uuid) from public, anon;
grant execute on function public.fn_mesclar_organizacoes(uuid,uuid) to authenticated;
```
Antes de gravar o arquivo, confiro no banco os nomes reais das colunas de `audit_log` e `tags`, a assinatura de `fn_nome_normalizado` e os índices únicos de levantamentos e paradas. Se algum for diferente, ajusto o SQL e mostro o que mudou.

## Teste em transação desfeita
- **Como Renan:** vê a BASF AGRICULTURAL e os contatos dela, mas não vê os orçamentos e negócios do Murilo com ela.
- **Cadastro duplicado:** cadastrar "Basf" ou o CNPJ 59844287xxxx é recusado com "Já existe…". Cadastrar uma empresa comum parecida passa.
- **Junção:** juntar "BASF" com "BASF AGRICULTURAL" move tudo e apaga a origem. Depois disso, a comissão e os envios continuam iguais.

## Riscos
- Os contatos das multinacionais ficam visíveis para todos os vendedores. É o que o CEO pediu, mas expõe telefones a quem é de outra região.
- Hoje já existem duplicadas. Enquanto não forem juntadas, editar o nome ou o CNPJ de uma delas será recusado. A trava também pode recusar nomes iguais de empresas legítimas diferentes, mas isso vale só para multinacional.
- Juntar empresas não tem volta: só o registro de auditoria guarda a empresa apagada. Os orçamentos mantêm o nome antigo gravado neles.
- A trigger de responsável e as de completude rodam durante a junção. Isso será coberto no teste.
