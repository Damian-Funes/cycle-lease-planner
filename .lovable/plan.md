# Júlia — hotel sem valor, nova tentativa após caixa postal, pergunta "visitou mais alguém?"

Regra mantida: todo SQL vai como proposta em `docs/sql/julia-hotel-caixa-postal-extras-proposta.sql` e só é aplicado após o OK explícito do CEO (teste antes em transação desfeita com os dados do Murilo 11/11 e do Renan 11/11).

## 1) Hotel pago pelo financeiro, sem valor

**Antes:** `registrar_pernoite` com `tipo=hotel` recusa sem valor ("Informe os campos hotel e valor real."). A noite do Murilo (Hotel Santos Dumont, Goiânia/GO, 11/11) ficou pendente.

**Depois:**
- Campo novo `pago_pela_empresa` (boolean). Com `true`, hotel é aceito sem valor (nome, cidade e UF continuam obrigatórios).
- O pernoite é gravado → a noite sai da lista de pendências da Júlia.
- O gasto do hotel fica marcado "valor a confirmar pelo financeiro/nota" (sem valor).
- Financeiro e admins recebem aviso (in-app + push via `push_regras`, prefixo `hotel_empresa:`), sem R$.
- A pendência `nota_hotel` continua igual. A viagem continua não podendo ser concluída sem a nota; o financeiro preenche o valor ao lançar/conferir a nota.

**SQL proposto (resumo):**
- `rota_pernoites` e `rota_gastos`: coluna `pago_pela_empresa boolean not null default false`; valor passa a aceitar vazio só quando `pago_pela_empresa=true` (check). Primeiro passo da implementação: conferir as travas atuais de valor nessas tabelas e nos triggers (`fn_pernoites_validar` e afins) e ajustar só o necessário.
- `julia_registrar_voz` (ação pernoite): repassa a flag; insere regra `hotel_empresa:` em `push_regras`; avisa quem tem papel financeiro + admin.
- O trigger de conclusão da viagem passa a exigir valor preenchido nos hotéis pagos pela empresa ("Financeiro precisa informar o valor do hotel da noite de DD/MM").

**JSON ElevenLabs (acrescentar em `registrar_pernoite.properties`):**
```json
{ "id": "pago_pela_empresa", "type": "boolean", "value_type": "llm_prompt",
  "description": "true quando o vendedor disser que o hotel foi reservado ou pago pela empresa/financeiro e ele não sabe o valor. Nesse caso não envie valor.",
  "dynamic_variable": "", "constant_value": "", "required": false }
```
E na description de `valor`: "Obrigatório para hotel, exceto quando pago_pela_empresa=true."

**Prompt:**
> Se for hotel e o vendedor não souber o valor, pergunte uma vez: "Foi a empresa que reservou ou pagou?". Se sim, registre com pago_pela_empresa=true, sem valor, e diga: "Anotei, o financeiro confirma o valor pela nota. Só não esquece de mandar a foto da nota." Nunca invente valor.

## 2) Retorno que cai na caixa postal

**Antes:** o webhook marca a ligação como `interrompida` e avisa os admins, mas ninguém liga de novo. O retorno das 20h do Renan (11/11, `voicemail_detection`) não teve nova tentativa. `podeTentar` limita a 3 tentativas automáticas, até 22h, uma de cada tipo.

**Depois:** quando uma ligação de origem `retorno` ou `fechamento` termina com caixa postal, sem atender, ou com menos de ~20 s sem conversa (nada gravado):
- o webhook agenda UMA ligação de origem nova `retentativa_retorno` para +30 min;
- só se o horário for até 21:30 (para discar antes de 22h); se passar de 22h, não agenda;
- só uma por dia por viagem (índice único já cobre tipos diferentes de 'manual');
- na hora de discar a checagem atual de pendências decide: dia fechado → cancela e não liga.

**Limite:** subir de 3 para 4 **só** para `retentativa_retorno`. As demais continuam com 3. Assim o máximo automático do dia vira 4, e só no caso de caixa postal.

**SQL proposto:** incluir `retentativa_retorno` no check de origem de `ligacoes_viagem` (mantendo `entrada`, `manual`, `fechamento` etc.) e na lógica de reserva (`julia_reservar_ligacao`).

**Código:** função pura `precisaNovaTentativa({origem, motivo, duracao_s, gravou, hora})` em `_shared/juliaWebhook.ts` + teste com o caso do Renan (20h, voicemail → agenda 20:30; 21:45 → não agenda; dia fechado → não liga); `podeTentar` aceita a nova origem com limite 4.

## 3) "Visitou mais alguém que não estava na rota?"

**Resposta:** dá para fazer só com prompt, mas fica frágil: a Júlia pode esquecer, ou perguntar de novo em cada ligação. Proposta: pendência leve `confirmar_extras`, uma vez por dia, **sem SQL novo**. Ela aparece em `montarPendencias` (modo `completo`) quando há parada do dia resolvida e ainda não foi respondida. A resposta fica gravada como entrada no diário da viagem ("Júlia — extras: não" / "sim"), pela ação nova `confirmar_extras` (`resposta: sim|nao`). Ela não bloqueia o fechamento nem gera ligação ou aviso sozinha: o cron ignora essa pendência ao decidir se liga.

**Prompt pronto:**
> Antes de encerrar o fechamento do dia, se a pendência confirmar_extras aparecer, pergunte uma única vez: "Visitou mais alguém hoje que não estava na rota?".
> - Se não: chame confirmar_extras com resposta "nao" e siga para o encerramento.
> - Se sim: para cada empresa, chame buscar_organizacao (nome + cidade). Com a empresa identificada, chame adicionar_parada (com organizacao_id, ou nome_empresa+cidade+uf se não existir). Depois chame registrar_visita com o parada_id devolvido. No fim, chame confirmar_extras com resposta "sim".
> - Nunca pergunte isso duas vezes no mesmo dia nem antes de resolver as paradas da rota.

JSON da ação `confirmar_extras` (formato que usamos) vai no fim de `docs/julia-viagem-elevenlabs.md`.

## Riscos
- **Hotel:** se a nota nunca chegar, o valor fica em aberto. Mitigação: a viagem não conclui sem valor e nota, e o financeiro é avisado. Relatórios de custo podem somar R$ 0 nesses dias: vou mostrar "a confirmar" onde o valor aparece.
- **Caixa postal:** a detecção do ElevenLabs pode errar (vendedor atendeu e desligou rápido). Isso causa no máximo uma ligação extra, e a checagem na hora de discar evita ligar se o dia já fechou.
- **Limite 4:** custo extra pequeno (uma ligação a mais por dia, só nesse caso). O painel de gasto já registra.
- **Extras:** o vendedor pode responder "não" e ter visitado alguém, e o sistema não tem como saber. A pergunta reduz, mas não elimina, esse caso.
- Funções legadas `julia-*` não são tocadas. Só `julia-viagem-*` e `_shared`.

## Ordem
1. Escrever o SQL proposto e o código/testes (sem aplicar).
2. Mostrar ao CEO → após o OK: testar em transação desfeita (Murilo, Renan), aplicar, publicar `julia-viagem-ferramentas`, `julia-viagem-webhook`, `julia-viagem-ligar`.
3. Você cola na ElevenLabs o campo novo, a ação `confirmar_extras` e os trechos de prompt.
