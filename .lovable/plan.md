# Cliente final opcional ("a definir") nos envios para multinacionais

## Antes / depois
| Antes | Depois |
|---|---|
| ORC2026-056 (em nome da CTVA) → enviar para CTVA dá erro e trava | Envia normalmente; o negócio fica com "Cliente final: a definir" e vai para o funil Multinacionais |
| Cliente final obrigatório para tratar legado | Opcional: só é pedido quando aparece (etapa "Cliente final definido" ou envio "venceu") |
| Só admin/gerente define o cliente final | Também o vendedor responsável pelo negócio |
| Comissão de negócio em nome de multinacional podia usar as etiquetas dela | A definir = 4%; definido = regra de cliente antigo do cliente final |
| Fila "Sem cliente final" com botão de ação | Só lista de consulta |

## Como fica
- **"A definir"** = o orçamento continua em nome de uma multinacional. Nada novo para guardar; o `organizacao_id` não é trocado no envio.
- **Enviar para multinacional**: sem campo de cliente final. Funciona para a própria multinacional do orçamento (056 → CTVA gera a V4 enviada à CTVA, tarefa de cobrança, funil Multinacionais) e para outras.
- **Definir cliente final** (botão no bloco Multinacionais do negócio, sempre visível enquanto "a definir"): busca empresas não multinacionais ou "+ cadastrar nova" (nome, cidade, UF). Quando o negócio entra em "Cliente final definido" ou um envio é marcado "venceu", o diálogo abre sozinho como sugestão (pode fechar com "Depois").
- Ao definir: as versões em nome das multinacionais passam ao cliente final, cada multinacional vira envio (se ainda não for), e a etapa atual do funil **não** é alterada.
- **Mostrar** "Cliente final: a definir" no bloco do negócio, no cartão do funil e nas linhas de Comissões.
- **Fila**: aba "Sem cliente final" lista os negócios a definir (com link para o negócio), sem botão de ação.

## SQL proposto (docs/sql/multinacional-cliente-final-opcional.sql — só após OK do CEO)
```sql
-- 1) Envio não exige cliente final: remove a trava "própria multinacional"
create or replace function public.fn_enviar_multinacional(_orcamento_id uuid, _multinacional_id uuid,
  _cobrar_em date default current_date + 60) returns uuid ...
  -- corpo atual, SEM o bloco:
  --   if _multinacional_id = o.organizacao_id then raise exception 'A multinacional não pode ser o próprio cliente final';
  -- (a versão nova mantém o organizacao_id atual: cliente final ou a própria multinacional = "a definir")

-- 2) Definir cliente final: vendedor responsável também; não mexe na etapa se já está no funil
create or replace function public.fn_definir_cliente_final(_oportunidade_id uuid, _cliente_final_id uuid) ...
  if not (has_role(auth.uid(),'admin') or has_role(auth.uid(),'gerente_comercial')
          or exists (select 1 from oportunidades where id=_oportunidade_id and responsavel_id=auth.uid())) then
    raise exception 'Só o vendedor responsável pelo negócio ou um admin pode definir o cliente final';
  end if;
  -- (resto igual) ... e no update de oportunidades:
  update oportunidades set organizacao_id = _cliente_final_id,
    pipeline_anterior_id = case when pipeline_id = v_pipe_multi then pipeline_anterior_id else pipeline_id end,
    etapa_anterior_id    = case when pipeline_id = v_pipe_multi then etapa_anterior_id    else etapa_id end,
    etapa_id    = case when pipeline_id = v_pipe_multi then etapa_id else fn_etapa('Multinacionais','Enviado à multinacional') end,
    pipeline_id = v_pipe_multi,
    multinacional_desde = coalesce(multinacional_desde, now())
  where id = _oportunidade_id;

-- 3) Comissão: a definir = 4%; nova coluna cliente_a_definir (drop + create, mesmas permissões)
drop function public.fn_comissao_orcamentos();
create function public.fn_comissao_orcamentos() returns table(..., cliente_a_definir boolean) ...
  -- cliente_antigo só vale se coalesce(org.segmento,'') <> 'MULTINACIONAIS'
  -- cliente_a_definir = coalesce(org.segmento,'') = 'MULTINACIONAIS'
revoke all on function public.fn_comissao_orcamentos() from public, anon;
grant execute on function public.fn_comissao_orcamentos() to authenticated;
```

## Teste (transação revertida, nada gravado)
ORC2026-056: enviar V3 → CTVA sem erro; V4 criada em nome da CTVA; envio aberto; tarefa; negócio em Multinacionais › Enviado; comissão 4% e "a definir". Repetir CTVA → "já existe envio aberto". Etapa → "Cliente final definido", definir cliente final de teste como vendedor responsável (simulado) → versões passam ao cliente, etapa continua "Cliente final definido", comissão passa a seguir as etiquetas dele; vendedor não responsável é recusado.

## Riscos
- Negócios "a definir" ficam no nome da multinacional: a visibilidade por estado continua a da multinacional (vendedor só vê se for o responsável — regra atual).
- Mudar o retorno da função de comissão exige recriá-la; o app já publicado lê só colunas antigas, então não quebra.
- Vendedor responsável passa a poder mover as versões para o cliente final (mesmo poder que já tem de editar o negócio).

## Detalhes técnicos
- `EnviosMultinacional.tsx`: remove a exigência; adiciona "Cliente final: a definir" + diálogo `DefinirClienteFinal` (busca/cadastro), aberto automaticamente na etapa "Cliente final definido" ou após "venceu".
- `ComissaoCard`, `Crm.tsx` (cartão): rótulo "a definir"; `Multinacionais.tsx`: fila só leitura, reaproveitando o diálogo a partir do negócio.
- `src/lib/multinacional.ts`: `clienteADefinir(segmento)` e `deveSugerirClienteFinal(etapa, situacoes)`, com testes; `src/lib/comissao.ts`: regra 4% para "a definir", com teste.

## Resultado do teste já feito (revertido, nada gravado)
- 056 → CTVA sem erro: V4 enviada em nome da CTVA, funil Multinacionais › Enviado, 1 tarefa de cobrança.
- Comissão "a definir" 4% (056/V2 R$ 52.996,91; V3/V4 R$ 61.558,25); repetir CTVA recusado.
- Definir cliente final na etapa "Cliente final definido": 4 versões passam ao cliente, etapa mantida, envio CTVA registrado, deixa de ser "a definir".
- Vendedor não responsável recusado. SQL completo em docs/sql/multinacional-cliente-final-opcional.sql; aguardando OK do CEO para aplicar.
