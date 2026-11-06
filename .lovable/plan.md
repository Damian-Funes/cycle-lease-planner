# Ligação recebida: o vendedor liga para a Júlia

Número: +55 11 5039-3814 (Twilio, já conectado à ElevenLabs). A Júlia só atende o comercial.

## Fluxo

```text
Vendedor liga -> Twilio -> ElevenLabs (agente "Júlia - Comercial")
   -> webhook de iniciação (antes de a Júlia falar) -> julia-viagem-entrada
        não é vendedor   -> permitido="nao"        -> recado curto e encerra
        vendedor sem viagem hoje -> permitido="sem_viagem" -> avisa e encerra
        vendedor com viagem aprovada hoje -> permitido="sim" + mesmas variáveis da ligação de saída
   -> fim da ligação -> julia-viagem-webhook (igual hoje)
```

## O que construir

1. **Função nova `julia-viagem-entrada`** (chamada pela ElevenLabs, protegida por segredo no cabeçalho `x-julia-secret`, comparação em tempo constante).
   - Lê `caller_id` e `called_number`; normaliza o número para +55DDDNNNNNNNNN (aceita com/sem 55, com/sem 9º dígito ao comparar).
   - Procura em `profiles.celular` um usuário com papel `comercial`, `rtv` ou `gerente_comercial`; o Damian (admin) entra só como teste (`teste="sim"`, usa a viagem escolhida no último teste ou a primeira aprovada de hoje).
   - Não achou: `permitido="nao"`, `first_message` = "Oi! Esse número é exclusivo da equipe comercial da LS. Até mais!". Nada é gravado em `ligacoes_viagem` (só log sem o número completo).
   - Vendedor sem viagem aprovada hoje: `permitido="sem_viagem"`, `first_message` = "Oi, <nome>! Não achei viagem em andamento hoje para você. Qualquer coisa, me chama pelo app. Até mais!".
   - Vendedor com viagem hoje:
     - cancela retornos/ligações agendadas dele hoje ainda não discadas (`agendada`, `aguardando_escolha`) com motivo "Vendedor ligou";
     - se já houver uma ligação `discando`/`em_andamento` dele, não cria outra: devolve `permitido="ocupado"` (a Júlia diz que já está em ligação e encerra);
     - reserva a ligação com origem `entrada`, status `em_andamento`, telefone = número de quem ligou;
     - devolve as mesmas variáveis da saída + `origem="entrada"`, `permitido="sim"`.
   - Resposta no formato da ElevenLabs: `{ type: "conversation_initiation_client_data", dynamic_variables, conversation_config_override: { agent: { first_message } } }`.
   - Sempre responde rápido (meta < 1 s) e nunca devolve erro 500 sem variáveis: em falha, `permitido="erro"` e recado "Tive um problema aqui, tenta de novo em instantes".
2. **Variáveis compartilhadas**: extrair de `julia-viagem-ligar` para `_shared/variaveisLigacao.ts` uma função pura `montarVariaveis(contexto, ligacao, data)` (vendedor_nome, vendedor_id, rota_id, rota_nome, data_hoje, noite, ultimo_dia, ligacao_id, pendencias, visitadas_hoje, ja_registradas_hoje, ja_registradas_hoje_frase, contatos_paradas, teste). A saída e a entrada usam a mesma; teste Deno garante que as chaves são iguais.
3. **Pendências na entrada**: como na religação manual pelo admin, usa a lista completa (inclui relato da visita e a organização incompleta mais prioritária). Se não houver nada, a Júlia ainda atende ("Tudo em dia hoje; quer registrar algo?").
4. **Fim da ligação**: `julia-viagem-webhook` já fecha pelo `conversation_id`; para a entrada, o vínculo é feito pelo `ligacao_id` das variáveis (a entrada não tem `conversation_id` antes de começar). Ajustar o webhook para aceitar esse vínculo. A regra de "interrompida" vale igual.
5. **Tela de acompanhar**: rótulo "Recebida" para origem `entrada` na lista de ligações.
6. **Documentação** `docs/julia-ligacao-recebida.md`: passo a passo na ElevenLabs + trecho do prompt (abaixo).

## SQL (proposta em `docs/sql/julia-ligacao-entrada-proposta.sql`, só aplica após aprovação)

- `ligacoes_viagem.origem`: aceitar `entrada`.
- `julia_reservar_ligacao`: aceitar `entrada` sem admin (chamada só pelo servidor), tentativa seguinte, sem limite de 3, mantendo o índice "uma ativa por vendedor".
- Nenhuma tabela nova.

## Passo a passo na ElevenLabs (vai na documentação)

1. Settings (Agents Platform) -> Webhooks / "Conversation initiation client data webhook": URL `https://sycqtlxoidsbsvrsvqes.supabase.co/functions/v1/julia-viagem-entrada`, cabeçalho `x-julia-secret` = valor do segredo novo `JULIA_ENTRADA_SECRET`.
2. Agente "Júlia - Comercial" -> Security: ligar "Fetch conversation initiation data for inbound Twilio calls" e permitir override de `first_message`.
3. Phone Numbers -> +55 11 5039-3814 -> "Agent" (entrada) = "Júlia - Comercial". A saída continua pelo `ELEVENLABS_PHONE_NUMBER_ID` atual.
4. Declarar as variáveis dinâmicas novas no agente: `permitido`, `origem` (com valor padrão vazio, para a saída não quebrar).

## Trecho do prompt

```text
Se {{permitido}} for "nao" ou "sem_viagem" ou "ocupado" ou "erro": fale só a primeira mensagem e encerre a ligação com a ferramenta end_call. Não chame nenhuma outra ferramenta.
Se {{origem}} for "entrada": foi o vendedor quem ligou. Não pergunte se é uma boa hora; pergunte "Em que posso ajudar? Quer fechar o dia agora?" e siga o fluxo normal de pendências.
```

## Rejeitar antes de atender

- **Opção A (recomendada agora):** a Júlia atende, fala uma frase e encerra. Custa alguns segundos de ligação; zero mudança no Twilio.
- **Opção B:** filtrar no Twilio antes da ElevenLabs (TwiML/Function que verifica o número e faz `<Reject>` ou encaminha para a ElevenLabs). Não gasta minutos da ElevenLabs, mas tira o número da integração nativa e exige manter código no Twilio.
- A ElevenLabs não tem, hoje, uma resposta do webhook de iniciação que recuse a chamada sem atender; documentar como limitação.

## Detalhes técnicos

- Nada é ligado sem a sua configuração na ElevenLabs; sem o segredo configurado, a função responde 401.
- Testes Deno: normalização do número (com/sem 9º dígito, com/sem 55), decisão permitido/nao/sem_viagem/ocupado, mesmas chaves de variáveis entre saída e entrada, e que nunca devolve erro sem `first_message`.

## Dúvidas para você

1. O agente antigo "Júlia - LS do Brasil" está hoje como agente de entrada desse número? Se sim, trocar a entrada para "Júlia - Comercial" faz ele parar de atender quem liga — clientes que tenham esse número (das ligações antigas do bot) passariam a ouvir o recado "exclusivo da equipe comercial". Isso é aceitável?
2. A saída da Júlia de viagem usa o mesmo número? (Se usar, a mudança da entrada não afeta a saída.)
3. Posso usar a Opção A (atende e encerra) por enquanto?
