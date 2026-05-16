# Security Notes — CRM LS

## Matriz de acesso (atualizada na PR1.5)

| Tabela / View | admin | viewer | financeiro | engenharia | operacao | comercial | rtv | marketing |
|---|---|---|---|---|---|---|---|---|
| `organizacoes` | tudo | tudo (R) | tudo (R) | tudo (R) | tudo (R) | suas + cobertura | cobertura | tudo (R) |
| `pessoas` | tudo | tudo (R) | tudo (R) | tudo (R) | tudo (R) | suas/org | suas/org | tudo (R) |
| `atividades` | tudo | suas/org | suas/org | suas/org | suas/org | suas/org | suas/org | **tudo (R)** |
| `oportunidades` (base) | tudo | — | — | — | — | suas + cobertura | — | ❌ bloqueado |
| `oportunidades_sem_valores` (view) | ✓ | — | — | — | — | — | — | ✓ |
| `v_oportunidades_kanban` (view) | ✓ | ✓ | ✓ | ✓ | ✓ | suas + cob. | — | ❌ (RLS na base) |
| `v_oportunidades_kanban_sem_valores` (view) | ✓ | — | — | — | — | — | — | ✓ |
| `v_relatorio_*` (4 views) | ✓ | ✓ | ✓ | ✓ | ✓ | suas | — | ❌ (filtro embutido) |
| `oportunidade_pessoas` | tudo | via opp | via opp | via opp | via opp | via opp | via opp | tudo (R) |
| `historico_oportunidade` | tudo | via opp | via opp | via opp | via opp | via opp | via opp | tudo (R) exceto `tipo_mudanca='valor'` |
| `propostas` (base) | tudo | tudo | tudo | tudo | tudo | suas + cobertura | — | ❌ bloqueado |
| `propostas_sem_valores` (view) | ✓ | — | — | — | — | — | — | ✓ |
| `orcamentos` / `orcamentos_reforma` | idem propostas | | | | | | | |
| `pipelines` / `etapas_pipeline` / `tipos_atividade` | leitura todos autenticados; escrita só admin |

**Escrita:**
- `atividades`: cria — qualquer aprovado. Edita — dono ou admin. Remove — só admin.
- `oportunidades` / `propostas` / `orcamentos*`: cria — admin + comercial. Edita — dono ou admin. Remove — só admin.

## Rotas bloqueadas para Marketing (PR1.5)
- `/relatorios` — tela "Sem permissão" (4 das 5 fontes são financeiras).
- `/crm/deal/:id` — tela "Sem permissão" (página inteira mostra valor + edição).
- `/crm` — **acessível**, mas KPIs e cards substituem R$ por contagem; usa view `v_oportunidades_kanban_sem_valores`.
- `/` (Home) e widgets — KPIs financeiros viram contagem (CrmWidgets.tsx).

## Padrão de uso `useReadTables()`

```ts
import { useReadTables } from "@/lib/tables";
const t = useReadTables();
supabase.from(t.oportunidades).select("*");          // tabela ou view
supabase.from(t.oportunidades_kanban).select("*");   // v_oportunidades_kanban*
```

Chaves: `oportunidades`, `oportunidades_kanban`, `propostas`, `orcamentos`, `orcamentos_reforma`.

⚠️ **Usar SOMENTE em leitura.** Para INSERT/UPDATE/DELETE use o nome da tabela direto — marketing não escreve nessas tabelas (RLS bloqueia).

## Views `v_relatorio_*`

Mantidas como SECURITY DEFINER (padrão). Bloqueio de marketing é feito por filtro embutido:
`WHERE NOT public.has_role(auth.uid(),'marketing')` — marketing recebe 0 linhas em todas elas.

## Riscos aceitos

### 1) `atividades.descricao` / `atividades.observacoes` legíveis para Marketing
Marketing lê todas as atividades. Os campos `descricao` e `observacoes` são texto livre, e nada impede que um vendedor escreva valores em R$ ali ("cliente aceitou R$ 3M").
**Mitigação futura (se virar problema):** criar `atividades_marketing` view sem esses campos, ou sanitizar via trigger.

### 2) Views `*_sem_valores` e `v_relatorio_*` são SECURITY DEFINER (linter warning 0010)
As 5 views disparam o linter `0010_security_definer_view`. **É intencional:** o controle de acesso é feito por `WHERE` embutido + omissão das colunas monetárias nas `_sem_valores`. Usar `security_invoker=true` exigiria dar SELECT direto na tabela base, derrotando o propósito.

### 3) `tipo_mudanca='valor'` em `historico_oportunidade`
Marketing não lê esses registros (policy filtra). Eventos `etapa`, `status`, `motivo_perda`, `criada` são visíveis.

## REGRA DE OURO — Referências a usuário

**Toda coluna que referencia usuário (`responsavel_id`, `criador_id`, `usuario_id`, `aprovado_por`, `approved_by`, `created_by`, etc.) armazena `auth.users.id`** — o mesmo valor retornado por `auth.uid()` no backend e `user.id` no frontend.

- ✅ Backend: `NEW.responsavel_id := auth.uid()`
- ✅ Frontend: `responsavel_id: user.id`
- ❌ **NUNCA usar `profile.id`** para essa finalidade.

`profiles.id` existe APENAS como chave primária da própria tabela `profiles`. Para join com perfis use `profiles.user_id`.

FKs ajustadas (PR pós-1.5):
- `organizacoes.responsavel_id` → `profiles(user_id)` ON DELETE SET NULL
- `pessoas.responsavel_id` → `profiles(user_id)` ON DELETE SET NULL
- `atividades.responsavel_id` → `profiles(user_id)` (já existia)
- `oportunidades`, `propostas`, `orcamentos*`: sem FK (mas dados normalizados)

### Padrão para dropdowns de "Responsável"
```tsx
const { data: profiles } = useQuery({
  queryFn: () => supabase.from("profiles").select("user_id, nome, email").eq("status","approved")
});
// Select: key={p.user_id} value={p.user_id}
```
