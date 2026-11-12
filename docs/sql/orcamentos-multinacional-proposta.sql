-- APLICADA em 12/11/2026 (OK do CEO 12/11 19:03). Orçamentos com multinacionais, vários envios por negócio.
-- Aplicar só após OK explícito do CEO. Testar antes em BEGIN … ROLLBACK (059 e São Francisco).
-- Comissão: fn_comissao_orcamentos NÃO muda. As versões de envio mantêm organizacao_id = cliente final,
-- então "última versão por número + organização" já conta o negócio 1 vez. O "via BASF, CTVA" é lido
-- de orcamento_envios pelo app.

begin;

-- 1) Funil Multinacionais
insert into public.pipelines (nome, descricao, ordem, ativo)
select 'Multinacionais', 'Orçamentos levados por multinacionais ao cliente final',
       (select coalesce(max(ordem),0)+1 from public.pipelines), true
where not exists (select 1 from public.pipelines where nome = 'Multinacionais');

insert into public.etapas_pipeline (pipeline_id, nome, ordem, e_final, e_ganho)
select p.id, e.nome, e.ordem, e.fim, e.ganho
from public.pipelines p
cross join (values ('Enviado à multinacional',1,false,false),('Multinacional negociando',2,false,false),
                   ('Cliente final definido',3,false,false),('Ganho',4,true,true),('Perdido',5,true,false)) e(nome,ordem,fim,ganho)
where p.nome = 'Multinacionais'
  and not exists (select 1 from public.etapas_pipeline x where x.pipeline_id = p.id and x.nome = e.nome);

-- 2) Negócio lembra de onde veio
alter table public.oportunidades
  add column if not exists pipeline_anterior_id uuid references public.pipelines(id),
  add column if not exists etapa_anterior_id uuid references public.etapas_pipeline(id),
  add column if not exists multinacional_desde timestamptz;

-- 3) Envios
create table public.orcamento_envios (
  id uuid primary key default gen_random_uuid(),
  oportunidade_id uuid references public.oportunidades(id) on delete cascade,
  orcamento_id uuid not null references public.orcamentos(id) on delete cascade,
  numero_base text not null,
  multinacional_id uuid not null references public.organizacoes(id),
  enviado_em timestamptz not null default now(),
  cobrar_em date,
  situacao text not null default 'enviado',
  motivo text,
  atividade_id uuid references public.atividades(id) on delete set null,
  criado_por uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index orcamento_envios_aberto_uniq
  on public.orcamento_envios (coalesce(oportunidade_id, orcamento_id), multinacional_id)
  where situacao in ('enviado','negociando');
create index on public.orcamento_envios (oportunidade_id);

grant select, insert, update on public.orcamento_envios to authenticated;
grant all on public.orcamento_envios to service_role;
alter table public.orcamento_envios enable row level security;

-- Vê/edita quem vê/edita o orçamento (RLS de orcamentos é reaplicada no EXISTS)
create policy envios_select on public.orcamento_envios for select to authenticated
  using (exists (select 1 from public.orcamentos o where o.id = orcamento_id));
create policy envios_insert on public.orcamento_envios for insert to authenticated
  with check (public.has_any_role(auth.uid(), array['admin','gerente_comercial','comercial','rtv']::app_role[])
    and exists (select 1 from public.orcamentos o where o.id = orcamento_id));
create policy envios_update on public.orcamento_envios for update to authenticated
  using (public.has_any_role(auth.uid(), array['admin','gerente_comercial','comercial','rtv']::app_role[])
    and exists (select 1 from public.orcamentos o where o.id = orcamento_id));

create or replace function public.fn_envios_validar() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.situacao not in ('enviado','negociando','venceu','perdeu') then
    raise exception 'Situação de envio inválida: %', new.situacao;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger trg_envios_validar before insert or update on public.orcamento_envios
  for each row execute function public.fn_envios_validar();

-- 4) Helpers
create or replace function public.fn_numero_base(_n text) returns text
language sql immutable set search_path = public as $$
  select regexp_replace(coalesce(_n,''), '-V\d+$', '', 'i')
$$;

-- Lista de multinacionais para qualquer vendedor (só id e nome; a RLS de organizacoes
-- esconde as que não são do estado dele).
create or replace function public.fn_multinacionais()
returns table(id uuid, nome text) language sql stable security definer set search_path = public as $$
  select o.id, o.nome from organizacoes o
  where o.segmento = 'MULTINACIONAIS' and is_approved(auth.uid())
  order by o.nome
$$;
revoke execute on function public.fn_multinacionais() from public, anon;
grant execute on function public.fn_multinacionais() to authenticated;

create or replace function public.fn_etapa(_pipeline text, _etapa text) returns uuid
language sql stable set search_path = public as $$
  select e.id from etapas_pipeline e join pipelines p on p.id = e.pipeline_id
  where p.nome = _pipeline and e.nome = _etapa limit 1
$$;

-- 5) Enviar para multinacional (repetível). SECURITY INVOKER: respeita a RLS atual.
create or replace function public.fn_enviar_multinacional(
  _orcamento_id uuid, _multinacional_id uuid, _cobrar_em date default (current_date + 60))
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  o orcamentos%rowtype; v_base text; v_prox int; v_nova uuid; v_envio uuid;
  v_multi text; v_ativ uuid; op oportunidades%rowtype;
begin
  select * into o from orcamentos where id = _orcamento_id;
  if not found then raise exception 'Orçamento não encontrado ou sem permissão'; end if;
  select m.nome into v_multi from fn_multinacionais() m where m.id = _multinacional_id;
  if v_multi is null then raise exception 'Multinacional não encontrada'; end if;
  if _multinacional_id = o.organizacao_id then
    raise exception 'A multinacional não pode ser o próprio cliente final';
  end if;
  v_base := fn_numero_base(o.numero_orcamento);

  if exists (select 1 from orcamento_envios
             where coalesce(oportunidade_id, orcamento_id) = coalesce(o.oportunidade_id, o.id)
               and multinacional_id = _multinacional_id and situacao in ('enviado','negociando')) then
    raise exception 'Já existe envio aberto para %', v_multi;
  end if;

  select coalesce(max(nullif(substring(numero_orcamento from '-V(\d+)$'),'')::int), 1) + 1
    into v_prox from orcamentos where fn_numero_base(numero_orcamento) = v_base;

  insert into orcamentos (numero_orcamento, nome_cliente, contato_nome, cliente_endereco, cliente_telefone,
    cliente_cnpj, cliente_email, itens, subtotal, desconto_tipo, desconto_valor, frete, total,
    condicoes_pagamento, prazo_entrega, validade_dias, local_entrega, observacoes, status,
    organizacao_id, oportunidade_id, responsavel_id, forma_pagamento_id, pessoa_contato_id,
    montagem_numero_colaboradores, montagem_dias, montagem_km_origem_destino, montagem_eh_fazenda,
    montagem_km_hotel_local, montagem_numero_veiculos, montagem_custo_total, montagem_observacoes,
    montagem_preco_total, montagem_margem_aplicada, montagem_tipo)
  select v_base || '-V' || v_prox, nome_cliente, contato_nome, cliente_endereco, cliente_telefone,
    cliente_cnpj, cliente_email, itens, subtotal, desconto_tipo, desconto_valor, frete, total,
    condicoes_pagamento, prazo_entrega, validade_dias, local_entrega, observacoes, 'enviado',
    organizacao_id, oportunidade_id, responsavel_id, forma_pagamento_id, pessoa_contato_id,
    montagem_numero_colaboradores, montagem_dias, montagem_km_origem_destino, montagem_eh_fazenda,
    montagem_km_hotel_local, montagem_numero_veiculos, montagem_custo_total, montagem_observacoes,
    montagem_preco_total, montagem_margem_aplicada, montagem_tipo
  from orcamentos where id = o.id
  returning id into v_nova;

  insert into atividades (tipo, tipo_id, titulo, descricao, data_atividade, data_inicio,
                          responsavel_id, organizacao_id, oportunidade_id, concluida, evento_automatico)
  values ('tarefa', (select id from tipos_atividade where nome = 'Tarefa' limit 1),
          'Cobrar retorno da ' || v_multi || ' sobre ' || v_base,
          'Orçamento enviado à ' || v_multi || ' (versão ' || v_base || '-V' || v_prox || ')',
          (_cobrar_em + time '09:00') at time zone 'America/Sao_Paulo',
          (_cobrar_em + time '09:00') at time zone 'America/Sao_Paulo',
          coalesce(o.responsavel_id, auth.uid()), o.organizacao_id, o.oportunidade_id, false, false)
  returning id into v_ativ;

  insert into orcamento_envios (oportunidade_id, orcamento_id, numero_base, multinacional_id, cobrar_em, atividade_id)
  values (o.oportunidade_id, v_nova, v_base, _multinacional_id, _cobrar_em, v_ativ)
  returning id into v_envio;

  if o.oportunidade_id is not null then
    select * into op from oportunidades where id = o.oportunidade_id;
    if op.pipeline_id is distinct from (select id from pipelines where nome = 'Multinacionais') then
      update oportunidades set
        pipeline_anterior_id = pipeline_id, etapa_anterior_id = etapa_id,
        pipeline_id = (select id from pipelines where nome = 'Multinacionais'),
        etapa_id = fn_etapa('Multinacionais','Enviado à multinacional'),
        multinacional_desde = now(), ultima_atividade_em = now()
      where id = o.oportunidade_id;
    else
      update oportunidades set ultima_atividade_em = now() where id = o.oportunidade_id;
    end if;
  end if;
  return v_envio;
end $$;

-- 6) Mudar situação de um envio. "venceu" fecha os outros e ganha o negócio.
create or replace function public.fn_envio_situacao(_envio_id uuid, _situacao text, _motivo text default null)
returns void language plpgsql security invoker set search_path = public as $$
declare e orcamento_envios%rowtype; v_etapa text;
begin
  select * into e from orcamento_envios where id = _envio_id;
  if not found then raise exception 'Envio não encontrado ou sem permissão'; end if;
  update orcamento_envios set situacao = _situacao, motivo = coalesce(_motivo, motivo) where id = _envio_id;

  if _situacao = 'venceu' then
    update orcamento_envios set situacao = 'perdeu', motivo = 'outra multinacional venceu'
    where coalesce(oportunidade_id, orcamento_id) = coalesce(e.oportunidade_id, e.orcamento_id)
      and id <> _envio_id and situacao in ('enviado','negociando');
  end if;

  if e.oportunidade_id is not null then
    v_etapa := case
      when _situacao = 'venceu' then 'Ganho'
      when not exists (select 1 from orcamento_envios where oportunidade_id = e.oportunidade_id
                       and situacao in ('enviado','negociando','venceu')) then 'Perdido'
      when exists (select 1 from orcamento_envios where oportunidade_id = e.oportunidade_id
                   and situacao = 'negociando') then 'Multinacional negociando'
      else 'Enviado à multinacional' end;
    update oportunidades set etapa_id = fn_etapa('Multinacionais', v_etapa), ultima_atividade_em = now(),
      status = case v_etapa when 'Ganho' then 'ganha' when 'Perdido' then 'perdida' else 'aberta' end,
      data_fechamento_real = case when v_etapa in ('Ganho','Perdido') then current_date else null end,
      motivo_perda = case when v_etapa = 'Perdido' then coalesce(_motivo, 'Multinacionais não fecharam') else motivo_perda end
    where id = e.oportunidade_id
      and pipeline_id = (select id from pipelines where nome = 'Multinacionais');
  end if;
end $$;

-- 7) Voltar para negociação direta
create or replace function public.fn_voltar_negociacao_direta(_oportunidade_id uuid)
returns void language plpgsql security invoker set search_path = public as $$
declare op oportunidades%rowtype;
begin
  select * into op from oportunidades where id = _oportunidade_id;
  if not found then raise exception 'Negócio não encontrado ou sem permissão'; end if;
  update orcamento_envios set situacao = 'perdeu', motivo = 'voltou para negociação direta'
  where oportunidade_id = _oportunidade_id and situacao in ('enviado','negociando');
  update oportunidades set
    pipeline_id = coalesce(op.pipeline_anterior_id, (select id from pipelines where nome = 'Orçamentos')),
    etapa_id = coalesce(op.etapa_anterior_id, fn_etapa('Orçamentos','Negociação')),
    pipeline_anterior_id = null, etapa_anterior_id = null, multinacional_desde = null,
    status = 'aberta', data_fechamento_real = null, ultima_atividade_em = now()
  where id = _oportunidade_id;
end $$;

-- 8) Legados: admin/gerente define o cliente final de um negócio enviado a multinacional.
--    Orçamentos do negócio passam a ser do cliente final; cada multinacional vira um envio
--    apontando para a última versão dela. Nada é apagado.
create or replace function public.fn_definir_cliente_final(_oportunidade_id uuid, _cliente_final_id uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_cli organizacoes%rowtype; n int := 0; r record;
begin
  if not (has_role(auth.uid(),'admin') or has_role(auth.uid(),'gerente_comercial')) then
    raise exception 'Só admin ou gerente define o cliente final';
  end if;
  select * into v_cli from organizacoes where id = _cliente_final_id;
  if not found or coalesce(v_cli.segmento,'') = 'MULTINACIONAIS' then
    raise exception 'Cliente final inválido';
  end if;

  for r in
    select distinct on (o.organizacao_id) o.id, o.organizacao_id, fn_numero_base(o.numero_orcamento) base
    from orcamentos o join organizacoes g on g.id = o.organizacao_id
    where o.oportunidade_id = _oportunidade_id and g.segmento = 'MULTINACIONAIS'
    order by o.organizacao_id, o.created_at desc
  loop
    insert into orcamento_envios (oportunidade_id, orcamento_id, numero_base, multinacional_id, enviado_em)
    select _oportunidade_id, r.id, r.base, r.organizacao_id,
           (select created_at from orcamentos where id = r.id)
    where not exists (select 1 from orcamento_envios where oportunidade_id = _oportunidade_id
                      and multinacional_id = r.organizacao_id);
    n := n + 1;
  end loop;

  update orcamentos o set organizacao_id = _cliente_final_id, nome_cliente = v_cli.nome
  from organizacoes g
  where g.id = o.organizacao_id and o.oportunidade_id = _oportunidade_id and g.segmento = 'MULTINACIONAIS';

  update oportunidades set organizacao_id = _cliente_final_id,
    pipeline_anterior_id = coalesce(pipeline_anterior_id, pipeline_id),
    etapa_anterior_id = coalesce(etapa_anterior_id, etapa_id),
    pipeline_id = (select id from pipelines where nome = 'Multinacionais'),
    etapa_id = fn_etapa('Multinacionais','Enviado à multinacional'),
    multinacional_desde = coalesce(multinacional_desde, now())
  where id = _oportunidade_id and n > 0;
  return n;
end $$;
revoke execute on function public.fn_definir_cliente_final(uuid, uuid) from public, anon;
grant execute on function public.fn_definir_cliente_final(uuid, uuid) to authenticated;

-- 9) Parados (CEO): por envio; o app agrupa por negócio.
create view public.vw_multinacionais_paradas with (security_invoker = true) as
select e.id envio_id, e.oportunidade_id, op.titulo, op.responsavel_id, e.numero_base,
       e.multinacional_id, m.nome multinacional, cf.nome cliente_final, e.situacao, e.cobrar_em,
       op.multinacional_desde,
       (current_date - e.enviado_em::date) dias_desde_envio,
       (current_date - greatest(e.updated_at, coalesce(op.ultima_atividade_em, e.updated_at))::date) dias_parado
from orcamento_envios e
left join public.fn_multinacionais() m on m.id = e.multinacional_id
left join oportunidades op on op.id = e.oportunidade_id
left join organizacoes cf on cf.id = op.organizacao_id
where e.situacao in ('enviado','negociando');
grant select on public.vw_multinacionais_paradas to authenticated;

commit;
