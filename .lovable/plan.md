# Comissão sobre o custo, calculada no banco

## Conferência feita (dados reais, São Francisco / Murilo)
Custo atual × quantidade × 4%, última versão de cada orçamento: 064-V7 58.294,51 · 065-V3 84.866,16 · 066 2.354,42 · 072 73.081,73 · 073 63.913,54. Bate exatamente com o esperado. Todos os itens têm `equipamento_id` e custo.

## Antes / depois
| | Antes | Depois |
|---|---|---|
| Base | venda (subtotal − desconto) | soma de quantidade × custo atual dos itens |
| Desconto | reduzia a comissão | não altera |
| Quem calcula | navegador | função no banco; o navegador só recebe a comissão pronta |
| Em jogo | soma de todos os abertos pela venda | soma de todos os abertos pelo custo, 1 por orçamento (última versão de cada número, como já é) |
| Item sem custo | — | conta 0; admin/gerente vê "X itens sem custo" |

Percentuais iguais: 4% padrão, 5% com a tag `cliente_antigo`, seminovo 2% desligado.

## SQL proposto (`docs/sql/comissao-custo-proposta.sql`, aplicar só depois do OK do CEO)
```sql
create or replace function public.fn_comissao_orcamentos()
returns table (orcamento_id uuid, numero_orcamento text, nome_cliente text,
  organizacao_id uuid, responsavel_id uuid, status text, updated_at timestamptz,
  cliente_antigo boolean, taxa numeric, comissao numeric, itens_sem_custo int)
language sql stable security definer set search_path = public as $$
  with eu as (select auth.uid() uid,
     public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'gerente_comercial') gestor)
  select o.id, o.numero_orcamento, o.nome_cliente, o.organizacao_id, o.responsavel_id,
         o.status, o.updated_at,
         coalesce('cliente_antigo' = any(org.tags), false),
         case when 'cliente_antigo' = any(org.tags) then 0.05 else 0.04 end,
         round(coalesce(c.custo,0) * case when 'cliente_antigo' = any(org.tags) then 0.05 else 0.04 end, 2),
         case when (select gestor from eu) then coalesce(c.sem_custo,0) else 0 end
  from orcamentos o
  cross join eu
  left join organizacoes org on org.id = o.organizacao_id
  left join lateral (
    select sum(coalesce(public.fn_num_seguro(i->>'quantidade'),0) * coalesce(e.valor_custo,0)) custo,
           count(*) filter (where e.valor_custo is null or e.valor_custo <= 0)::int sem_custo
    from jsonb_array_elements(coalesce(o.itens,'[]'::jsonb)) i
    left join equipamentos e on e.id = public.fn_uuid_seguro(i->>'equipamento_id')
  ) c on true
  where eu.uid is not null
    and o.status in ('rascunho','enviado','aprovado')
    and (eu.gestor or o.responsavel_id = eu.uid);
$$;
revoke all on function public.fn_comissao_orcamentos() from public, anon;
grant execute on function public.fn_comissao_orcamentos() to authenticated;
```
Obs.: `organizacoes.tags` é `text[]` (conferido no banco), não jsonb; por isso o teste correto é `'cliente_antigo' = any(org.tags)`, como acima. (Confirmo na implementação as assinaturas de `fn_num_seguro`/`fn_uuid_seguro` e os status de "ganho" usados hoje pelo card.) Só devolve a comissão final por orçamento, nunca custo nem item a item. Teste antes em transação revertida com o Murilo (só os dele) e com um admin (todos).

## Mudanças no app (sem SQL extra)
- `src/lib/comissao.ts`: `resumoComissao` passa a receber a comissão pronta; `ultimasVersoes` continua (064-V7 é a única versão do 064 considerada). Sem agrupamento por cliente.
- Testes novos em `comissao.test.ts` com os 5 valores da São Francisco: Em jogo = 282.510,36 (soma dos 5); 5% com tag; desconto não muda nada.
- `ComissaoCard` e o cartão do menu chamam `rpc('fn_comissao_orcamentos')`; mostram "X itens sem custo" só para gestor. Fica um texto curto "comissão sobre o custo dos equipamentos".

## Congelar o custo na aprovação (fica para depois)
Simples: coluna `orcamentos.comissao_congelada numeric` + trigger que grava o valor quando o status vira aprovado/ganho; a função usa `coalesce(comissao_congelada, cálculo atual)`. Já existe `fn_congelar_ao_aprovar` que pode receber isso. Custo de esforço: 1 coluna + ~10 linhas.

## Riscos
- Custo atual muda ⇒ comissão dos abertos (e dos ganhos, até congelar) muda junto.
- "Já garantido no ano" também fica pela base de custo atual até existir o congelamento.
- Opções do mesmo cliente somam juntas no "Em jogo" (decisão do CEO).
- A função é security definer: a regra de quem vê o quê passa a estar nela (testada nos dois papéis).
