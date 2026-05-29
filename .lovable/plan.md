## Objetivo

Trazer os leads que chegam pelo formulário do site (RD Station Marketing) para o CRM, em uma nova tela **Leads** acessível pelo menu inicial. Sincronização automática 1x/hora via API pública do RD. Cada lead pode ser convertido manualmente em Organização + Oportunidade, com o time escolhendo o funil de destino.

## O que será criado

### 1. Novo card "Leads" no menu inicial
- Card na Home (`src/pages/Home.tsx`) ao lado dos existentes, abrindo `/leads`.
- Badge com contagem de leads pendentes (não convertidos / não descartados).

### 2. Nova tela `/leads` (`src/pages/Leads.tsx`)
- Lista paginada dos leads importados do RD, com filtros: status (novo / convertido / descartado), data, busca por nome/email.
- Colunas: nome, email, telefone, empresa, origem (UTM/conversion identifier), data recebida no RD, status.
- Ações por linha:
  - **Converter** → modal pedindo (a) funil de destino e (b) opcionalmente vincular a Organização existente; se nova, cria Organização + Pessoa + Oportunidade na 1ª etapa do funil escolhido, aplicando a regra atual de responsável por estado.
  - **Descartar** → marca como descartado (não some do histórico).
  - **Sincronizar agora** (botão no header) → dispara a edge function on-demand.

### 3. Banco de dados (Supabase)
Nova tabela `leads_rd` para guardar os leads importados sem misturar com `pessoas`/`organizacoes` até a conversão:

- Campos principais: `rd_uuid` (único, idempotência), `email`, `nome`, `telefone`, `empresa`, `cargo`, `cidade`, `estado`, `payload` (jsonb cru do RD), `conversion_identifier`, `utm_source/medium/campaign`, `criado_em_rd`, `recebido_em`, `status` (novo/convertido/descartado), `organizacao_id`, `oportunidade_id`, `convertido_por`, `convertido_em`.
- RLS: leitura/escrita para usuários aprovados; admin vê tudo. Conversão grava `convertido_por = auth.uid()`.
- Tabela `rd_sync_log` para auditar cada execução do cron (timestamp, total, criados, erros).

### 4. Edge function `rd-sync-leads`
- Roda via cron `pg_cron` + `pg_net` a cada 1h.
- Também invocável manualmente pelo botão "Sincronizar agora".
- Usa o **RD_PUBLIC_TOKEN** (Public API Token legado) — secret a ser cadastrado.
- Endpoint: `GET https://api.rd.services/platform/contacts` paginado (ou `/conversions` se preferir só conversões — confirmar). Filtra por `updated_at > último sync`.
- Faz upsert em `leads_rd` por `rd_uuid` (idempotente).
- Grava resultado em `rd_sync_log`.

### 5. Edge function `rd-convert-lead`
- Recebe `lead_id` + `pipeline_id` + opcional `organizacao_id`.
- Se sem organização: cria `organizacoes` (usando estado/cidade do lead → dispara regra existente de responsável por estado) + `pessoas` vinculada.
- Cria `oportunidades` na primeira etapa do pipeline escolhido, valor estimado 0, título "Lead RD — {nome}".
- Atualiza `leads_rd.status = 'convertido'`, grava `organizacao_id` e `oportunidade_id`.

## Detalhes técnicos

- **Secret novo**: `RD_PUBLIC_TOKEN` (será solicitado após aprovação do plano).
- **Cron**: `select cron.schedule('rd-sync-hourly', '0 * * * *', ...)` chamando a edge function via `net.http_post` com o anon key.
- **Idempotência**: chave única `rd_uuid` evita duplicar leads em re-execuções.
- **Reaproveitamento**: a conversão usa `criarOportunidadeAuto` (`src/lib/autoOportunidade.ts`) adaptada para aceitar `pipeline_id` direto.
- **Permissões**: tela `/leads` protegida por `ProtectedRoute`; descarte/conversão liberados para `comercial`, `gerente_comercial`, `admin`.
- **Logs**: erros do RD logados em `rd_sync_log` para diagnóstico sem precisar abrir o painel da Supabase.

## Fora de escopo (v2)

- Webhook em tempo real do RD.
- Sincronização bidirecional (atualizar lead no RD a partir do CRM).
- Mapeamento avançado de campos customizados do RD.
- Migração para OAuth quando o Public Token for descontinuado pelo RD.

## Aviso

O **Public API Token** do RD Station está marcado como legado pelo próprio RD e pode ser descontinuado. Quando isso acontecer, migramos para OAuth (Client ID + Secret + Refresh Token) sem mexer na estrutura — só troca da edge function.