# PR2 — Fechar vazamentos de valores monetários para Marketing

## Escopo
Marketing **não pode ver R$** em lugar nenhum: /crm (Pipeline), /relatorios, Home, dashboards, cards e KPIs. Mantém leitura de atividades, listas, organizações etc.

## Bugs identificados

### BUG 1 — `/crm` (Pipeline Comercial)
- `src/pages/Crm.tsx:276` lê `v_oportunidades_kanban` (que expõe `valor_estimado`).
- `CrmWidgets.tsx` soma `valor_estimado` em "Total no Pipeline" e "Forecast Ponderado".
- Cards do Kanban exibem valor por card e subtotal por coluna.

### BUG 2 — `/relatorios`
- `src/pages/Relatorios.tsx` lê 5 fontes que carregam valor:
  - `oportunidades` (linha 79)
  - `v_relatorio_forecast_mensal` (valor_total, forecast_ponderado)
  - `v_relatorio_performance_vendedor` (valor_ganho, win_rate)
  - `v_relatorio_motivos_perda` (valor_total)
  - `v_relatorio_tempo_etapa` (sem valor — OK)

Obs: as views legadas são SECURITY DEFINER (padrão), então bypassam o RLS do `oportunidades` — por isso marketing vê valores mesmo com a PR1.

## Decisões

1. **`/crm`**: criar `v_oportunidades_kanban_sem_valores` (idêntica, sem `valor_estimado`/`probabilidade`). Marketing usa essa view; cards/KPIs/subtotais ocultam linha de valor quando `isMarketing`.
2. **`/relatorios`**: bloquear acesso de marketing com tela "Sem permissão para visualizar relatórios financeiros". Justificativa: 4 das 5 views são essencialmente financeiras; criar 4 views *_sem_valores deixaria a página vazia/sem sentido. Mais limpo bloquear a rota inteira.
3. **Helper**: estender `useReadTables()` com `oportunidades_kanban` apontando para a view nova ou a legada.

## Arquivos tocados

### Migration (1)
- `supabase/migrations/<novo>.sql`
  - `CREATE VIEW public.v_oportunidades_kanban_sem_valores` (sem `valor_estimado`, sem `probabilidade`)
  - `REVOKE` das 4 views `v_relatorio_*` para `authenticated` e regrant excluindo marketing — OU criar wrapper function. Mais simples: alterar views para `WHERE NOT has_role(auth.uid(),'marketing')` no corpo (SECURITY INVOKER + filtro embutido). Marketing vê 0 linhas.
  - `GRANT SELECT` da nova view para `authenticated`.

### Frontend (3)
- `src/lib/tables.ts` — adicionar `oportunidades_kanban`.
- `src/pages/Crm.tsx` — usar `t.oportunidades_kanban`; ocultar coluna/linha de valor nos cards e subtotais quando `isMarketing`.
- `src/components/CrmWidgets.tsx` — ocultar KPIs "Total no Pipeline" e "Forecast Ponderado" para marketing (ou substituir por "Qtd. Oportunidades"/"Qtd. Forecast").
- `src/pages/Relatorios.tsx` — early-return com `<Card>Sem permissão</Card>` quando `hasRole('marketing')`.

### Doc
- `docs/SECURITY-NOTES.md` — atualizar matriz com nova view + bloqueio de /relatorios.

## Validação pós-aplicação
1. Logar como marketing → /crm: nenhum R$ visível em KPIs, cards, subtotais.
2. /relatorios: tela de bloqueio.
3. Logar como admin: tudo continua igual.
4. `SELECT` direto nas views *_sem_valores e v_relatorio_* como marketing → confirma que valor não vaza.
