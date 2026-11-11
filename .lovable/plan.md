# Júlia: adicionar parada fora da rota + corrigir retorno das ligações

Todo SQL vai para `docs/sql/julia-adicionar-parada-e-retorno-proposta.sql` e só é aplicado com OK explícito do CEO (teste antes em BEGIN…ROLLBACK).

## Parte 2 primeiro — bug do Flávio (causa confirmada nos dados)

Ligações de 10/11 do Flávio (rota 295ad6db…):

```text
08:01  inicial  -> caiu
08:02  manual   -> caiu
08:03  retorno 19h criado
08:44  manual   -> cancela o retorno 19h ("substituida por religar manual")
08:44  Júlia chama agendar_retorno 19h -> responde "ok, 19h"... mas nada novo é gravado
19h+   cron vê que a "inicial" já existe -> não cria nada -> ninguém liga
```

**Por que o retorno das 08:44 não gravou (não houve erro):** existe uma trava "um retorno por vendedor por dia". A função de reservar encontrou o retorno das 19h já **cancelado** e simplesmente o devolveu como se estivesse válido. A ferramenta leu `agendada_para = 19h` e respondeu "ok". Ou seja: a Júlia chamou a ferramenta certo; o banco mentiu "ok".

**Antes → Depois**

| Situação | Hoje | Depois |
|---|---|---|
| Ligação manual com retorno agendado para mais tarde | Cancela o retorno | Mantém o retorno; só cancela o que estava para agora (até +15 min) ou "aguardando escolha" |
| agendar_retorno quando já existe retorno cancelado/encerrado | Devolve o antigo, nada muda | Reaproveita a linha: volta para "agendada" no novo horário |
| agendar_retorno quando já existe retorno agendado | Devolve o antigo | Atualiza o horário para o novo pedido |
| Ferramenta só diz "ok" se o retorno ficou de fato `agendada` no horário pedido | Não confere | Confere; senão responde erro e a Júlia avisa |
| Cron do fim do dia com dia não fechado, sem retorno futuro, e já houve inicial/manual de manhã | Não liga | Cria um "fechamento" a partir de `contato_hora` (17h) e liga — uma vez por dia |
| Limite de 3 tentativas automáticas | Mantido | Mantido (manual não conta, como hoje) |

**Como o cron liga de novo:** nova origem `fechamento` (uma por vendedor/dia, mesma trava única). Regra: dia com pendência de fechamento + nenhuma ligação `agendada`/`aguardando_escolha`/em andamento + nenhuma ligação concluída depois de `contato_hora` → reserva `fechamento` e disca. Não liga após 22h (regra atual).

**Teste com os dados do Flávio (em rollback):** reproduzir a sequência de 10/11 com horários simulados e confirmar: (a) a manual das 08:44 não cancela o retorno 19h; (b) agendar_retorno depois de um retorno cancelado deixa uma linha `agendada` às 19h; (c) sem retorno, o cron às 17h10 cria o `fechamento`. Também testes Deno da regra "manual só substitui o que é para agora" e da checagem do "ok".

## Parte 1 — nova ação `adicionar_parada`

**Recomendação: ação separada `adicionar_parada`, e não registrar_visita criando parada sozinha.** Motivos: registrar_visita já tem muitas regras (repetida/conflito/relato/contato); misturar criação deixa o erro difícil de explicar por voz; separado, a Júlia confirma "adicionei a Sementes Aurora no dia 10" e depois o fluxo de visita é o de sempre, sem mudar nada que já funciona.

**Campos:** `ligacao_id`, `rota_id`, `organizacao_id` **ou** (`nome_empresa` + `cidade` + `uf`), `dia` (padrão hoje), `visitada` (padrão true; só informativo, a visita em si é gravada no registrar_visita).

**O que faz (uma transação no banco, só servidor):**
1. Valida ligação/rota/vendedor como as outras ações; `dia` dentro da viagem e não futuro (mesma regra do dia sem visita).
2. Sem `organizacao_id`: antes de criar, busca por nome normalizado + cidade/UF; se achar uma, usa. Se não, cria organização com nome/cidade/UF, `responsavel_id` = vendedor (nunca admin), marcada "criada pela Júlia" → entra na lista de incompletas que a Júlia já cobra.
3. Duplicata: se já existe parada dessa organização nessa rota com `dia` = o dia pedido (ou ainda sem dia e não informada), devolve a existente (`ja_existia: true`).
4. Cria a parada no fim do dia (ordem = maior ordem + 1), `dia` = dia pedido, `origem='julia'`, `criada_por` = vendedor, `ligacao_id`.
5. **Não manda a viagem de volta para aprovação.** Hoje qualquer parada nova numa viagem aprovada volta para "aguardando aprovação" — isso travaria o resto. Usa o mesmo mecanismo de aviso por transação já usado na Júlia para o gatilho saber que é "fora da rota", não replanejamento.
6. Avisa os admins: notificação `parada_extra:<parada_id>` "Parada adicionada fora da rota: <empresa> por <vendedor>"; nova regra em `push_regras` para virar push (respeita silêncio 21h–7h).
7. Devolve `parada_id`, `empresa`, contatos e `ja_sabemos` (igual ao vincular), para a Júlia seguir para registrar_visita.

**App:** a parada aparece na viagem com etiqueta "fora da rota (Júlia)".

**Km/custos:** não recalculamos. Nada quebra: pedágio e custo estimado ficam como estavam (já foram congelados no envio); a assinatura de trajeto muda, então se alguém reenviar a viagem para aprovação, o pedágio será recalculado — esperado. A prestação de contas e o "onde dormi" não dependem disso.

**Entregas para ElevenLabs:** JSON da ferramenta `adicionar_parada` no mesmo formato de `docs/julia-viagem-elevenlabs.md` (properties como array; `ligacao_id`/`rota_id` como dynamic_variable com description ""), e trecho de prompt:
> Se o vendedor citar visita a uma empresa que não está em listar_pendentes: buscar_organizacao → confirme qual é → adicionar_parada (com o dia, se não foi hoje) → registrar_visita com o parada_id devolvido. Se não achar a empresa, pergunte cidade e UF e chame adicionar_parada com nome_empresa. Nunca mande o vendedor usar o app.

## SQL proposto (resumo)

- `rota_paradas`: colunas `origem text default 'planejada'` (check planejada/julia), `criada_por uuid`, `ligacao_id uuid`.
- `organizacoes`: coluna `criada_pela_julia boolean default false`.
- `fn_paradas_reaprovacao`: ignorar INSERT quando a configuração local da transação marcar "parada extra da Júlia".
- Nova `julia_adicionar_parada(p_ligacao, p_rota, p_dados)` security definer, só service_role.
- `julia_reservar_ligacao`: manual cancela só pendentes até agora+15 min; retorno/fechamento existente cancelado/encerrado é reativado; origem `fechamento` aceita (check da tabela atualizado).
- `push_regras`: chave `parada_extra:`.

## Riscos

- Reativar retorno pode gerar ligação a mais se o vendedor já fechou o dia — mitigado: o disparo já checa pendências antes de discar (confirmar no teste).
- Nova ligação `fechamento` aumenta custo em dias com ligação de manhã — limitada a uma por dia.
- Organização criada pela Júlia pode duplicar outra com nome escrito diferente — mitigado pela busca antes de criar; sobra é corrigida pela tela de incompletas.
- Pular a reaprovação abre brecha se usada fora da Júlia — o aviso só é ligado dentro da função do servidor.

## Técnico (arquivos)

- `supabase/functions/julia-viagem-ferramentas/{schema.ts,index.ts}` + testes: ação `adicionar_parada`; checagem do resultado de `agendar_retorno`.
- `supabase/functions/julia-viagem-ligar/index.ts`: regra do `fechamento` no cron (função pura testável).
- `supabase/functions/_shared/push.ts`: prefixo `parada_extra:`.
- Tela da viagem: etiqueta "fora da rota".
- `docs/julia-viagem-elevenlabs.md`: JSON + prompt.
