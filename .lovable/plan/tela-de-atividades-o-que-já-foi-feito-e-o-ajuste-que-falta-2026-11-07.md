# Tela de Atividades — o que já foi feito e o ajuste que falta

Este pedido é igual ao plano aprovado há pouco, e quase tudo já está implementado. Não tem SQL nem mudança de regra.

## Antes → depois (estado atual)
1. **Card da tela inicial**: antes abria em Lista. **Agora abre em Calendário**. A tela também lembra a última visão escolhida em cada aparelho. Recomendo manter assim; um link com "atrasadas" continua abrindo em Lista.
2. **Clique numa atividade**: antes abria só "Editar atividade". **Agora abre um painel de detalhe**:
   - no topo, Feito / Não fiz / Reagendar / Cancelar, com as mesmas funções e validações do banco;
   - no corpo, empresa, pessoa com Ligar/WhatsApp, oportunidade e histórico de reagendamentos (o vendedor tem permissão para ver);
   - "Editar" fica como botão secundário.
3. **✓ rápido no calendário**: antes não existia. **Agora aparece** ao passar o mouse no computador e fica sempre visível no celular. Abre direto o "Feito".
4. **Arrastar**: o calendário nunca teve essa opção. Nada muda. Se quiserem, faço depois: soltar a atividade num dia abre o "Reagendar" com a data preenchida e o motivo obrigatório.
5. **Cores**: atrasadas em vermelho; concluídas esmaecidas e riscadas quando "Concluídas" está ligado. **Já está feito.**
6. **"Testar assumir orgs"**: é uma ferramenta só para admin, que dispara na hora o aviso "assumir organizações". Vendedores nunca viram esse botão. **Saiu do topo** e foi para o menu "⋯" do admin. Posso remover de vez, se preferirem.
7. **Celular**: o painel abre de baixo para cima, quase em tela cheia, com os 4 botões grandes em 2 colunas. **Já está feito.**

## Ajuste que falta (item 2: atividade concluída ou cancelada)
Hoje o painel diz "Concluída." para as duas, com o texto ao lado. Vou separar:
- **Concluída**: mostra "Feito em DD/MM HH:mm" e o resultado.
- **Cancelada**: mostra "Cancelada em DD/MM HH:mm" e o motivo, em vermelho.
- Nos dois casos, os 4 botões ficam escondidos e o "Reabrir" continua como hoje.

## Técnico
- `AtividadeDetalhe.tsx`: buscar também `situacao` e `data_conclusao`, e mostrar o rótulo certo para cada caso.

## Riscos
- Atividades antigas concluídas antes destas regras podem não ter resultado registrado. Nesse caso mostro só "Concluída".
- Não consegui testar nada disso no navegador com uma conta logada.
