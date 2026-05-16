# PR3 — Polimento UX de permissões e filtros

## Resumo
Três melhorias UX: (1) tela "Sem permissão" em vez de redirect silencioso em `/admin/*`; (2) tela "Não encontrado / sem permissão" em rotas de detalhe por UUID; (3) filtros de Responsável restritos por role.

## Arquivos a criar
- `src/components/SemPermissao.tsx` — componente reutilizável (props: `titulo`, `mensagem`, `ctaText`, `ctaHref`, `icone` 'lock'|'search').
- `src/components/RequireRole.tsx` — wrapper que checa role e renderiza children OU `<SemPermissao />` (sem redirect).
- `src/hooks/useResponsavelFilterOptions.ts` — retorna profiles disponíveis para filtro baseado em role do usuário logado.

## Arquivos a editar

### Bloco 1 — Acesso negado em /admin/*
- `src/App.tsx` — trocar `<ProtectedRoute requireAdmin>` por `<ProtectedRoute><RequireRole role="admin">` nas rotas:
  - `/admin/usuarios`
  - `/admin/pipelines`
  - `/reforma/catalogo`
  - (manter `requireAdmin` removido nessas rotas; deixa `RequireRole` cuidar do feedback)

### Bloco 2 — Detalhe por UUID sem permissão
- `src/pages/OrganizacaoDetalhe.tsx` — quando query principal retorna `null` (ou erro), renderizar `<SemPermissao variante="nao-encontrado">` e **abortar queries filhas**. Hoje as queries de pessoas/atividades/oportunidades disparam mesmo sem org.
- `src/pages/DealDetalhe.tsx` — mesmo padrão para oportunidade.
- `src/pages/Dossie.tsx` — verificar e aplicar mesmo padrão (cliente por UUID).
- (não existem rotas `/pessoas/:id`, `/proposta/:id`, `/orcamento/:id` standalone — pessoas é só lista; propostas/orçamentos abrem em modal.)

### Bloco 3 — Filtro de Responsável por role
Roles que enxergam outros: `admin`, `gerente_comercial`, `viewer`, `financeiro`, `engenharia`, `operacao`, `marketing`.
Roles que só veem "Eu"/"Todos": `comercial`, `rtv`.

- `src/pages/Atividades.tsx:301-308` — usar `useResponsavelFilterOptions()`.
- `src/pages/Crm.tsx:~604` — idem.
- `src/pages/Organizacoes.tsx:~144` — idem.
- `src/pages/Pessoas.tsx:~106` — idem.
- `src/pages/Relatorios.tsx` — verificar e aplicar se houver.

**Não tocar** em dropdowns de criação/edição (OrganizacaoFormModal, PessoaFormModal, NovaOportunidadeModal, OportunidadeFormModal, OportunidadeSheet, NovaAtividadeQuickForm, AtividadeFormSheet, DealDetalhe dropdown de atribuição).

## Detalhes técnicos

`useResponsavelFilterOptions` retorna `{ profiles: Profile[], showOthers: boolean }`:
- Se `showOthers` for `false`, o componente do filtro só renderiza "Eu"/"Todos".
- Lista de profiles é buscada via React Query (já tem padrão no projeto).

`RequireRole` lê `useAuth().hasAnyRole(roles)`; se loading → spinner; se não permitido → `<SemPermissao titulo="Acesso negado" mensagem="Esta página requer perfil admin." ctaText="Voltar para a Home" ctaHref="/" icone="lock" />`.

`SemPermissao` usa tokens semânticos (bg-background, text-muted-foreground, primary), ícone Lucide (`Lock` ou `SearchX`), centralizado vertical/horizontal, layout limpo.

## Verificação
- Build TS limpo (harness roda automaticamente).
- Smoke test mental: comercial.teste em `/admin/usuarios` → tela "Acesso negado"; em `/organizacoes/<uuid-inválido>` → "Não encontrado"; em filtro de `/atividades` → só "Eu"/"Todos".

## Pós-aprovação
Após o build passar, sugerir Publish (não posso publicar por você, só apresentar o botão).
