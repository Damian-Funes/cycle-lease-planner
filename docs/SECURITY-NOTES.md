# Security Notes — CRM LS

## Matriz de acesso (PR1)

| Tabela / View | admin | viewer | financeiro | engenharia | operacao | comercial | rtv | marketing |
|---|---|---|---|---|---|---|---|---|
| `organizacoes` | tudo | tudo (R) | tudo (R) | tudo (R) | tudo (R) | suas + cobertura | cobertura | tudo (R) |
| `pessoas` | tudo | tudo (R) | tudo (R) | tudo (R) | tudo (R) | suas/org | suas/org | tudo (R) |
| `atividades` | tudo | suas/org | suas/org | suas/org | suas/org | suas/org | suas/org | **tudo (R)** |
| `oportunidades` (base) | tudo | — | — | — | — | suas + cobertura | — | ❌ bloqueado |
| `oportunidades_sem_valores` (view) | ✓ | — | — | — | — | — | — | ✓ |
| `oportunidade_pessoas` | tudo | via opp | via opp | via opp | via opp | via opp | via opp | tudo (R) |
| `historico_oportunidade` | tudo | via opp | via opp | via opp | via opp | via opp | via opp | tudo (R) exceto `tipo_mudanca='valor'` |
| `propostas` (base) | tudo | tudo | tudo | tudo | tudo | suas + cobertura | — | ❌ bloqueado |
| `propostas_sem_valores` (view) | ✓ | — | — | — | — | — | — | ✓ |
| `orcamentos` / `orcamentos_reforma` | idem propostas | | | | | | | |
| `pipelines` / `etapas_pipeline` / `tipos_atividade` | leitura todos autenticados; escrita só admin |

**Escrita:**
- `atividades`: cria — qualquer aprovado. Edita — dono ou admin. Remove — só admin.
- `oportunidades` / `propostas` / `orcamentos*`: cria — admin + comercial. Edita — dono ou admin. Remove — só admin.

## Padrão de uso `useReadTables()`

```ts
import { useReadTables } from "@/lib/tables";
const t = useReadTables();
supabase.from(t.oportunidades).select("*"); // 'oportunidades' ou 'oportunidades_sem_valores'
```

⚠️ **Usar SOMENTE em leitura.** Para INSERT/UPDATE/DELETE use o nome da tabela direto — marketing não escreve nessas tabelas (RLS bloqueia).

## Riscos aceitos

### 1) `atividades.descricao` / `atividades.observacoes` legíveis para Marketing
Marketing lê todas as atividades. Os campos `descricao` e `observacoes` são texto livre, e nada impede que um vendedor escreva valores em R$ ali ("cliente aceitou R$ 3M"). 
**Mitigação futura (se virar problema):** criar `atividades_marketing` view sem esses campos, ou sanitizar via trigger.

### 2) Views `*_sem_valores` são SECURITY DEFINER (linter warning 0010)
As 4 views (`oportunidades_sem_valores`, `propostas_sem_valores`, `orcamentos_sem_valores`, `orcamentos_reforma_sem_valores`) disparam o linter `0010_security_definer_view`. **É intencional:** o controle de acesso é feito por `WHERE has_role(auth.uid(),'marketing') OR has_role(auth.uid(),'admin')` embutido na view + omissão das colunas monetárias. Usar `security_invoker=true` exigiria dar SELECT direto na tabela base para marketing, o que derrota o propósito.

### 3) `tipo_mudanca='valor'` em `historico_oportunidade`
Marketing não lê esses registros (policy filtra). Eventos do tipo "etapa", "status", "motivo_perda", "criada" são visíveis.
