# Migração clientes/organizacoes e contatos/pessoas

## Fase 1 — Diagnóstico (read-only)

Data: 2026-05-15

### 1) Contagem de registros

| Tabela | Registros |
|---|---|
| `clientes` | **1** |
| `organizacoes` | **0** |
| `contatos` | **0** |
| `pessoas` | **1** |

### 2) Sobreposição clientes ↔ organizacoes

| Critério | Qtd |
|---|---|
| Match por CNPJ | 0 |
| Match por nome (UPPER+TRIM) | 0 |
| **Órfãos (sem match)** | **1** |

O único cliente existente é:
- `LAR COOPERATIVA AGROINDUSTRIAL` (CNPJ `77.752.293/0001-98`, status `lead`).

Não existe nenhuma organização ainda — a migração criará 1 nova organização.

### 3) Dependências (FKs apontando para `clientes`)

| Tabela / coluna | Registros |
|---|---|
| `contatos.cliente_id` | 0 |
| `propostas.cliente_id` | 0 |
| `propostas.organizacao_id` | 0 |
| `oportunidades.organizacao_id` | 0 |
| `atividades.cliente_id` | 0 |
| `atividades.organizacao_id` | 0 |

Nenhum registro filho está apontando hoje para o cliente — não haverá UPDATE de FKs na Fase 3.

> Nota: a coluna `oportunidades.cliente_id` não existe (a tabela já foi criada com `organizacao_id` obrigatório).

### 4) Uso no código frontend

Arquivos que ainda referenciam `clientes`/`contatos`/`clienteId`/`cliente_id`:

**Páginas**
- `src/pages/Clientes.tsx` — lista de clientes (`.from("clientes")`, delete, link p/ `/dossie/:id`)
- `src/pages/Dossie.tsx` — dossiê do cliente (rota `/dossie/:clienteId`, queries em `clientes`/`contatos`/`propostas`)
- `src/pages/Home.tsx` — link `/clientes`

**Componentes**
- `src/components/ClienteFormModal.tsx` — CRUD `clientes`
- `src/components/ContatoFormModal.tsx` — CRUD `contatos`
- `src/components/OportunidadeFormModal.tsx` — combobox lê `.from("clientes")`, valida `cliente_id`, abre `ClienteFormModal`
- `src/components/OportunidadesCliente.tsx` — filtra oportunidades por `cliente_id`
- `src/components/AtividadeFormSheet.tsx` — recebe `clienteId`, escreve `cliente_id`
- `src/components/NovaAtividadeQuickForm.tsx` — escreve `cliente_id`
- `src/components/Timeline.tsx` — filtra `atividades`/`propostas`/`oportunidades` por `cliente_id`
- `src/components/OportunidadeSheet.tsx` — link `/dossie/${cliente_id}`

**Roteamento (`src/App.tsx`)**
- `Route /clientes → <Clientes />`
- `Route /dossie/:clienteId → <Dossie />`

**Tipos gerados (`src/integrations/supabase/types.ts`)**
- Reflete `atividades.cliente_id`, `contatos.cliente_id`, `propostas.cliente_id` (regenerado automaticamente após Fase 6).

### 5) RLS atual

| Tabela | Policy | Cmd | qual | with_check |
|---|---|---|---|---|
| `clientes` | `Permissive access on clientes` | ALL | `true` | `true` |
| `contatos` | `Permissive access on contatos` | ALL | `true` | `true` |

Totalmente permissivas (autenticado lê/escreve tudo). Serão substituídas por SELECT-only na Fase 5.

### Observações

- Volume é desprezível (1 cliente, 0 contatos, 0 FKs filhas) — risco de perda de dados é mínimo.
- Estado real do banco indica que o sistema já opera predominantemente sobre `organizacoes`/`pessoas`; este resíduo é legado de testes.
- A complexidade real da operação está concentrada na **Fase 4 (refactor frontend)**, não no banco.

---

**Fim da Fase 1.** Aguardando autorização "OK, segue para Fase 2".

## Fase 2 — Garantir FKs e índices (executada)

Data: 2026-05-15

### Migração aplicada

```sql
ALTER TABLE oportunidades ADD COLUMN IF NOT EXISTS organizacao_id UUID REFERENCES organizacoes(id) ON DELETE SET NULL;
ALTER TABLE atividades    ADD COLUMN IF NOT EXISTS organizacao_id UUID REFERENCES organizacoes(id) ON DELETE SET NULL;
ALTER TABLE atividades    ADD COLUMN IF NOT EXISTS pessoa_id      UUID REFERENCES pessoas(id)      ON DELETE SET NULL;
ALTER TABLE propostas     ADD COLUMN IF NOT EXISTS organizacao_id UUID REFERENCES organizacoes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_oportunidades_organizacao ON oportunidades(organizacao_id);
CREATE INDEX IF NOT EXISTS idx_atividades_organizacao    ON atividades(organizacao_id);
CREATE INDEX IF NOT EXISTS idx_atividades_pessoa         ON atividades(pessoa_id);
CREATE INDEX IF NOT EXISTS idx_propostas_organizacao     ON propostas(organizacao_id);
```

### Resultado

- Todas as colunas já existiam (criadas em sprints anteriores) — `IF NOT EXISTS` tornou a operação no-op para colunas.
- Índices criados/garantidos: 4 índices em `(organizacao_id)` / `(pessoa_id)`.
- Coluna `cliente_id` **mantida** intacta em `contatos`, `propostas`, `atividades` (será removida apenas na Fase 6).
- Linter retornou 54 avisos **pré-existentes** (RLS permissivas em `clientes`, `contatos`, `oportunidades`, `etc.`) — não causados por esta fase. Serão tratados na Fase 5.

**Fim da Fase 2.** Aguardando autorização "OK, segue para Fase 3".

## Fase 3 — Migração de dados (executada)

Data: 2026-05-15

### Ajuste em relação ao plano original

- Removido `UPDATE oportunidades SET organizacao_id ... WHERE cliente_id = ...`: a coluna `oportunidades.cliente_id` **não existe** (a tabela já foi criada com `organizacao_id NOT NULL`). Tentativa anterior falhou com `ERROR 42703: column oportunidades.cliente_id does not exist` e a transação foi totalmente revertida — re-executada sem esse passo.

### Resultado

| Métrica | Valor |
|---|---|
| Match por CNPJ | 0 |
| Match por nome | 0 |
| **Organizações criadas (caso C)** | **1** |
| `propostas` atualizadas com `organizacao_id` | 0 |
| `atividades` atualizadas com `organizacao_id` | 0 |
| `pessoas` inseridas a partir de `contatos` | 0 (não havia contatos) |
| Clientes registrados em `migracao_clientes_log` | **1** |
| Clientes **sem** entrada de log | 0 |

### Mapa cliente → organização

| cliente_id | organizacao_id | Nome | CNPJ |
|---|---|---|---|
| `63e1e721-fe20-411e-a317-2a51a40d5719` | `e36ac7af-a99a-461f-b682-66dcaa84d5e7` | LAR COOPERATIVA AGROINDUSTRIAL | 77.752.293/0001-98 |

### Estado pós-migração

- `organizacoes`: 1 registro (era 0)
- `pessoas`: 1 registro (já existia, nada inserido)
- `migracao_clientes_log`: 1 registro (auditoria completa)
- 100% dos clientes mapeados.

### Tabela de auditoria criada

`public.migracao_clientes_log` (permanente, RLS ativo, leitura apenas para `admin`).

**Fim da Fase 3.** Aguardando autorização "OK, segue para Fase 4".

## Fase 4 — Refactor frontend (executada)

Data: 2026-05-15

### Arquivos modificados

| Arquivo | Mudança |
|---|---|
| `src/pages/Clientes.tsx` | Substituído por **redirect** → `/organizacoes` (replace) |
| `src/pages/Dossie.tsx` | Substituído por **redirect**: consulta `migracao_clientes_log` para mapear `cliente_id` → `organizacao_id` e navega para `/organizacoes/:id` (fallback: assume que o param já é id de organização) |
| `src/pages/Home.tsx` | Removido tile "Clientes" (Organizações já existe) |
| `src/components/OportunidadeFormModal.tsx` | Refactor completo: `cliente_id` → `organizacao_id`, query em `organizacoes`, label "Cliente" → "Organização", `defaultClienteId` → `defaultOrganizacaoId`, abre `OrganizacaoFormModal` em vez de `ClienteFormModal`. **Corrige bug pré-existente**: a tabela `oportunidades` não tem coluna `cliente_id`, o INSERT antigo estava quebrado. |
| `src/components/OportunidadeSheet.tsx` | Query: `clientes(id, razao_social)` → `organizacoes(id, nome)`. Link: `/dossie/${cliente_id}` → `/organizacoes/${organizacao_id}`. |
| `src/components/AtividadeFormSheet.tsx` | Prop `clienteId` → `organizacaoId`. Filtros e INSERT em `organizacao_id`. |
| `src/components/Timeline.tsx` | Prop `clienteId` → `organizacaoId`. Realtime e queries por `organizacao_id`. |
| `src/components/OportunidadesCliente.tsx` | Prop `clienteId` → `organizacaoId`. Query por `organizacao_id`. (Componente fica órfão após refactor — marcado para deleção na Fase 6.) |
| `src/components/NovaAtividadeQuickForm.tsx` | Removido o campo legado `cliente_id` do payload. |
| `src/App.tsx` | Mantido sem mudanças — rotas `/clientes` e `/dossie/:clienteId` continuam mapeando para os componentes que agora são redirects. |

### Arquivos a DELETAR na Fase 6

- `src/components/ClienteFormModal.tsx` (zero imports)
- `src/components/ContatoFormModal.tsx` (zero imports)
- `src/components/OportunidadesCliente.tsx` (zero imports — Dossie virou redirect)
- `src/pages/Clientes.tsx` (redirect — pode ser substituído por `<Navigate>` no router)
- `src/pages/Dossie.tsx` (redirect com lookup — manter se houver risco de bookmarks antigos; senão deletar)

### Rotas afetadas

- `/clientes` → redireciona para `/organizacoes`
- `/dossie/:clienteId` → redireciona para `/organizacoes/:organizacao_id` (via `migracao_clientes_log`)

### Verificações de integridade

- `rg` confirma que **nenhum** componente vivo ainda importa `ClienteFormModal`, `ContatoFormModal` ou referencia `cliente_id` semanticamente como organização. As únicas ocorrências restantes são:
  - Os arquivos órfãos a deletar na Fase 6.
  - O redirect em `Dossie.tsx` (lookup intencional na tabela de log).
  - `src/integrations/supabase/types.ts` (regenerado automaticamente quando `clientes`/`contatos` forem dropados na Fase 6).
- Build verde.

**Fim da Fase 4.**

## Fase 5 — Lockdown RLS legado (executada)

Data: 2026-05-15

### Mudanças aplicadas

| Tabela | Antes | Depois |
|---|---|---|
| `clientes` | `Permissive access` (ALL, true/true) | `Admin lê clientes (legado)` (SELECT, admin only). Sem INSERT/UPDATE/DELETE. |
| `contatos` | `Permissive access` (ALL, true/true) | `Admin lê contatos (legado)` (SELECT, admin only). Sem INSERT/UPDATE/DELETE. |

- RLS permanece habilitada nas duas tabelas.
- Escrita totalmente bloqueada (nenhuma policy de INSERT/UPDATE/DELETE) — congeladas até a Fase 6.
- Dados preservados (1 cliente, 0 contatos) para auditoria via `migracao_clientes_log`.

### Validação

- Linter retornou 52 warnings pré-existentes (RLS permissivas em `oportunidades`, `atividades`, `pipelines`, `etapas_pipeline`, `tipos_atividade`, `oportunidade_pessoas`, `historico_oportunidade`) — **fora do escopo desta migração de clientes/contatos**. Tratamento separado.
- Frontend não acessa mais `clientes`/`contatos` (validado na Fase 4), portanto o lockdown não quebra nada em produção.

**Fim da Fase 5.** Aguardando autorização "OK, segue para Fase 6" (drop das tabelas `clientes`, `contatos` e cleanup de colunas/arquivos órfãos).

## Fase 6 — Drop legado (executada)

Data: 2026-05-15

### Mudanças no banco

- `DROP TABLE public.contatos` — substituída integralmente por `pessoas`.
- `DROP TABLE public.clientes` — substituída integralmente por `organizacoes`.
- `ALTER TABLE atividades DROP COLUMN cliente_id` — substituída por `organizacao_id`.
- `ALTER TABLE propostas DROP COLUMN cliente_id` — substituída por `organizacao_id`.
- `fn_log_oportunidade_evento` atualizada para não gravar mais `cliente_id` em `atividades`.
- `migracao_clientes_log` mantida (registro permanente de auditoria com FK lógica para o cliente original).

### Arquivos removidos do frontend

- `src/components/ClienteFormModal.tsx`
- `src/components/ContatoFormModal.tsx`
- `src/components/OportunidadesCliente.tsx`

### Validação

- `rg "cliente_id" src/` retorna apenas:
  - `src/pages/Dossie.tsx:25` — lookup intencional em `migracao_clientes_log` (redirect de URLs antigas `/dossie/:clienteId` → `/organizacoes/:id`).
  - `src/integrations/supabase/types.ts` — regenerado automaticamente pelo Supabase após o drop.
- Linter retornou 52 warnings pré-existentes (RLS permissivas em `oportunidades`, `atividades`, etc.) — fora do escopo desta migração.

**Migração concluída.** Esquema legado `clientes`/`contatos` totalmente removido. Sistema opera 100% sobre `organizacoes`/`pessoas`.
