-- PROPOSTA (não aplicada). Cliente final opcional ("a definir") nos envios para multinacionais.
-- Aplicar só após OK do CEO.

-- 1) Envio não exige cliente final (sem a trava "própria multinacional")
create or replace function public.fn_enviar_multinacional(_orcamento_id uuid, _multinacional_id uuid, _cobrar_em date default (current_date + 60))
returns uuid language plpgsql set search_path to 'public' as $function$
declare
  o orcamentos%rowtype; v_base text; v_prox int; v_nova uuid; v_envio uuid;
  v_multi text; v_ativ uuid; op oportunidades%rowtype;
begin
  select * into o from orcamentos where id = _orcamento_id;
  if not found then raise exception 'Orçamento não encontrado ou sem permissão'; end if;
  select m.nome into v_multi from fn_multinacionais() m where m.id = _multinacional_id;
  if v_multi is null then raise exception 'Multinacional não encontrada'; end if;
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
end $function$;

-- 2) Definir cliente final: também o vendedor responsável; mantém a etapa se já está no funil
create or replace function public.fn_definir_cliente_final(_oportunidade_id uuid, _cliente_final_id uuid)
returns integer language plpgsql security definer set search_path to 'public' as $function$
declare v_cli organizacoes%rowtype; n int := 0; r record;
  v_pipe uuid := (select id from pipelines where nome = 'Multinacionais');
begin
  if not (has_role(auth.uid(),'admin') or has_role(auth.uid(),'gerente_comercial')
          or exists (select 1 from oportunidades where id = _oportunidade_id and responsavel_id = auth.uid())) then
    raise exception 'Só o vendedor responsável pelo negócio ou um admin pode definir o cliente final';
  end if;
  select * into v_cli from organizacoes where id = _cliente_final_id;
  if not found or coalesce(v_cli.segmento,'') = 'MULTINACIONAIS' then
    raise exception 'Escolha uma empresa que não seja multinacional';
  end if;

  for r in
    select distinct on (o.organizacao_id) o.id, o.organizacao_id, fn_numero_base(o.numero_orcamento) base
    from orcamentos o join organizacoes g on g.id = o.organizacao_id
    where o.oportunidade_id = _oportunidade_id and g.segmento = 'MULTINACIONAIS'
    order by o.organizacao_id, o.created_at desc
  loop
    insert into orcamento_envios (oportunidade_id, orcamento_id, numero_base, multinacional_id, enviado_em)
    select _oportunidade_id, r.id, r.base, r.organizacao_id, (select created_at from orcamentos where id = r.id)
    where not exists (select 1 from orcamento_envios where oportunidade_id = _oportunidade_id
                      and multinacional_id = r.organizacao_id);
    n := n + 1;
  end loop;

  update orcamentos o set organizacao_id = _cliente_final_id, nome_cliente = v_cli.nome
  from organizacoes g
  where g.id = o.organizacao_id and o.oportunidade_id = _oportunidade_id and g.segmento = 'MULTINACIONAIS';

  update oportunidades set organizacao_id = _cliente_final_id,
    pipeline_anterior_id = case when pipeline_id = v_pipe then pipeline_anterior_id else pipeline_id end,
    etapa_anterior_id    = case when pipeline_id = v_pipe then etapa_anterior_id else etapa_id end,
    etapa_id    = case when pipeline_id = v_pipe then etapa_id else fn_etapa('Multinacionais','Enviado à multinacional') end,
    pipeline_id = v_pipe,
    multinacional_desde = coalesce(multinacional_desde, now())
  where id = _oportunidade_id and n > 0;
  return n;
end $function$;

-- 3) Comissão: "a definir" = 4%, com coluna cliente_a_definir
drop function public.fn_comissao_orcamentos();
create function public.fn_comissao_orcamentos()
returns table(orcamento_id uuid, numero_orcamento text, nome_cliente text, organizacao_id uuid, responsavel_id uuid,
  status text, updated_at timestamptz, venda numeric, cliente_antigo boolean, comissao numeric,
  itens_sem_custo integer, cliente_a_definir boolean)
language sql stable security definer set search_path to 'public' as $function$
  with eu as (
    select auth.uid() uid,
      coalesce(public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'gerente_comercial'), false) gestor)
  select o.id, o.numero_orcamento, o.nome_cliente, o.organizacao_id, o.responsavel_id,
         o.status, o.updated_at,
         greatest(0, coalesce(o.subtotal,0) - case when o.desconto_tipo = 'valor' then coalesce(o.desconto_valor,0)
                   else coalesce(o.subtotal,0) * coalesce(o.desconto_valor,0) / 100 end),
         x.antigo,
         round(coalesce(c.custo,0) * case when x.antigo then 0.05 else 0.04 end, 2),
         case when eu.gestor then coalesce(c.sem_custo,0) else 0 end,
         x.a_definir
  from public.orcamentos o
  cross join eu
  left join public.organizacoes org on org.id = o.organizacao_id
  cross join lateral (select coalesce(org.segmento,'') = 'MULTINACIONAIS' a_definir,
      coalesce(org.segmento,'') <> 'MULTINACIONAIS' and coalesce('cliente_antigo' = any(org.tags), false) antigo) x
  left join lateral (
    select sum(coalesce(public.fn_num_seguro(i->>'quantidade'),0) * coalesce(e.valor_custo,0)) custo,
           count(*) filter (where e.valor_custo is null or e.valor_custo <= 0)::int sem_custo
    from jsonb_array_elements(case when jsonb_typeof(o.itens) = 'array' then o.itens else '[]'::jsonb end) i
    left join public.equipamentos e on e.id = public.fn_uuid_seguro(i->>'equipamento_id')
  ) c on true
  where eu.uid is not null
    and o.status in ('rascunho','enviado','aprovado')
    and (eu.gestor or o.responsavel_id = eu.uid);
$function$;
revoke all on function public.fn_comissao_orcamentos() from public, anon;
grant execute on function public.fn_comissao_orcamentos() to authenticated;
