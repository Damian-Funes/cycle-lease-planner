# Tornar contato obrigatório ao criar Organização

## Problema

Comerciais cadastram organizações sem nenhuma pessoa de contato vinculada, deixando a base sem decisores/contatos para retomar o relacionamento.

## Regra

Ao **criar** uma organização, é obrigatório informar **pelo menos um contato** (pessoa) no mesmo formulário. Sem isso, o formulário não salva.

Na **edição** de organização existente: continua opcional adicionar/editar contatos pelo modal atual de pessoas. Não bloqueia edição se a org não tem pessoas (legado).

## UX

No `OrganizacaoFormModal`, adicionar uma seção **"Contato principal *"** (somente quando criando, não na edição) com os campos:

- **Nome** (obrigatório)
- **Cargo** (opcional)
- **E-mail** (opcional, validado se preenchido)
- **Telefone/Celular** (pelo menos um dos dois obrigatório)
- Checkbox **"É decisor"**

Validação no submit: nome do contato e (e-mail OU telefone OU celular) obrigatórios. Mensagens de erro inline.

## Fluxo de gravação

1. Insert em `organizacoes` → pega `id` retornado.
2. Insert em `pessoas` com `organizacao_id = <id da org>` e `responsavel_id` = mesmo da org (ou auth.uid()).
3. Se o insert da pessoa falhar, faz `delete` da org recém-criada (rollback manual) e mostra erro.
4. Toast: "Organização e contato criados".

## Arquivos a editar

- `src/components/OrganizacaoFormModal.tsx` — adicionar seção de contato condicional ao create, validação e fluxo de gravação em 2 passos com rollback.

## Fora de escopo

- Edição de organização (sem mudança).
- Migração de organizações antigas sem contato (continuam como estão).
- Adicionar múltiplos contatos no create (só 1 obrigatório; resto via aba Pessoas depois).
