# Enviar para multinacional quando o orçamento está em nome dela (caso ORC2026-056)

## Antes / depois
| Antes | Depois |
|---|---|
| Negócio em nome da CTVA → "Enviar para CTVA" dá erro técnico e trava | O diálogo pede primeiro o "Cliente final (quem vai usar a máquina)" e faz tudo numa ação |
| Só admin/gerente define o cliente final (pela fila) | Também o vendedor responsável pelo negócio; admin continua em qualquer um |
| Mensagens técnicas do banco | Mensagens amigáveis em português |

## Diálogo "Enviar para multinacional" (negócio em nome de multinacional)
1. Texto de ajuda: "Este orçamento está em nome da CTVA. Informe para qual cliente final é o projeto. Se a própria CTVA é quem vai comprar e usar a máquina, feche este diálogo — não é envio para multinacional." (nome da multinacional dinâmico).
2. Campo obrigatório "Cliente final (quem vai usar a máquina)": busca só empresas não multinacionais + "+ cadastrar nova" (nome, cidade, UF). A nova empresa é cadastrada pela regra normal (admin fica sem responsável, como sempre).
3. Depois: multinacional (pré-selecionada com a do orçamento), versão e data de cobrança (+60).
4. "Enviar" chama uma única função no banco. Negócios normais continuam com o diálogo atual, sem mudança.

## O que acontece ao enviar
- Todas as versões do negócio em nome de multinacionais passam para o cliente final (mesma lógica de hoje da fila).
- Cada multinacional antiga vira um envio (como já faz a fila).
- Se a multinacional escolhida é a mesma do orçamento (056 → CTVA): não cria versão nova (o PDF já foi para ela); só grava a data de cobrança nesse envio e cria a tarefa "Cobrar retorno da CTVA sobre ORC2026-056".
- Se for outra (ex.: BASF): cria a nova versão e o envio normal, como hoje.
- Negócio vai para Multinacionais › Enviado à multinacional. Comissão segue o cliente final.

## Mensagens amigáveis
- Sem cliente final: "Informe o cliente final (quem vai usar a máquina)."
- Já enviado: "Este orçamento já está com a <multi> aguardando retorno."
- Sem permissão: "Só o vendedor responsável por este negócio ou um admin pode fazer isso."
- Cliente final inválido: "Escolha uma empresa que não seja multinacional."
- Outros erros: "Não foi possível enviar agora. Tente de novo." (detalhe técnico só no console).

## Teste (transação revertida, depois do OK)
ORC2026-056 (responsável é admin): cliente final de teste + CTVA → versões movidas, 1 envio CTVA com data e tarefa, sem versão nova; repetir com BASF → nova versão; vendedor não responsável recusado; vendedor responsável aceito (simulado). Nada fica gravado.

## SQL proposto (docs/sql/multinacional-cliente-final-vendedor.sql, aplicar só após OK)
```sql
-- 1) Permissão: admin, gerente ou responsável pelo negócio
create or replace function public.fn_definir_cliente_final(_oportunidade_id uuid, _cliente_final_id uuid)
returns integer ... -- corpo igual ao atual, trocando a checagem por:
  if not (has_role(auth.uid(),'admin') or has_role(auth.uid(),'gerente_comercial')
          or exists (select 1 from oportunidades where id = _oportunidade_id and responsavel_id = auth.uid())) then
    raise exception 'SEM_PERMISSAO';
  end if;
  -- e 'Cliente final inválido' passa a 'CLIENTE_FINAL_INVALIDO'

-- 2) Ação única
create or replace function public.fn_enviar_multinacional_com_cliente_final(
  _orcamento_id uuid, _cliente_final_id uuid, _multinacional_id uuid, _cobrar_em date default current_date + 60)
returns uuid language plpgsql security invoker set search_path = public as $$
declare o orcamentos%rowtype; v_env orcamento_envios%rowtype; v_multi text; v_ativ uuid;
begin
  select * into o from orcamentos where id = _orcamento_id;
  if not found or o.oportunidade_id is null then raise exception 'SEM_NEGOCIO'; end if;
  perform fn_definir_cliente_final(o.oportunidade_id, _cliente_final_id);
  select * into v_env from orcamento_envios
   where oportunidade_id = o.oportunidade_id and multinacional_id = _multinacional_id
     and situacao in ('enviado','negociando');
  if found then                      -- mesma multinacional do legado: sem versão nova
    select nome into v_multi from fn_multinacionais() where id = _multinacional_id;
    insert into atividades (tipo, tipo_id, titulo, descricao, data_atividade, data_inicio,
      responsavel_id, organizacao_id, oportunidade_id, concluida, evento_automatico)
    values ('tarefa', (select id from tipos_atividade where nome='Tarefa' limit 1),
      'Cobrar retorno da '||v_multi||' sobre '||v_env.numero_base, 'Orçamento enviado à '||v_multi,
      (_cobrar_em + time '09:00') at time zone 'America/Sao_Paulo',
      (_cobrar_em + time '09:00') at time zone 'America/Sao_Paulo',
      coalesce(o.responsavel_id, auth.uid()), _cliente_final_id, o.oportunidade_id, false, false)
    returning id into v_ativ;
    update orcamento_envios set cobrar_em = _cobrar_em, atividade_id = v_ativ where id = v_env.id;
    return v_env.id;
  end if;
  return fn_enviar_multinacional(_orcamento_id, _multinacional_id, _cobrar_em);
end $$;
revoke all on function public.fn_enviar_multinacional_com_cliente_final(uuid,uuid,uuid,date) from public, anon;
grant execute on function public.fn_enviar_multinacional_com_cliente_final(uuid,uuid,uuid,date) to authenticated;
```
O erro "A multinacional não pode ser o próprio cliente final" continua no banco como proteção; a tela passa a evitá-lo.

## Riscos
- Vendedor responsável agora pode mover TODAS as versões do negócio para o cliente final — é o mesmo que ele já pode ao editar o negócio.
- A busca de empresas segue a visibilidade por estado: se o cliente final for de outro estado e o vendedor não o vê, ele cadastra outro (duplicata). Mitigação: aviso "verifique se já existe" ao cadastrar.
- Execução da função de definir passa a aceitar vendedor; testado que vendedor de outro negócio é recusado.

## Detalhes técnicos
- `EnviosMultinacional.tsx`: detectar segmento MULTINACIONAIS da organização do negócio; novo bloco de cliente final (busca + cadastro inline); mapear códigos de erro em `src/lib/multinacional.ts` (`mensagemErroEnvio`, com teste).
- Fila "Sem cliente final" passa a usar os mesmos textos amigáveis.
