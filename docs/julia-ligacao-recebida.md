# Júlia — ligação recebida (vendedor liga para +55 11 5039-3814)

Função: `julia-viagem-entrada` (webhook de iniciação). SQL: `docs/sql/julia-ligacao-entrada-proposta.sql` (aplicar antes de ativar).

## O que a função devolve
| Situação | `permitido` | Primeira fala |
|---|---|---|
| Número não é do comercial | `nao` | "Oi! Esse número é exclusivo da equipe comercial da LS. Até mais!" |
| Vendedor sem viagem aprovada hoje | `sem_viagem` | "Oi, <nome>! Não achei viagem em andamento hoje…" |
| Já há ligação em andamento | `ocupado` | "…Já tem uma ligação minha em andamento com você…" |
| Falha interna | `erro` | "Tive um problema aqui, tenta de novo em instantes." |
| Vendedor com viagem | `sim` | "Oi, <nome>! Aqui é a Júlia. Em que posso ajudar? Quer fechar o dia agora?" |

Com `sim`, vêm as mesmas variáveis da ligação feita (`vendedor_nome`, `rota_id`, `ligacao_id`, `pendencias`, `visitadas_hoje`, `ja_registradas_hoje`, `ja_registradas_hoje_frase`, `contatos_paradas`, `ultimo_dia`, `teste`…) + `origem="entrada"`. Retornos agendados ainda não discados são cancelados ("Vendedor ligou").

## Passo a passo na ElevenLabs
1. Criar o segredo `JULIA_ENTRADA_SECRET` no projeto (valor aleatório forte).
2. Agents Platform → Settings → **Conversation initiation client data webhook**: URL `https://sycqtlxoidsbsvrsvqes.supabase.co/functions/v1/julia-viagem-entrada`, cabeçalho `x-julia-secret` = mesmo valor.
3. Agente **Júlia - Comercial** → Security: ligar **Fetch conversation initiation data for inbound Twilio calls** e permitir override de **First message**.
4. Agente → declarar variáveis `permitido` e `origem` (padrão vazio, para a ligação feita não quebrar).
5. Phone Numbers → +55 11 5039-3814 → **Inbound agent** = Júlia - Comercial. A saída continua pelo número configurado em `ELEVENLABS_PHONE_NUMBER_ID`.
6. O webhook pós-ligação (`julia-viagem-webhook`) não muda: ele vincula a ligação recebida pelo `ligacao_id`.

## Trecho do prompt
```text
Se {{permitido}} for "nao", "sem_viagem", "ocupado" ou "erro": fale só a primeira mensagem e encerre com end_call. Não chame nenhuma outra ferramenta.
Se {{origem}} for "entrada": foi o vendedor quem ligou. Não pergunte se é uma boa hora; siga o fluxo normal de pendências.
```

## Rejeitar sem atender
- A (atual): a Júlia atende, fala uma frase e encerra — poucos segundos de custo.
- B: filtrar no Twilio (Function/TwiML com `<Reject>` antes de encaminhar à ElevenLabs) — sem custo de voz, mas tira o número da integração nativa.
- A resposta do webhook de iniciação não tem como recusar a chamada.
