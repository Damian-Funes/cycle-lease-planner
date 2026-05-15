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
