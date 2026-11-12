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

## 2. Regras (versão simplificada do CEO)

| Tipo | Máximo | Garantido (com atividade vencida) |
|---|---|---|
| Cliente novo | 4% da venda | 0,5% |
| Cliente recorrente (já comprou) | 5% da venda | 0,5% |
| Seminovo | 2% | 2% (sempre) |

- A comissão só vale quando o orçamento vira ganho (status aprovado). Os abertos aparecem como potencial.
- **Com atividade vencida:** novo e recorrente caem para 0,5%. O card mostra "resolva X atividades vencidas para não perder R$ Y". Y = máximo − garantido dos abertos.
- **Deixam de existir:** escala de desconto, mix, dossiê, cadência, anuidade, manutenção e upgrade.

## 3. Como o card aparece (celular primeiro)

```text
Sua comissão em jogo
R$ 4.200 garantidos · até R$ 33.600
Top 3: Sementes X — R$ 840 mil — você ganha até R$ 33.600
Resolva 3 atividades vencidas para não perder R$ 29.400
Já garantido em 2026: R$ 18.300 (3 fechados)
```

- O vendedor vê só os dele. O admin vê o total e a lista por vendedor.
- Conta só a última versão de cada orçamento, aberto e mexido nos últimos 90 dias.
- A base é a venda (subtotal − desconto), sem frete e sem montagem. Nunca aparece custo.

## 4. Mudanças no banco (proposta em `docs/sql/comissao-card-proposta.sql`, aplicar só após OK do CEO)

1. `organizacoes.cliente_desde` (date, só admin/gerente). Recorrente = preenchido antes do orçamento **ou** já tem orçamento aprovado anterior.
2. `orcamentos.seminovo` (boolean, padrão false), marcado no orçamento. Hoje não existe nenhum dado de seminovo.
3. A função `fn_comissao_base()` (security definer) devolve só número, cliente, venda, status, data, vendedor, recorrente e seminovo.
   - **Nunca devolve custo.**
   - O vendedor recebe só os dele; o admin recebe todos.

## 5. Riscos

- **Recorrente sub-contado:** o histórico do CRM é curto, então quase todos sairiam como "novo" até o admin preencher `cliente_desde`.
- **Custo visível hoje:** a leitura atual de `equipamentos` deixa o papel comercial ler `valor_custo`. Proponho tratar em um item separado.
- **"Em jogo" inflado:** orçamentos velhos ou duplicados por versão inflariam o valor. O filtro de 90 dias e a regra da última versão resolvem.
- **Expectativa de pagamento:** o rodapé diz "Estimativa; paga só com pedido assinado."

## Detalhes técnicos

- As regras ficam em uma função pura `src/lib/comissao.ts`, com testes Vitest de um caso por regra: 4%/5%/2%, gate 0,5%, seminovo sem gate, versões e filtro de 90 dias.
- Os dados vêm da RPC `fn_comissao_base`. O componente `ComissaoCard` entra na Home acima dos widgets do CRM.
- Antes da migração, o card fica escondido (checa se a RPC existe).
- Uma regra nova em AGENTS.md: a comissão é calculada por função pura sobre dados sem custo vindos de RPC filtrada por vendedor.
- O `roadmap.md` recebe o item "card de comissão" e o item 0.
