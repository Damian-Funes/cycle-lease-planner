# Júlia — ligação recebida (vendedor liga para +55 11 5039-3814)

O número é só do comercial (entrada e saída). Funções: `julia-viagem-entrada` (webhook de iniciação) e `julia-viagem-ferramentas` (ferramentas).
SQL: `docs/sql/julia-ligacao-entrada-proposta.sql` — aplicar antes de ativar.

## O que a entrada devolve
| Situação | `permitido` | `rota_id` | Primeira fala |
|---|---|---|---|
| Número não é do comercial | `nao` | vazio | "Oi! Esse número é exclusivo da equipe comercial da LS. Até mais!" |
| Já há ligação em andamento | `ocupado` | vazio | "…Já tem uma ligação minha em andamento com você…" |
| Falha interna | `erro` | vazio | "Tive um problema aqui, tenta de novo em instantes." |
| Vendedor com viagem hoje | `sim` | id da viagem | "Oi, <nome>! Aqui é a Júlia. Em que posso ajudar? Quer fechar o dia agora?" |
| Vendedor sem viagem hoje | `livre` | vazio | "Oi, <nome>! … posso registrar um contato com cliente, resolver suas atividades, completar uma empresa ou marcar um compromisso." |

Com `sim`: mesmas variáveis da ligação feita + `origem="entrada"`. Com `livre`: `vendedor_nome`, `vendedor_id`, `ligacao_id`, `data_hoje`, `origem="entrada"`, demais vazias.
Em qualquer caso de vendedor, retornos agendados ainda não discados são cancelados ("Vendedor ligou").

## Passo a passo na ElevenLabs
1. Aplicar o SQL.
2. Criar `JULIA_ENTRADA_SECRET` (Supabase → Edge Functions → Secrets) com um valor forte gerado por você.
3. Agents Platform → Settings → **Conversation initiation client data webhook**: URL `https://sycqtlxoidsbsvrsvqes.supabase.co/functions/v1/julia-viagem-entrada`, header `x-julia-secret` = mesmo valor.
4. Agente **Júlia - Comercial** → Security: ligar **Fetch conversation initiation data for inbound Twilio calls** e permitir override de **First message**.
5. Agente → declarar as variáveis `permitido` e `origem` (padrão vazio).
6. Phone Numbers → +55 11 5039-3814 → agente de entrada = **Júlia - Comercial** (a saída não muda).
7. Criar as 4 ferramentas abaixo (webhook POST) e ajustar as 3 existentes para aceitar `rota_id` vazio.

## Ferramentas (todas iguais na parte fixa)
- URL: `https://sycqtlxoidsbsvrsvqes.supabase.co/functions/v1/julia-viagem-ferramentas`, método POST
- Headers: `x-julia-secret` = `JULIA_TOOL_SECRET` (o mesmo das ferramentas atuais), `x-region` = `sa-east-1`
- Corpo — sempre: `acao` (constante), `ligacao_id` = `{{ligacao_id}}`, `rota_id` = `{{rota_id}}` (pode vir vazio)

### registrar_contato_cliente (acao constante `registrar_contato_cliente`)
| Campo | Tipo | Obrig. | Descrição para o LLM |
|---|---|---|---|
| organizacao_id | string | sim | id vindo de buscar_organizacao |
| canal | string | sim | telefone, whatsapp, visita, email ou outro |
| resultado | string | sim | o que aconteceu no contato (frase completa, mín. 10 letras) |
| contato_nome | string | não | nome de quem atendeu |
| contato_cargo | string | não | cargo dessa pessoa |
| decisores | string | não | "Nome (Cargo), Nome (Cargo)" |
| sacos_safra | number | não | sacos por safra |
| equipamento_atual | string | não | |
| problema_principal | string | não | |
| interesse | string | não | alto, medio ou baixo |
| motivo_interesse | string | não | |
| objecoes | array de string | não | |
| concorrente | string | não | |
| proximo_passo | string | não | o que ficou combinado |
| proximo_passo_data | string | não | AAAA-MM-DD; cria atividade às 9h |

### listar_atividades_vencidas (acao constante `listar_atividades_vencidas`)
Sem campos extras. Devolve até 10 atividades abertas do vendedor, vencidas e de hoje (`atividades`: `atividade_id`, `titulo`, `tipo`, `data`, `hora`, `empresa`, `vencida`).

### resolver_atividade (acao constante `resolver_atividade`)
| Campo | Tipo | Obrig. | Descrição |
|---|---|---|---|
| atividade_id | string | sim | de listar_atividades_vencidas |
| resolucao | string | sim | feito, nao_fiz, reagendar ou cancelar |
| resultado | string | se feito | o que foi feito (mín. 10 letras) |
| nova_data | string | se reagendar/nao_fiz | AAAA-MM-DD, hoje ou futura |
| motivo | string | se não for feito | por que não fez / remarcou / cancelou |

Obs.: o campo chama `resolucao` (não `acao`), porque `acao` já é a constante da ferramenta.

### criar_compromisso (acao constante `criar_compromisso`)
| Campo | Tipo | Obrig. | Descrição |
|---|---|---|---|
| titulo | string | sim | ex.: "Ligar para o Marcelo" |
| tipo | string | sim | Ligação, Visita, Reunião, Tarefa ou WhatsApp |
| data | string | sim | AAAA-MM-DD, hoje ou futura |
| hora | string | não | HH:MM (padrão 09:00) |
| organizacao_id | string | não | de buscar_organizacao |
| descricao | string | não | |

### Existentes que passam a valer sem viagem
`buscar_organizacao`, `listar_organizacoes_incompletas` (prioriza negócio aberto, depois a mais antiga) e `completar_organizacao`: só marcar `rota_id` como **não obrigatório**.
Sem viagem ficam bloqueadas: `listar_pendentes`, `registrar_visita`, `registrar_pernoite`, `vincular_organizacao`, `agendar_retorno`.

## Trecho do prompt
```text
Se {{permitido}} for "nao", "ocupado" ou "erro": fale só a primeira mensagem e encerre com end_call. Não chame nenhuma ferramenta.
Se {{origem}} for "entrada": foi o vendedor quem ligou. Não pergunte se é uma boa hora.
Se {{permitido}} for "sim": siga o fluxo normal de viagem (pendências, visitas, pernoite).
Se {{permitido}} for "livre" (sem viagem hoje): não fale de viagem, parada ou pernoite. Ofereça, um de cada vez:
 1) Registrar um contato com cliente: busque a empresa com buscar_organizacao, confirme o nome, pergunte canal e resultado, faça o debrief curto (contato, interesse, próximo passo e data) e grave com registrar_contato_cliente.
 2) Resolver atividades: chame listar_atividades_vencidas, leia uma por vez e grave cada uma com resolver_atividade (feito com resultado; reagendar/não fiz com nova data e motivo; cancelar com motivo).
 3) Completar uma empresa: listar_organizacoes_incompletas e completar_organizacao (uma por ligação).
 4) Marcar compromisso: confirme tipo, data e hora e grave com criar_compromisso.
Nunca crie ou altere orçamento, valor de negócio, etapa do funil ou dados de outro vendedor; se pedirem, diga que isso é feito no CRM.
```

## Rejeitar sem atender
Por enquanto a Júlia atende, fala uma frase e encerra (opção A). A resposta do webhook de iniciação não consegue recusar a chamada; recusar exigiria filtro no Twilio.
