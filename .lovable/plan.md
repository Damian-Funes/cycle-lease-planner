# Notificações push do CRM via PushAlert

## Como está hoje (verificado)
- Não existe nenhuma integração de push: nenhum script, service worker, manifest ou segredo do PushAlert. Em `public/` só há favicon, logo, placeholder e robots.
- `notificacoes` tem as colunas: user_id, tipo, titulo, texto, link, chave, lida_em, resolvida_em, rota_id e created_at. Existe uma chave única `(user_id, chave)`, então os sincronizadores já fazem upsert por chave.
- Tipos que aparecem hoje: `julia_viagem` (17), `viagem_pendencia` (4) e `atividade_vencida` (1).

## 1. Front-end (só em crmls.com.br)
- O PushAlert exige um arquivo próprio na raiz: `public/sw.js` com uma linha `importScripts("https://cdn.pushalert.co/sw-XXXX.js")` (o CEO passa o código). O Vite copia `public/` sem mexer, então o arquivo é servido em `/sw.js`.
- Não existe PWA nem outro service worker, logo não há conflito. Não vamos adicionar `vite-plugin-pwa` nem cache offline: o worker serve só para mensagens.
- Um carregador `src/lib/push/pushalert.ts` injeta o script do PushAlert apenas quando o endereço é `crmls.com.br` ou `www.crmls.com.br`. Nada carrega no preview, em `*.lovable.app` ou dentro de iframe.
- `www` e o domínio sem `www` são origens diferentes para o push. Recomendação: o CEO cadastra `https://crmls.com.br` no PushAlert e `www` redireciona para ele (já é o domínio principal).

## 2. iPhone e Android
- Criar `public/manifest.webmanifest` com nome "CRM LS", short_name "CRM LS", `display: standalone`, cor tema esmeralda e ícones de 192/512 px gerados a partir do logo. Incluir as tags no `index.html` (manifest, apple-touch-icon, theme-color, `apple-mobile-web-app-capable`).
- Nova tela "Ativar notificações" (menu do usuário e um aviso no sininho enquanto não estiver ativado):
  - **iPhone fora do modo app** (detectado por `navigator.standalone` / `display-mode: standalone`): passo a passo ilustrado (Compartilhar → Adicionar à Tela de Início → abrir pelo ícone → Ativar). Se o iOS for anterior à 16.4, avisar que não é compatível.
  - **iPhone no modo app e Android/desktop:** botão "Ativar notificações". O pedido de permissão só aparece depois do toque, como o iOS exige.
  - Mostra o estado: ativo neste aparelho, bloqueado (como liberar nos ajustes) ou não suportado.

## 3. Vincular o aparelho ao usuário
- Nova tabela `push_inscricoes`: id, user_id, subscriber_id (único), plataforma (ios/android/desktop), navegador, criado_em, ultimo_uso, ativo, desativado_motivo. Permite vários aparelhos por usuário.
- Depois de inscrever, o callback do PushAlert (`pushalertbyiw` → `onSuccess` / `getSubsInfo`) devolve o subscriber_id. O app chama a RPC `fn_push_registrar(subscriber_id, plataforma, navegador)`, que grava com o `auth.uid()`, reativa se já existir e transfere o aparelho se outro usuário logar nele. Ao abrir o app, `ultimo_uso` é atualizado.
- Quem vê: cada usuário vê as próprias inscrições; o admin vê todas. Escrita só pela RPC; o desativar/excluir é do próprio usuário ou do admin.
- Também enviamos `user_id` como atributo no PushAlert (`addAttributes`), útil para depuração no painel deles. O envio usa sempre o nosso vínculo.
- Ao sair do CRM: desativa a inscrição do aparelho, para o próximo usuário dele não receber pushes de outra pessoa.

## 4. Envio
- Nova edge function `push-enviar` (sem JWT, protegida por segredo interno), que lê `PUSHALERT_API_KEY`. Para cada aparelho ativo do user_id, faz `POST https://api.pushalert.co/rest/v1/send` com `subscriber`, title, message e url (`https://crmls.com.br` + link).
- Gatilho: um trigger `AFTER INSERT` em `notificacoes` chama `net.http_post` (pg_net) com o id da notificação, só para tipos que viram push. Recomendo pg_net em vez de database webhook, porque fica versionado na migração e permite filtrar o tipo dentro do trigger.
- Duplicidade:
  - Só o INSERT dispara push. Upserts por `(user_id, chave)` com `ON CONFLICT DO UPDATE` não reenviam.
  - Novas colunas `push_enviado_em` e `push_status`: a função marca a notificação antes de enviar e ignora se já estiver marcada, o que torna novas tentativas idempotentes.
  - As chaves diárias (ex.: `atividade_vencida:<id>:<data>`) geram no máximo um push por dia por item.
  - Alterações em texto ou `resolvida_em` nunca enviam.
- Falhas: um erro da PushAlert não afeta a gravação da notificação (pg_net é assíncrono). Fica no `push_status` e no log.

## 5. Quais tipos viram push
Viram push:
- `atividade_vencida` e atividade do dia (lembrete das 7h);
- trava de orçamento (atividade travando novo orçamento);
- "X marcou para você" (atribuição do admin pela Júlia);
- rota aprovada / reprovada / devolvida;
- ligação da Júlia caída ou não concluída;
- alertas de admin (gasto da Júlia acima do limite, rota aguardando aprovação).

Ficam só no sininho:
- `viagem_pendencia` repetitiva (o push sai uma vez por dia, no resumo);
- avisos informativos e sincronizações.

A lista fica numa tabela de configuração `push_tipos` (tipo, ativo, urgente), que o admin pode ajustar.

**Horário silencioso** (21h–7h, horário de Brasília): pushes não urgentes ficam com `push_status='adiado'`. Às 7h, um único agendamento diário envia o acumulado, agrupado por usuário ("Você tem 3 avisos"). Urgentes (ex.: alerta de gasto do admin, ligação caída em andamento) saem na hora.

## 6. Privacidade
- **Título:** curto e por tipo ("Atividade vencida", "Rota aprovada").
- **Texto:** pode ter o nome da empresa e a data, sem valores, preços, telefones, notas ou custos.
- Os textos são montados por uma função pura `montarPush(notificacao)`, com testes. Não reaproveitamos o `texto` bruto da notificação.
- O push aparece na tela bloqueada, então nada além disso deve ir nele.

## 7. Painel do admin
Em Configurações, cartão "Notificações no celular":
- lista do time comercial com push ativo / sem push / último uso e quantidade de aparelhos;
- botão "Enviar push de teste para mim" (para quem é admin);
- botão "Enviar teste" para cada usuário;
- lista dos últimos envios com falha.

## 8. Inscrições expiradas
- Se a PushAlert responder que o subscriber é inválido ou cancelado, a função marca `ativo=false` com o motivo.
- Uma inscrição sem uso há 60 dias aparece como "inativa?" no painel, sem ser apagada.
- Quando o usuário reativa no aparelho, a inscrição volta a valer.

## O que o CEO faz no PushAlert
1. Cadastrar o site `https://crmls.com.br`, com nome "CRM LS" e ícone.
2. Em Integrate, copiar o código do script (o ID do site) e a linha do service worker, e enviar.
3. Em Settings → API, copiar a REST API Key e cadastrar como `PUSHALERT_API_KEY` nos segredos do projeto.
4. Desligar o pedido automático de inscrição (opt-in prompt/box), porque o app controla o botão.
5. Ativar o suporte a Safari/iOS, se houver opção.

## Riscos
- **iPhone:** só funciona pela Tela de Início no iOS 16.4+. Parte do time vai precisar de ajuda. O painel mostra quem falta.
- **Plano grátis do PushAlert:** pode ter limites de envio por API, de atributos ou marca no push. Confirmar no painel antes de liberar para todos.
- **Bloqueio de permissão:** se o usuário negar, só é possível reverter nos ajustes do celular. A tela explica como.
- **Domínio:** pushes ficam presos ao domínio cadastrado. Trocar de domínio exige reinscrever todos.
- **Excesso de pushes:** vira ruído e o time desliga. Por isso a lista fechada, o máximo de um por item por dia e o horário silencioso.
- **Aparelho compartilhado:** tratado com a desativação ao sair.
- **Suporte limitado:** o PushAlert é um serviço terceiro sem suporte formal por aqui. Se sair do ar, o sininho continua funcionando normalmente.

## Detalhes técnicos
- **SQL (proposta em `docs/sql/push-pushalert-proposta.sql`, só aplicado após aprovação):**
  - tabelas `push_inscricoes` e `push_tipos`, com grants e RLS;
  - colunas `push_enviado_em` e `push_status` em `notificacoes`;
  - RPCs `fn_push_registrar` e `fn_push_desativar`;
  - trigger AFTER INSERT com pg_net;
  - agendamento diário às 7h BRT (10h UTC) para os adiados.
- **Código:**
  - `src/lib/push/` (carregador, detecção de plataforma);
  - tela `AtivarNotificacoes`;
  - `public/sw.js` e `public/manifest.webmanifest`;
  - edge function `push-enviar` com `_shared/push.ts` (montarPush, regra de horário silencioso, testes);
  - cartão admin.
- **Para começar:** precisamos do código de integração e da API key.
