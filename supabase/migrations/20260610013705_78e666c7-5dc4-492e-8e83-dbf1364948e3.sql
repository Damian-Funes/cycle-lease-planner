create or replace function public.pode_ver_dossie(_user_id uuid, _dossie_estado_sigla text, _dossie_responsavel_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    has_any_role(_user_id, array['admin'::app_role, 'gerente_comercial'::app_role, 'marketing'::app_role, 'viewer'::app_role, 'financeiro'::app_role, 'engenharia'::app_role, 'operacao'::app_role])
    or (
      has_any_role(_user_id, array['comercial'::app_role, 'rtv'::app_role])
      and coalesce(_dossie_responsavel_id = _user_id, false)
    )
    or (
      has_any_role(_user_id, array['comercial'::app_role, 'rtv'::app_role])
      and _dossie_estado_sigla is not null
      and user_cobre_estado(_user_id, (select e.id from public.estados e where e.sigla = _dossie_estado_sigla))
    ),
    false
  )
$$;

do $$
declare p record;
begin
  for p in
    select tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename in ('dossies_sementeiras','dossie_contatos','dossie_equipamentos','dossie_interacoes','dossie_midias')
      and cmd = 'SELECT'
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

create policy "Ver dossiês"
on public.dossies_sementeiras for select to authenticated
using ( is_approved(auth.uid()) and pode_ver_dossie(auth.uid(), estado, responsavel_id) );

create policy "Ver contatos de dossiês"
on public.dossie_contatos for select to authenticated
using ( exists (
  select 1 from public.dossies_sementeiras d
  where d.id = dossie_contatos.dossie_id
    and is_approved(auth.uid()) and pode_ver_dossie(auth.uid(), d.estado, d.responsavel_id)
));

create policy "Ver equipamentos de dossiês"
on public.dossie_equipamentos for select to authenticated
using ( exists (
  select 1 from public.dossies_sementeiras d
  where d.id = dossie_equipamentos.dossie_id
    and is_approved(auth.uid()) and pode_ver_dossie(auth.uid(), d.estado, d.responsavel_id)
));

create policy "Ver interações de dossiês"
on public.dossie_interacoes for select to authenticated
using ( exists (
  select 1 from public.dossies_sementeiras d
  where d.id = dossie_interacoes.dossie_id
    and is_approved(auth.uid()) and pode_ver_dossie(auth.uid(), d.estado, d.responsavel_id)
));

create policy "Ver mídias de dossiês"
on public.dossie_midias for select to authenticated
using ( exists (
  select 1 from public.dossies_sementeiras d
  where d.id = dossie_midias.dossie_id
    and is_approved(auth.uid()) and pode_ver_dossie(auth.uid(), d.estado, d.responsavel_id)
));