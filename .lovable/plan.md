# Unificação clientes/organizacoes e contatos/pessoas

Operação cirúrgica em 6 fases, com parada obrigatória ao final de cada uma para sua confirmação explícita.

## Fases

1. **Diagnóstico (read-only)** — Gera `/docs/MIGRACAO-CLIENTES.md` com contagens, sobreposição CNPJ/nome, dependências (FKs em contatos/propostas/oportunidades/atividades), uso no código frontend e RLS atual de `clientes`/`contatos`. Nenhuma alteração no banco ou código.
2. **Garantir FKs** — `ALTER TABLE` em oportunidades/atividades/propostas adicionando `organizacao_id` e `pessoa_id` (IF NOT EXISTS) + índices. Mantém `cliente_id`.
3. **Migração de dados** — Transação única: mapeia clientes→organizacoes (CNPJ → nome → cria nova), atualiza FKs em oportunidades/propostas/atividades, migra contatos→pessoas evitando duplicatas, persiste `migracao_clientes_log` para auditoria.
4. **Refatorar frontend** — Clientes.tsx vira redirect para /organizacoes; Dossie.tsx passa a usar organizacao_id (com redirect legacy via log); OportunidadeFormModal e demais consumidores trocam `.from("clientes")` → `.from("organizacoes")` e `.from("contatos")` → `.from("pessoas")`. ClienteFormModal/ContatoFormModal **não** são deletados ainda.
5. **Read-only nas tabelas antigas** — Substitui policies permissivas de `clientes`/`contatos` por SELECT-only. Janela de observação 24-48h.
6. **DROP final (destrutivo)** — Remove `cliente_id` das tabelas dependentes, `DROP TABLE clientes, contatos CASCADE`, deleta arquivos órfãos. Mantém `migracao_clientes_log`.

## Regras de execução

- **PARA** ao final de cada fase e mostra relatório.
- **NÃO** avança sem você dizer explicitamente "OK, segue para Fase N".
- Fase 6 exige backup do banco antes.

## Próximo passo

Iniciar **Fase 1** (apenas leitura — gera o relatório de diagnóstico). Aprove para eu começar.
