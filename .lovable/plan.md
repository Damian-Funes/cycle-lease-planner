# Botão de exclusão no Catálogo (admin, só inativos)

## Objetivo
Permitir que o admin apague definitivamente produtos do catálogo, mas **apenas quando estiverem desativados** (`ativo = false`). Isso evita exclusão acidental de itens em uso.

## Fluxo
1. Admin desativa o produto (botão Power já existente).
2. Aparece o ícone de lixeira ao lado, somente nos itens inativos.
3. Clique → `AlertDialog` de confirmação ("Excluir definitivamente? Esta ação não pode ser desfeita").
4. Confirmação → `DELETE` em `equipamentos` pelo id → recarrega lista.

## Regras de visibilidade do botão
- Usuário precisa ser `admin` (via role).
- Produto precisa estar `ativo = false`.
- Se ambas falsas → botão não renderiza.

## Tratamento de erro
Se houver FK (proposta/orçamento/layout usando o item), o DELETE falha. Mostrar toast: "Este produto está vinculado a propostas/layouts e não pode ser excluído."

## Permissão no backend
Adicionar policy de `DELETE` em `equipamentos` restrita a `has_role(auth.uid(),'admin')` (se ainda não existir).

## Arquivos
- `src/pages/Catalogo.tsx` — botão lixeira condicional + AlertDialog + handler.
- Migração SQL — policy DELETE admin-only em `equipamentos`.
