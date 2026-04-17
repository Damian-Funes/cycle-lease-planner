

# Comparar planilha com base do Supabase e atualizar valores

## Contexto

- Base atual no Supabase: **115 equipamentos ativos** (ex: códigos 0101, 0102, 0313, 04020001…)
- Planilha enviada: `Cópia_de_equipamentos_rows_rev04.xlsx` (rev04 — sugere quarta revisão de preços)
- O parser de documento não extraiu o conteúdo do .xlsx (só veio o cabeçalho). Preciso ler o arquivo com pandas no modo default para acessar todas as linhas.
- **Bônus**: corrigir o erro de build do `tsconfig.json` (remover `baseUrl`) no mesmo passo.

## Plano de execução (em modo default)

### 1) Corrigir build

Remover `"baseUrl": "."` do `tsconfig.json`. O `paths` continua funcionando (relativo ao próprio tsconfig).

### 2) Ler a planilha

Copiar `user-uploads://Cópia_de_equipamentos_rows_rev04.xlsx` para `/tmp/eq.xlsx` e ler com pandas. Identificar automaticamente as colunas:
- **Código** (codigo / código)
- **Descrição** (descricao / descrição / produto)
- **Valor de custo** (valor_custo / custo / valor)

### 3) Comparar planilha vs Supabase

Para cada código da planilha, classificar em uma de 4 categorias:

| Categoria | O que vou fazer |
|---|---|
| **Alterado** (mesmo código, valor ou descrição diferente) | UPDATE no registro existente |
| **Novo** (código não existe no Supabase) | INSERT como `ativo = true` |
| **Igual** (código existe e valores batem) | nada |
| **Removido** (código existe no Supabase mas não na planilha) | marcar `ativo = false` (não deleto, para preservar histórico em `propostas.itens_projeto`) |

### 4) Pré-confirmação

Antes de aplicar qualquer mudança, vou te mostrar um **resumo**:
- X alterados (com diff de valor: antigo → novo)
- Y novos
- Z desativados
- W inalterados

Se algo parecer estranho (ex: 100 itens "removidos"), eu paro e te aviso antes de tocar no banco.

### 5) Aplicar no Supabase

Executar UPDATEs / INSERTs / desativações via tool de insert do Supabase. Tudo na tabela `equipamentos` — schema não muda.

### 6) Validação final

Mostrar contagem final (`ativos`, `total`) e amostra de 5 itens atualizados para confirmar.

## Observações

- **Propostas antigas ficam intactas**: a coluna `itens_projeto` é JSONB com snapshot dos itens (código/descrição/custo no momento da venda), então atualizar o catálogo não muda propostas já salvas.
- **Sem perda de histórico**: ninguém é deletado — apenas desativado se sumir da planilha.
- Se a planilha tiver colunas extras (categoria, unidade), elas são ignoradas — a tabela só tem `codigo`, `descricao`, `valor_custo`, `ativo`.

