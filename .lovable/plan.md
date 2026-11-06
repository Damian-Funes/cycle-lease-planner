# Júlia completa organizações incompletas, priorizando as que ficam perto da viagem

## O que o banco mostra hoje
- Pela regra atual (conta e-mail, telefone da empresa e "tem alguma pessoa"), 70 de 143 organizações aparecem incompletas.
- Com a regra nova (pessoa com telefone, cidade + UF e responsável), seriam **61 incompletas**. Todas as organizações já têm responsável e 82 têm pessoa com telefone.
- **Coordenadas:** 98 de 143 organizações têm latitude/longitude, mas só **23 das 61 incompletas** têm. Das 7 paradas de viagem existentes, 6 têm coordenadas.
- O arquivo de municípios do IBGE no projeto tem **só nome e UF, sem coordenadas**.
- O campo `status` de organizações só aceita lead, prospect, ativo, inativo e perdido. Não existe "descartada".

Conclusão sobre proximidade: hoje a regra "mesma cidade" é a mais confiável. A regra dos 60 km só funciona para quem tem coordenadas. Por isso o plano inclui localizar no mapa, pela cidade, as organizações que não têm coordenadas (ver dúvida 1).

## 1. Regra única de "completa"
Completa = tem pelo menos 1 pessoa de contato com telefone ou celular, cidade + UF e responsável. O e-mail sai da regra.
- No banco, a visão `organizacao_completude` traz, para cada organização, o que falta e se está completa. Organizações descartadas ficam de fora. A visão respeita as permissões de quem consulta.
- Badge da Home, lista em Organizações e Júlia passam a ler essa mesma visão. `useOrganizacoesIncompletas` vira uma leitura dela, e `avaliarIncompletude` fica só para testes.

## 2. Descartar organização
- Novos campos: `descartada_em`, `descartada_por`, `descarte_motivo` (fechou | nao_trata_semente | duplicada | outro) e `descarte_obs`. Nada é apagado.
- A função `fn_organizacao_descartar(org, motivo, obs, autor, origem)` pode ser usada pelo responsável, admin ou gerente. Ela grava uma linha no histórico da organização e também conclui as atividades abertas dela, com o resultado "Organização descartada: motivo". Assim a cobrança some.
- "Reabrir" fica só para admin.
- Listas, badges, busca da Júlia e cobranças passam a ignorar organizações descartadas.
- Na lista de incompletas, cada organização mostra só o que falta, com campos para preencher ali mesmo (pessoa: nome, cargo e telefone; cidade/UF) e o botão "Descartar", que pede o motivo.

## 3. Júlia na ligação da viagem
Depois de fechar o dia, a Júlia pergunta de **uma única** organização incompleta do vendedor por ligação: a mais prioritária, nesta ordem:
1. mesma cidade e UF de uma parada ainda pendente da viagem ("mesma cidade da parada Coopatrigo – São Luiz Gonzaga");
2. até 60 km de uma parada pendente ou do pernoite de hoje, quando os dois lados têm coordenadas ("a 40 km do pernoite");
3. tem negócio aberto ou orçamento;
4. as demais, das que estão incompletas há mais tempo para as mais recentes.

O que acontece com cada resposta do vendedor:
- **Sabe o contato:** grava pessoa, cidade e UF. Um telefone já existente nunca é sobrescrito: se for diferente, o novo vira contato adicional e a Júlia avisa. A Júlia repete o telefone para confirmar.
- **"Vou descobrir":** cria a atividade "Pegar contato da <org>". A data é o dia em que ele passa na cidade, se for uma parada da viagem; senão, a data que ele disser. A atividade entra na cobrança que já existe.
- **"Dá pra passar lá":** a viagem não muda. Cria a atividade "Sugestão de visita: <org>" e ele adiciona a parada no app, se quiser.
- **"Não é cliente / fechou":** descarta com motivo.

Tudo fica registrado em `organizacao_levantamentos` com origem `julia` e os dados novos (pessoa, telefone, cidade e o que foi feito).

## 4. Ferramentas novas da Júlia
Ficam em `julia-viagem-ferramentas`, no mesmo padrão das atuais (`mensagem`/`salvo`, segredo e ligação ativa).
- `listar_organizacoes_incompletas {ligacao_id, rota_id}`: devolve **só 1** organização (a mais prioritária) com `{organizacao_id, nome, cidade, uf, falta[], motivo_prioridade, distancia_km}`. A mesma organização não volta em menos de 7 dias.
- `completar_organizacao {ligacao_id, organizacao_id, pessoa_nome?, pessoa_cargo?, pessoa_telefone?, cidade?, uf?, descobrir_ate?, sugerir_visita?, descartar_motivo?, descartar_obs?}`. Todas as gravações acontecem juntas, de uma vez. Repetir o mesmo pedido não grava duas vezes e devolve "já estava salvo".
- `montarPendencias` ganha o item opcional `organizacoes_incompletas`, que não bloqueia o fechamento do dia e não gera notificação.
- Documentação em `docs/julia-viagem-elevenlabs.md`: tabela de campos das 2 ferramentas para a ElevenLabs e um trecho de prompt para colar só depois da sua aprovação.

## 5. Ligação semanal de faxina (só preparada, desligada)
- `ligacoes_viagem.origem` passa a aceitar `faxina`, com `rota_id` vazio.
- Nova configuração `faxina_config` (dia da semana, hora, **1 organização por ligação**, ativo=false). Só admin edita.
- `listar_organizacoes_incompletas` funciona sem viagem, pela prioridade 3 e depois 4.
- Nada é agendado: nenhum agendamento automático, nenhuma ligação, e a ligação ativa continua desligada.

## 6. Placar semanal
A visão do placar ganha as colunas "organizações completadas" (passaram a completas na semana, pelo histórico) e "descartadas".

## SQL proposto (`docs/sql/julia-organizacoes-incompletas-proposta.sql`, testado num banco descartável antes)
```sql
ALTER TABLE public.organizacoes
  ADD COLUMN descartada_em timestamptz, ADD COLUMN descartada_por uuid,
  ADD COLUMN descarte_motivo text, ADD COLUMN descarte_obs text,
  ADD COLUMN completada_em timestamptz;           -- quando passou a completa (placar)
-- validação por gatilho: motivo em (fechou, nao_trata_semente, duplicada, outro)

ALTER TABLE public.organizacao_levantamentos
  ADD COLUMN contato_telefone text, ADD COLUMN acao text;  -- completou | descobrir | sugerir_visita | descartou
-- origem passa a aceitar 'julia' e 'faxina' (ajuste do CHECK/validação atual)

CREATE VIEW public.organizacao_completude WITH (security_invoker=true) AS
SELECT o.id, o.responsavel_id,
  NOT EXISTS (SELECT 1 FROM pessoas p WHERE p.organizacao_id=o.id
     AND coalesce(nullif(trim(p.telefone),''),nullif(trim(p.celular),'')) IS NOT NULL) AS falta_contato,
  (nullif(trim(o.cidade),'') IS NULL OR (o.estado_id IS NULL AND nullif(trim(o.estado),'') IS NULL)) AS falta_cidade_uf,
  o.responsavel_id IS NULL AS falta_responsavel
FROM organizacoes o WHERE o.descartada_em IS NULL;
-- + coluna "completa" = nenhuma falta

-- fn_organizacao_descartar(...), fn_organizacao_reabrir(...)  (admin)
-- fn_organizacoes_incompletas_priorizadas(p_vendedor, p_rota, p_limite) — cidade normalizada (sem acento/caixa),
--   distância em km pela fórmula de haversine em SQL puro (sem extensão), negócio/orçamento aberto
-- julia_completar_organizacao(p_ligacao, p_org, p_dados jsonb)  — só servidor, uma transação, sem gravar em dobro
-- gatilho em pessoas/organizacoes que preenche completada_em quando a organização passa a completa
-- atividades_placar_semanal: + organizacoes_completadas, organizacoes_descartadas
-- faxina_config (app_flags-like) + ligacoes_viagem.rota_id NULL quando origem='faxina'
```
Organizações já descartadas ficam fora da busca da Júlia (`julia_buscar_organizacao`), mudando só o filtro.

## Arquivos
- `src/hooks/useOrganizacoesIncompletas.ts`, `src/pages/Organizacoes.tsx`, `src/pages/Home.tsx`: regra nova, edição no lugar e Descartar.
- Novo `src/components/organizacao/DescartarOrganizacaoDialog.tsx` e `CompletarOrganizacaoInline.tsx`.
- `src/pages/OrganizacaoDetalhe.tsx`: aviso "Descartada (motivo)" e botão Reabrir para admin.
- `supabase/functions/_shared/pendenciasDia.ts` e testes: item opcional.
- `supabase/functions/julia-viagem-ferramentas/` (+ testes de normalização do telefone e da UF).
- `src/components/atividade/PlacarAtividades.tsx`: 2 colunas novas.
- `docs/julia-viagem-elevenlabs.md`, `AGENTS.md`.

## Dúvidas
1. **Coordenadas:** posso localizar no mapa, uma vez, as cerca de 45 organizações sem latitude/longitude, usando cidade + UF pelo Google, que o projeto já usa? Seriam cerca de 45 consultas, e organizações novas seriam localizadas ao salvar. Sem isso, os 60 km só valem para 23 das 61 incompletas, e "mesma cidade" continua funcionando para todas.
2. **Descartada x status:** prefiro campos próprios de descarte e não mexer no `status`, que é usado no funil. Pode ser assim?
3. **Telefone da empresa** (`telefone_principal`) sem nenhuma pessoa cadastrada: conta como completa? Minha sugestão é que não, porque o pedido é ter uma pessoa de contato.
4. **Raio:** fixo em 60 km, ou configurável na tela de viagens?
