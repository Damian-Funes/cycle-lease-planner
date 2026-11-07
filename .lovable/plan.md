# Filtro no Twilio antes da ElevenLabs (+55 11 5039-3814)

## Objetivo
Número que não é do comercial não é atendido: o Twilio recusa a chamada antes de a ElevenLabs entrar, sem custo de voz.

```text
Hoje:     Twilio -> ElevenLabs (inbound_call) -> julia-viagem-entrada
Proposto: Twilio -> julia-twilio-filtro --(autorizado: Redirect)--> ElevenLabs -> julia-viagem-entrada
                                         \--(não autorizado: Reject busy)
```

## Situação atual (conferida)
- **Não existe nenhum segredo do Twilio no projeto.** Hoje existem só segredos da Júlia, do RD, Google Maps, QualP, Resend e Rotas Brasil.
- A regra de quem pode ligar está dentro da `julia-viagem-entrada`: os papéis comercial, rtv e gerente_comercial ficam fixos no código, mais a exceção do Damian via `permitidoLigar`; o celular vem de `profiles.celular` via `chaveTelefone`.

## O que será feito
1. **Regra única em `_shared`**: criar `vendedorPorTelefone(db, telefone)` com a regra hoje dentro da `julia-viagem-entrada`. Ela devolve o perfil, se é vendedor e se é teste. A `julia-viagem-entrada` passa a usar essa função, sem mudar o comportamento.
2. **Nova função `julia-twilio-filtro`**: sem JWT, recebe POST no formato do Twilio.
   - Valida o `X-Twilio-Signature`: HMAC-SHA1 da URL pública exata mais os parâmetros em ordem alfabética, com o `TWILIO_AUTH_TOKEN`, comparado em tempo constante. Se a assinatura for inválida ou faltar, recusa.
   - Lê o `From` e aplica a regra única.
   - **Autorizado**: devolve `<Response><Redirect method="POST">https://api.us.elevenlabs.io/twilio/inbound_call</Redirect></Response>`. A URL da ElevenLabs fica num segredo opcional `JULIA_ELEVENLABS_INBOUND_URL`, com esse valor como padrão.
   - **Não autorizado**: devolve `<Response><Reject reason="busy"/></Response>`. A chamada não é atendida e não há cobrança de chamada atendida.
   - O log guarda só o número mascarado (4 últimos dígitos), a decisão e o tempo.
3. **Testes**: assinatura válida, inválida e com parâmetro alterado (usando o exemplo oficial do Twilio); TwiML de redirect e de reject; e a mesma decisão do filtro e da entrada para os mesmos papéis.
4. **Guia**: atualizar `docs/julia-ligacao-recebida.md` com o passo a passo e como voltar atrás.
5. **`julia-viagem-entrada` continua como segunda barreira**, com a mesma frase curta de recusa.

## Recomendação para falha interna (banco fora do ar ou demora)
Recomendo **deixar passar** nesses casos, mas só com assinatura válida:
- Se o filtro falhar, a `julia-viagem-entrada` ainda recusa quem não é do comercial com a frase curta. O custo é de poucos segundos de ElevenLabs.
- Recusar na falha deixaria os vendedores sem atendimento sempre que o banco oscilasse.
- Há um limite de 3 s para a consulta; passou disso, deixa passar.
- **Assinatura inválida sempre recusa.**

Se o CEO preferir zero gasto mesmo nas falhas, troca-se por recusar. É uma linha de código.

## Riscos
- **A ElevenLabs aceitar o redirect**: no `<Redirect>`, o Twilio faz uma nova requisição assinada para a URL de destino. Se a ElevenLabs conferir a assinatura, ela confere com a própria URL e deve bater. Não há documentação oficial da ElevenLabs sobre receber redirect. **Primeiro passo da implementação**: testar com o celular de um vendedor antes de deixar fixo. Se falhar, basta colar de volta a URL da ElevenLabs.
- **A ElevenLabs reescrever o endereço do número**: ao reimportar o número ou mexer na integração com o Twilio, ela pode gravar de novo a URL dela. O filtro some em silêncio, mas a `julia-viagem-entrada` continua barrando quem não é do comercial. Mitigação:
  - O guia avisa para conferir o endereço depois de qualquer mudança na ElevenLabs.
  - Opcional: um alerta no log quando a entrada recusar um número de fora, o que indica que o filtro foi contornado.
- **Demora extra**: uma ida a mais até a nossa função, com uma consulta leve. Estimativa: 150 a 400 ms, e mais na primeira chamada depois de um tempo parada. Fica dentro do toque.
- **URL usada na assinatura**: precisa ser exatamente a configurada no Twilio, `https://sycqtlxoidsbsvrsvqes.supabase.co/functions/v1/julia-twilio-filtro`, sem barra no fim. A função monta essa URL a partir de uma constante, não do cabeçalho recebido.
- **Cadastro do vendedor**: um vendedor sem celular, ou com celular errado, passa a ouvir "ocupado" em vez da frase da Júlia. O log mostra o motivo com o número mascarado.
- **Assinatura com chave de API**: a assinatura do Twilio usa o Auth Token principal da conta, não uma API Key.

## Ligações de saída
Não passam pelo filtro. Quando a Júlia liga, quem cria a chamada é a ElevenLabs pela API do Twilio, com instruções próprias. O endereço "A call comes in" vale só para chamadas que entram no número.

## Passo a passo para o CEO
1. **Cadastrar o segredo**: no Twilio, em Console → Account → API keys & tokens → **Auth Token** (Live), clicar em mostrar e copiar. No Lovable, em Project Settings → Secrets, criar `TWILIO_AUTH_TOKEN` com esse valor. Eu peço isso na hora certa.
2. **Ligar o filtro** (só depois do deploy e do teste): Phone Numbers → Manage → Active numbers → +55 11 5039 3814 → Voice Configuration.
   - Em "A call comes in", escolher **Webhook**.
   - URL: `https://sycqtlxoidsbsvrsvqes.supabase.co/functions/v1/julia-twilio-filtro`
   - Método **HTTP POST**.
   - **Antes de salvar, anotar a URL atual da ElevenLabs.**
3. **Testar**: ligar de um celular de vendedor, que deve cair na Júlia normalmente. Depois ligar de um número de fora, que deve dar ocupado.
4. **Voltar atrás**: no mesmo campo, colar de volta `https://api.us.elevenlabs.io/twilio/inbound_call`, método POST, e salvar.

## Detalhes técnicos
- Arquivos novos: `supabase/functions/julia-twilio-filtro/index.ts`, `filtro_test.ts`, `_shared/twilioAssinatura.ts` (função pura) e `_shared/vendedorTelefone.ts`.
- `supabase/config.toml`: `[functions.julia-twilio-filtro] verify_jwt = false`.
- A resposta é `Content-Type: text/xml`. O corpo é lido com `req.formData()` e só aceita POST.
- Não há mudança no banco de dados.
