# Botão de exclusão no Catálogo (admin)

## Objetivo
Permitir que o admin apague produtos definitivamente do catálogo, além do já existente "ativar/desativar".

## O que muda
- Em `src/pages/Catalogo.tsx`, na linha de cada equipamento, adicionar um ícone de lixeira ao lado do botão de ativar/desativar.
- O botão só aparece para usuários com role `admin` (via hook `useUserRole`/`has_role`).
- Ao clicar, abre `AlertDialog` de confirmação ("Excluir definitivamente? Esta ação não pode ser desfeita").
- Confirmação executa `DELETE` em `equipamentos` pelo id e recarrega a lista.

## Tratamento de erro
Se o equipamento estiver referenciado em propostas/orçamentos/layouts (FK), o Supabase retornará erro. Nesse caso:
- Mostrar toast explicando que o produto está em uso e sugerir desativar em vez de excluir.

## Permissão
- UI: ocultar botão para não-admins.
- Backend: a RLS atual da tabela `equipamentos` já restringe `DELETE` ao admin (a confirmar). Se não, criar policy `DELETE` somente para `has_role(auth.uid(),'admin')`.

## Arquivos
- `src/pages/Catalogo.tsx` — botão + dialog + handler.
- (Possível) migração para policy `DELETE` admin-only em `equipamentos`.
