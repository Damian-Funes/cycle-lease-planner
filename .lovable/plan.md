# Auditoria dos botões de Salvar

Varri os 24 formulários do app. A maioria está OK (validação Zod, mutation com toast de sucesso/erro, invalidação de cache). Encontrei **3 problemas reais** que fazem o salvamento "funcionar" mas quebrar a visualização/edição depois para usuários não-admin.

## Problemas encontrados

### 1. `responsavel_id` fica nulo em vários cadastros (CRÍTICO)
As funções `fn_atribuir_responsavel_org`, `fn_atribuir_responsavel_pessoa`, `fn_set_responsavel_default` existem no banco, **mas não há nenhum trigger ativo** (confirmado via `information_schema.triggers`).

Como as RLS de SELECT/UPDATE para o papel `comercial` exigem `responsavel_id = auth.uid()`, qualquer registro criado por um comercial sem preencher o responsável fica invisível para ele depois de salvar.

Afeta:
- `OrganizacaoFormModal` (linha 124) — `responsavel_id: v.responsavel_id || null`
- `PessoaFormModal` — mesmo padrão
- `Index.tsx` (proposta SmartCycle, linhas 85-114) — não envia `responsavel_id`
- `Orcamento.tsx` — não envia `responsavel_id`
- `Reforma.tsx` — não envia `responsavel_id`

**Correção:** ou criar os triggers no banco (recomendado), ou setar `responsavel_id = auth.uid()` no payload do front quando vier vazio.

### 2. `OrganizacaoFormModal` não tem campo `estado_id`
O formulário só edita o texto `estado` (sigla). A coluna `estado_id` é o que as RLS usam (`pode_ver_organizacao`, `user_cobre_estado`). Sem ela, comercial/RTV vinculado por estado não enxerga a organização.

**Correção:** trocar o input de "Estado" por um Select carregando `public.estados`, gravando `estado_id` (e o trigger `fn_sync_estado_organizacao` preencheria a sigla — mas como não há trigger, gravar `estado` também).

### 3. `AtividadeFormSheet` usa `profiles.id` como `responsavel_id`
Linha 81-82: busca `profiles.id` (PK da tabela) e grava em `responsavel_id`, que deveria ser `auth.uid()`. Inconsistente com o resto do sistema.

**Correção:** trocar para `responsavel_id: user.id`.

## Outros formulários (status OK)

| Formulário | Status |
|---|---|
| ClienteFormModal | OK (tags corrigidas na migration anterior) |
| ContatoFormModal | OK |
| NovaOportunidadeModal / OportunidadeFormModal / OportunidadeSheet | OK |
| NovaAtividadeQuickForm | OK (usa `auth.user.id`) |
| VincularOportunidadeModal | OK |
| UserPermissionsDialog | OK |
| AdminPipelines (pipelines + etapas) | OK |
| Catalogo / ReformaCatalogo | OK (área admin com senha) |
| LayoutEditor (Salvar Tudo) | OK |
| ProposalTab (Salvar e Exportar) | OK (delega ao handleSave do Index) |
| DealPropostasOrcamentos | OK (apenas botões de criar) |
| SeletorOrganizacao | OK |

## Escopo da implementação proposta

1. **Front-end (rápido, sem migration):**
   - `OrganizacaoFormModal`: setar `responsavel_id = auth.uid()` quando vazio. Adicionar Select de Estado gravando `estado_id` + sigla.
   - `PessoaFormModal`: setar `responsavel_id = auth.uid()` quando vazio.
   - `Index.tsx`, `Orcamento.tsx`, `Reforma.tsx`: incluir `responsavel_id: auth.uid()` no payload de INSERT (não no UPDATE, para preservar dono original).
   - `AtividadeFormSheet`: usar `user.id` como `responsavel_id`.

2. **Banco (opcional, mais robusto):** criar os triggers que já existem como funções soltas (`fn_atribuir_responsavel_org`, `fn_atribuir_responsavel_pessoa`, `fn_set_responsavel_default` em propostas/orcamentos/orcamentos_reforma, e `fn_sync_estado_organizacao` em organizacoes). Isso garante consistência mesmo se outros caminhos de inserção surgirem.

Recomendo fazer **as duas coisas** (front + triggers no banco) — defesa em profundidade.
