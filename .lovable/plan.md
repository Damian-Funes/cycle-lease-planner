# Plano — (0) concluir Júlia hotel/caixa postal + (1) card de comissão na tela inicial

## 0. Pendente de hoje: SQL do hotel / caixa postal (já com OK do CEO)

Situação: **nada aplicado ainda**. O teste no banco achou um erro no próprio SQL (a regra "4ª tentativa só para a nova tentativa" não compilava). Já corrigi no arquivo `docs/sql/julia-hotel-caixa-postal-extras-proposta.sql`. Os casos do Murilo (M1 a M5) passaram até o ponto em que o teste foi interrompido pela troca de modo.

Logo após aprovar este plano, antes de qualquer coisa da comissão:
1. Rodar de novo o teste completo, com tudo desfeito no fim: Murilo (Santos Dumont, 11/11, pago pela empresa, sem valor), Renan (retorno 20h na caixa postal → 20:30; 22:15 recusado; limite de tentativas) e "visitou mais alguém?".
2. Aplicar a migração.
3. Publicar `julia-viagem-ferramentas`, `julia-viagem-webhook` e `julia-viagem-ligar`. `push-enviar` não mudou.
4. Rodar os testes Deno, incluindo 2 novos: com pendência a nova tentativa liga; com o dia fechado ela não liga.

Prazo: antes das 17h (BRT). Hoje são 14h30 BRT.

## 1. Card de comissão — o que existe hoje (conferido no banco)

| Pergunta | Onde está | Situação |
|---|---|---|
| Valor de venda | `orcamentos.subtotal − desconto`. O `total` inclui frete e montagem. | Ok. Proponho que a comissão incida sobre **subtotal − desconto**, sem frete nem montagem. |
| Desconto | `desconto_tipo` (percentual 236 / valor 3) + `desconto_valor`. Também há itens com preço abaixo da tabela: 93 itens abaixo, 15 acima e 2.142 iguais. | Desconto efetivo = 1 − venda ÷ preço cheio. |
| Preço cheio | `equipamentos.valor_venda` (tabela), ligado pelo `equipamento_id` do item | 150 itens avulsos não têm preço de tabela e contam pelo próprio preço. |
| Status | `orcamentos.status`: rascunho 157 · enviado 76 · aprovado 6. Negócios: aberta 73 · ganha 5 · perdida 9. | Aberto = rascunho/enviado. Ganho = **aprovado**. |
| Versões | São 239 orçamentos, mas só 83 números distintos (`ORC2026-082-V3`, `-V4`…) | **Conta só a versão mais recente de cada número.** Sem isso, o "em jogo" infla ~3x. |
| Vendedor | `orcamentos.responsavel_id` | Ok |
| Novas x Recorrente | Não existe campo. O histórico no CRM é curto (5 negócios ganhos). | Ver proposta abaixo |
| Máquina/periférico/telemetria | `equipamentos.categoria` é técnica (tratamento, líquidos, pó…) e 87 de 144 itens estão sem categoria. **Não existe nenhum item de telemetria no catálogo.** | Precisa de uma classificação nova |
| Anuidade/manutenção/upgrade | `orcamentos_reforma` (0 registros). Kits de atualização aparecem dentro de orçamentos normais. | Pela classificação do item |
| Seminovos | Nenhum dado | Fica fora desta fase |
| Dossiê / cadência | `dossies_sementeiras`: 11 de 145 empresas, legado. Interações: 40. | Pouco confiável → "a confirmar na auditoria trimestral" |
| Trava CRM | `fn_minha_trava_orcamento` (a mesma do Novo orçamento) | Reaproveitar |

## 2. Regras como ficam no card

- **Máquina nova** (itens máquina + periférico + telemetria):
  - Fixo: 0,5%, sempre.
  - Preço: 1,5% com preço cheio · 1,2% com desconto até 1,5% · 0,8% com desconto até 3%. Acima de 3% ganha 0% e aparece o aviso "acima da política".
  - Mix completo: 1,0% se o orçamento tem máquina, periférico e telemetria.
  - Dossiê + cadência (0,7% + 0,3% = 1,0%): sempre aparece como **"a confirmar na auditoria trimestral"**. Entra no máximo possível, nunca no mínimo.
  - Recorrente: os mesmos degraus, com teto de 4,5% no variável. A proposta é escalar proporcionalmente (×4,5/3,5). **Confirmar com o CEO** como os 1,0 p.p. extras se dividem.
  - Atividade vencida: o variável zera e só o fixo 0,5% continua.
- **Anuidade / manutenção / upgrade:** 1% fixo para o vendedor, por item.
- **Orçamento misto:** cada item entra na sua regra (máquina ou serviço).
- **Seminovo e SmartCycle:** ignorados.

## 3. Como o card aparece (celular primeiro)

```text
Sua comissão em jogo
R$ 4.200 certos se fechar · até R$ 33.600
(12 orçamentos ativos nos últimos 90 dias)

Top 3
Sementes X — R$ 840 mil — você ganha até R$ 36.900
  - sem telemetria: -R$ 8.400
  - desconto de 2%: -R$ 2.520
  ...
Já garantido em 2026: R$ 18.300 (3 fechados)
```

- **Antes:** a tela inicial não mostra comissão.
- **Depois:** o vendedor vê só os dele. O admin vê o total e a lista por vendedor.
- **Com atividade vencida:** aparece a faixa "Atividades vencidas: variável zerado — resolva para voltar a ganhar até R$ X", com link para /atividades.
- **Filtro do "em jogo":** só a última versão de cada orçamento, aberto e mexido nos últimos 90 dias. Hoje 96 versões abertas passaram desse prazo.

## 4. Mudanças no banco (proposta em `docs/sql/comissao-card-proposta.sql`, aplicar só após OK do CEO)

1. `equipamentos.tipo_comercial`: maquina | periferico | telemetria | anuidade | manutencao | upgrade | seminovo. Só o admin define. A tela do Catálogo ganha esse seletor.
2. `organizacoes.cliente_desde` (date, só admin/gerente). Recorrente = tem `cliente_desde` anterior ao orçamento **ou** já teve orçamento aprovado antes.
3. A função `fn_comissao_base()` (security definer) devolve, por orçamento, só o que a comissão usa:
   - número, cliente, venda, preço cheio e desconto efetivo;
   - tipos de item presentes e se o cliente é recorrente;
   - status, data e vendedor.
   - **Nunca devolve custo.** O vendedor recebe só os dele; o admin recebe todos.

## 5. Riscos

- **Custo visível hoje:** a regra atual de leitura de `equipamentos` deixa o papel comercial ler `valor_custo`. Isso contraria "custo só admin vê". Proponho tratar em item separado (exige ajuste nas telas que leem o catálogo).
- **Mix completo inalcançável:** sem item de telemetria no catálogo, ninguém atinge o mix e o card mostraria "−1%" em todos os orçamentos. Proposta: enquanto não houver telemetria cadastrada, o mix fica como "a confirmar".
- **Recorrente sub-contado:** o histórico do CRM é curto, então quase todo cliente sairia como "Novas" até o admin preencher `cliente_desde`.
- **Números desanimadores:** mostrar primeiro o máximo possível e o que falta, nunca "você perdeu". A frase do zerado é sempre acompanhada do caminho para recuperar.
- **Expectativa de pagamento:** o rodapé diz "Estimativa. Paga só com pedido assinado; dossiê e cadência confirmados na auditoria trimestral."
- **Desconto acima de 3%** (7 orçamentos hoje): aparece como "fora da política" e não ganha a parte de preço.

## Detalhes técnicos

- As regras ficam em uma função pura `src/lib/comissao.ts`, com testes Vitest de um caso por regra: degraus de desconto, mix, gate, recorrente, serviço 1%, versões e filtro de 90 dias.
- Os dados vêm da RPC `fn_comissao_base`. O componente `ComissaoCard` entra na Home acima dos widgets do CRM.
- Antes da migração, o card fica escondido (checa se a RPC existe).
- Uma regra nova em AGENTS.md: a comissão é calculada por função pura sobre dados sem custo vindos de RPC filtrada por vendedor.
- O `roadmap.md` recebe o item "card de comissão" e o item 0.
