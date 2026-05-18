# Layouts: um card por proposta/orçamento

## Problema

Hoje a página `/layouts` mostra apenas layouts já criados manualmente (3 cards). O esperado é: **cada proposta e cada orçamento da empresa deve aparecer como um card automaticamente**, mesmo que ainda não tenha layout desenhado. Assim, o time vê de uma só vez "para quais clientes ainda falta fazer o layout".

## Como vai funcionar

A lista de cards passa a ser a **união de todas as propostas + todos os orçamentos** visíveis ao usuário, ordenados do mais recente para o mais antigo. Para cada origem:

- Se **já existe** um layout vinculado (`layouts.origem_tipo + origem_id`), o card mostra o status do layout (Rascunho / Aprovado / Arquivado), as dimensões do piso e a data de atualização. Clicar abre `/layouts/{id}`.
- Se **ainda não existe** layout, o card mostra um selo "Sem layout" em cinza e um botão "Criar layout". Clicar cria o layout sob demanda (mesma lógica do modal atual: posiciona os equipamentos em fila a partir dos itens da origem) e abre o editor.

O cabeçalho de cada card mostra: ícone (Proposta/Orçamento), número (ex: `ORC2026-007` ou `SC2026-014`), nome do cliente.

## Filtros simples no topo

- Campo de busca por cliente ou número.
- Toggles rápidos: **Todos | Sem layout | Com layout**.
- Toggle de tipo: **Todos | Propostas | Orçamentos**.

## O que acontece com o botão "Novo Layout"

Vira **opcional**, mas é mantido para casos em que o usuário quer escolher dimensões customizadas do piso antes de criar. O fluxo padrão passa a ser "clicar no card da origem".

## Detalhes técnicos

- Em `src/pages/Layouts.tsx`, substituir `listLayouts()` por:
  1. `select` em `propostas` (id, numero_proposta, nome_cliente, itens_projeto, created_at).
  2. `select` em `orcamentos` (id, numero_orcamento, nome_cliente, itens, created_at).
  3. `select` em `layouts` com filtro `origem_id in (...)` para os ids acima.
  4. Merge em memória: cada origem vira um item com `layout?: LayoutRow`.
- Reutilizar a função de criação de layout do modal atual (extrair `criarLayoutDeOrigem(origem, larguraMm, comprimentoMm)` para um helper em `src/lib/layouts.ts`) e usar dimensões default (20m × 15m) quando criada pelo card.
- Cards sem layout ficam com aspecto cinza/dashed, sem mini-thumbnail. Cards com layout mantêm o visual atual.

## Fora de escopo

- Não mexer no editor de layout em si.
- Não alterar regras de RLS — confiar nas policies existentes de `propostas`, `orcamentos` e `layouts`.
- Não mostrar propostas/orçamentos arquivados (filtrar por status visível padrão posteriormente, se necessário).
