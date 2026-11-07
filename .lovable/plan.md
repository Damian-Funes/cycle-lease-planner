# Notificações push do CRM via PushAlert

## Como está hoje (verificado)
- O projeto não tem nenhum service worker, PWA, manifest, `vite-plugin-pwa` ou script de push. Em `public/` existem só favicon, logo, placeholder e robots. Então não há conflito com `/sw.js`.
- A tabela `notificacoes` tem estas colunas: user_id, tipo, titulo, texto, link, chave, lida_em, resolvida_em, rota_id e created_at. Também tem uma chave única `(user_id, chave)`, que os sincronizadores usam com upsert.
- Tipos em uso hoje: `julia_viagem`, `viagem_pendencia` e `atividade_vencida`.

## 1. Script, service worker e iPhone
- **Script:** um carregador injeta `https://cdn.pushalert.co/unified_da99e6c9a1ae793c0b52edabdb883bf1.js` no `<head>`. Ele só roda quando o `location.hostname` é `crmls.com.br` ou `www.crmls.com.br`. Nunca carrega no preview, em `*.lovable.app` ou dentro de iframe. A checagem fica num script inline no `index.html`, antes de `</head>`.
- **`public/sw.js`:** fica previsto com o conteúdo que o CEO copiar do painel, normalmente uma linha `importScripts(...)`. O Vite serve `public/` sem alterar, em `/sw.js`. Não é PWA e não tem cache offline: o arquivo serve só para mensagens. Enquanto o conteúdo não chegar, o arquivo não é criado.
- **`public/manifest.webmanifest`:**
  - name e short_name "CRM LS", `start_url "/"`, `display "standalone"`;
  - cor esmeralda;
  - ícones de 192 e 512 px (normal e maskable), gerados a partir do logo.
  - Tags no `index.html`: manifest, apple-touch-icon, theme-color e `apple-mobile-web-app-capable`.
- **Sem pedido automático:**
  - No painel do PushAlert, desligar o opt-in automático.
  - No código, usar `pushalertbyiw.push(['disableAutoInit', true])` e, ao tocar no botão, `PushAlertCo.forceSubscribe()`.
  - O nome exato da função ainda não está confirmado. O primeiro passo da implementação é verificar na documentação do script unificado. Se não existir, o plano B é deixar só o prompt manual configurado no painel e disparar pelo botão.
- **Tela "Ativar notificações":**
  - **iPhone fora do modo app** (`navigator.standalone`, `display-mode`): passo a passo (Compartilhar → Adicionar à Tela de Início → abrir pelo ícone → Ativar). Para iOS abaixo de 16.4, mostra "não compatível".
  - **iPhone no modo app, Android e desktop:** botão "Ativar notificações".
  - **Estados:** ativo neste aparelho / bloqueado (como liberar nos ajustes) / não suportado.
  - **Acesso:** item com status no perfil e um aviso na tela inicial enquanto não estiver ativo.

## 2. Vincular o aparelho ao usuário
- Nova tabela `push_inscricoes`, com vários aparelhos por usuário:
  - campos: id, user_id, subscriber_id (único), plataforma (ios, android, desktop), user_agent (curto, até 120 caracteres), criado_em, ultimo_envio, ativo e motivo_inativo.
  - Leitura: cada usuário vê as suas; o admin vê todas.
  - Gravação: só pelas RPCs.
- Depois do `onSuccess` ou do `getSubsInfo`, o app chama `fn_push_registrar(subscriber_id, plataforma, user_agent)`. Ela grava com o `auth.uid()`. Se o subscriber já existir com outro usuário, ela reatribui ao usuário atual e reativa. Ao abrir o app logado, a mesma chamada confirma o vínculo.
- O user_id também vai como atributo no PushAlert (`addAttributes`), só para conferência no painel. O envio sempre usa o nosso vínculo.
- Ao sair do CRM, a RPC `fn_push_desativar(subscriber_id)` desativa a inscrição. Assim um aparelho compartilhado não recebe o push do usuário anterior.

## 3. Envio sem duplicar
- **Edge function `push-enviar`:**
  - Sem JWT, aceita só o segredo interno. Usa `PUSHALERT_API_KEY` com o header `Authorization: api_key=<KEY>`.
  - Para cada aparelho ativo do user_id, faz `POST https://api.pushalert.co/rest/v1/send` com subscriber, title, message, url (`https://crmls.com.br` + link) e icon.
- **Gatilho:** trigger `AFTER INSERT` em `notificacoes` com `net.http_post` (pg_net), filtrando o tipo dentro do trigger. É melhor que database webhook porque fica versionado e só chama a função quando o tipo vira push.
- **Duplicidade:** só dispara no INSERT.
  - Upserts `ON CONFLICT DO UPDATE` não disparam.
  - Quando `lida_em` volta a NULL, também não dispara. As chaves diárias já criam uma linha nova por dia, então o push do dia seguinte sai normalmente.
  - Novas colunas `push_status` (pendente, enviado, adiado, sem_aparelho, erro) e `push_enviado_em`. A função só envia se o status ainda for pendente ou adiado, então uma nova tentativa não repete o push.
- **Falha da PushAlert:** não afeta o sininho (o pg_net é assíncrono). Fica registrada em `push_status`.

## 4. Tipos que viram push
| Push | Urgente (ignora o horário silencioso) |
|---|---|
| Atividade vencida / do dia | não |
| Trava de orçamento | não |
| "X marcou para você" (admin pela Júlia) | não |
| Rota aprovada / reprovada / devolvida | não |
| Rota aguardando aprovação (admin) | não |
| Ligação da Júlia caída / não concluída | sim |
| Alerta de gasto da Júlia (admin) | sim |

Ficam só no sininho:
- `viagem_pendencia` repetitiva;
- informativos;
- sincronizações.

A lista fica na tabela `push_tipos` (tipo, ativo, urgente), editável pelo admin.

**Horário silencioso (21h–7h, horário de Brasília):** pushes não urgentes ficam como `adiado`. Um agendamento diário às 7h BRT envia um push por usuário ("Você tem 3 avisos"). Ele roda uma vez por dia.

## 5. Texto do push
- O texto é montado por uma função pura `montarPush(notificacao)`, com testes:
  - **título:** curto, por tipo ("Atividade vencida");
  - **mensagem:** pode ter o nome da empresa e a data;
  - nunca valores em R$, preços, telefones, custos ou notas.
- O `texto` bruto da notificação não é reaproveitado, porque aparece na tela bloqueada.

## 6. Admin e perfil
- **Configurações → cartão "Notificações no celular":**
  - time comercial com status ativo/sem push, quantidade de aparelhos, plataforma e último envio;
  - filtro "sem push" para cobrar o time;
  - lista dos últimos erros.
- **Botão "Enviar push de teste para mim":** envia para todos os aparelhos ativos de quem clicou.
- **Perfil/tela inicial:** item "Ativar notificações" com status.

## 7. Erros e inscrições inválidas
- Se a PushAlert responder com subscriber inválido, cancelado ou não encontrado, a inscrição fica com `ativo=false` e o motivo.
- Outros erros ficam na notificação como `erro`, sem desativar a inscrição.
- Quando o usuário reativa no aparelho, a inscrição volta pela RPC.

## O que o CEO faz no painel do PushAlert
1. Desligar o prompt/opt-in automático (Settings → Opt-in), deixando a inscrição manual pelo botão.
2. Enviar o conteúdo do `sw.js` mostrado em Integrate.
3. Definir o ícone padrão (logo LS, 192 px ou mais) e o idioma português nas mensagens de permissão e de boas-vindas. Desligar a notificação de boas-vindas.
4. Ativar o suporte a Safari/iOS, se houver opção.
5. Copiar a REST API Key em Settings → API e cadastrar como `PUSHALERT_API_KEY` nos segredos.
6. Conferir os limites do plano grátis: envios por API, atributos e marca "via PushAlert".

## Riscos
- **iPhone:** só funciona pela Tela de Início no iOS 16.4+. Parte do time vai precisar de ajuda. O painel mostra quem falta.
- **Pedido manual:** se o script unificado não permitir pedir a permissão só via JS, é necessário o ajuste no painel (plano B acima).
- **Domínio:** o push fica preso à origem cadastrada. `www` e o domínio sem `www` são origens diferentes. Recomendação: manter `www` redirecionando para `crmls.com.br`.
- **Plano grátis:** pode limitar envios por API ou colocar marca no push.
- **Permissão negada:** só é revertida nos ajustes do celular. A tela explica como.
- **Excesso de pushes:** o time acaba desligando. Isso é mitigado pela lista fechada, pelo máximo de um push por item por dia e pelo horário silencioso.
- **Dependência de terceiro:** se a PushAlert cair, o sininho continua normal.

## Detalhes técnicos
- **SQL (proposta em `docs/sql/push-pushalert-proposta.sql`, aplicada só após aprovação):**
  - tabelas `push_inscricoes` e `push_tipos`, com grants e RLS;
  - colunas `push_status` e `push_enviado_em` em `notificacoes`;
  - RPCs `fn_push_registrar` e `fn_push_desativar`;
  - trigger AFTER INSERT com pg_net;
  - agendamento das 7h BRT (10h UTC) para os adiados.
- **Código:**
  - `src/lib/push/` (carregador por domínio, detecção de plataforma);
  - tela `AtivarNotificacoes`;
  - `public/manifest.webmanifest` e ícones;
  - `public/sw.js` (quando chegar o conteúdo);
  - edge function `push-enviar` com `_shared/push.ts` (montarPush, horário silencioso, classificação de erro), com testes;
  - cartão admin.
