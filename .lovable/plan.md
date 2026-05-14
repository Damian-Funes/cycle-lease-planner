## Problema

Ao clicar em **Salvar** na tela /smartcycle, aparece o toast vermelho "Preencha o nome do cliente" porque o input **Nome do cliente** (no header, ao lado do logo LS) está vazio. O campo "Contato" preenchido em "Dados do Cliente" é separado e não conta como nome do cliente.

## Solução

Manter a validação atual, mas tornar o campo vazio óbvio para o usuário:

1. Adicionar estado `clientNameError` em `src/pages/Index.tsx`.
2. No `handleSave`, quando `clientName` estiver vazio:
   - Setar `clientNameError = true`
   - Dar foco no input via `ref`
   - Fazer scroll até o topo (`window.scrollTo({ top: 0, behavior: 'smooth' })`)
   - Manter o toast atual
3. No input do header (linha 219-225), aplicar borda vermelha + ring quando `clientNameError === true` (`border-destructive ring-2 ring-destructive`).
4. Ao digitar (`onChange`), limpar `clientNameError`.
5. Aplicar a mesma melhoria em `src/pages/Orcamento.tsx` (linhas 103 e 244) e `src/pages/Reforma.tsx` (linhas 130 e 273) para consistência.

## Arquivos alterados

- `src/pages/Index.tsx`
- `src/pages/Orcamento.tsx`
- `src/pages/Reforma.tsx`
