-- APLICADA em 12/11/2026.
-- Comissão sobre o CUSTO (aprovada pelo CEO em 12/11/2026).
-- Devolve por orçamento só a comissão pronta (nunca custo nem item a item).
-- Vendedor: só os dele. Admin/gerente_comercial: todos.
-- Item sem equipamento_id válido (ex.: "avulso-…") ou sem custo conta 0 e entra em itens_sem_custo (só gestor vê).
-- organizacoes.tags é text[]: teste com = any().
create or replace function public.fn_comissao_orcamentos()
returns table (orcamento_id uuid, numero_orcamento text, nome_cliente text,
  organizacao_id uuid, responsavel_id uuid, status text, updated_at timestamptz,
  venda numeric, cliente_antigo boolean, comissao numeric, itens_sem_custo int)
language sql stable security definer set search_path = public as $$
  with eu as (
    select auth.uid() uid,
      coalesce(public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'gerente_comercial'), false) gestor)
  select o.id, o.numero_orcamento, o.nome_cliente, o.organizacao_id, o.responsavel_id,
         o.status, o.updated_at,
         greatest(0, coalesce(o.subtotal,0) - case when o.desconto_tipo = 'valor' then coalesce(o.desconto_valor,0)
                   else coalesce(o.subtotal,0) * coalesce(o.desconto_valor,0) / 100 end),
         coalesce('cliente_antigo' = any(org.tags), false),
         round(coalesce(c.custo,0) * case when 'cliente_antigo' = any(org.tags) then 0.05 else 0.04 end, 2),
         case when eu.gestor then coalesce(c.sem_custo,0) else 0 end
  from public.orcamentos o
  cross join eu
  left join public.organizacoes org on org.id = o.organizacao_id
  left join lateral (
    select sum(coalesce(public.fn_num_seguro(i->>'quantidade'),0) * coalesce(e.valor_custo,0)) custo,
           count(*) filter (where e.valor_custo is null or e.valor_custo <= 0)::int sem_custo
    from jsonb_array_elements(case when jsonb_typeof(o.itens) = 'array' then o.itens else '[]'::jsonb end) i
    left join public.equipamentos e on e.id = public.fn_uuid_seguro(i->>'equipamento_id')
  ) c on true
  where eu.uid is not null
    and o.status in ('rascunho','enviado','aprovado')
    and (eu.gestor or o.responsavel_id = eu.uid);
$$;
revoke all on function public.fn_comissao_orcamentos() from public, anon;
grant execute on function public.fn_comissao_orcamentos() to authenticated;
