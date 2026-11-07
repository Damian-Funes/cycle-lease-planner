# Tela de Atividades: calendário, painel de detalhe e ações

## Como está hoje (conferido)
- `/atividades` sempre abre na visão **Lista** (o card da tela inicial só navega para `/atividades`).
- No **Calendário**, clicar numa atividade abre direto **"Editar atividade"**; não há como marcar Feito ali. Na Lista, as 4 ações (`BotoesAcaoAtividade` + `AcaoAtividadeDialog`, que já usam as funções do banco) aparecem na linha.
- **Arrastar no calendário não existe hoje** — não há código de arrastar. Mudar a data só pela edição (que já exige motivo quando a data muda).
- Concluídas já aparecem riscadas e esmaecidas no calendário; atrasadas não têm destaque.
- Histórico de reagendamentos não aparece em nenhuma tela.
- **"Testar assumir orgs"**: botão só para admin que dispara manualmente o envio do aviso "assumir organizações" (função `notify-assumir-organizacoes` com `force`). Ferramenta de teste — vendedores já não veem.

## Depois
1. **Abrir no Calendário**: o card da tela inicial abre `/atividades?visao=calendario`. Recomendo também **lembrar a última visão escolhida** (salva no aparelho); link com `?visao=` ou `?atrasadas=` tem prioridade.
2. **Painel de detalhe** ao clicar em qualquer atividade (Lista e Calendário):
   - Topo: 4 botões grandes **Feito / Não fiz / Reagendar / Cancelar**, abrindo o mesmo diálogo de hoje (mesmas regras: texto ≥10, motivo + nova data, motivo).
   - Corpo: título, tipo, data/hora, responsável, descrição, **empresa** (link), **pessoa** com telefone (ligar) e WhatsApp (abrir conversa), **oportunidade** (link), **histórico de reagendamentos** (data antiga → nova, motivo, quem, quando).
   - Rodapé: botão secundário **Editar** (abre a edição atual, sem mudança).
   - Concluída: mostra resultado e botão "Reabrir" (comportamento atual do checkbox).
3. **✓ rápido no calendário**: ícone ✓ visível no hover (desktop) e sempre visível no toque (celular) em itens não concluídos; abre direto o "Feito".
4. **Arrastar**: como não existe, não adiciono agora. Se quiserem, faço depois: soltar em outro dia abre o "Reagendar" com a data preenchida e motivo obrigatório.
5. **Cores**: atrasadas (não concluídas, data passada) com fundo/borda vermelhos; concluídas esmaecidas e riscadas (já ocorre) quando "Concluídas" está ligado.
6. **"Testar assumir orgs"**: recomendo **remover da tela**. Continua disponível só para admin, mas sai do topo para um menu "⋯ Ferramentas de admin". Diga se prefere remover de vez.
7. **Celular**: o painel vira bottom sheet em tela cheia (Drawer), com os 4 botões grandes em grade 2×2 no topo.

## Fora do escopo
Nenhuma regra, função do banco ou SQL muda. A leitura do histórico usa a tabela `atividade_reagendamentos`; se o vendedor não tiver permissão de leitura nela, mostro o SQL antes (verifico na implementação; se falhar, o painel apenas esconde o histórico).

## Técnico
- Novo `src/components/atividade/AtividadeDetalhe.tsx` (Dialog no desktop, Drawer no celular via `useIsMobile`), carregando pessoa/telefone, oportunidade e reagendamentos sob demanda.
- `Atividades.tsx`: estado `detalhe`; `onSelectAtividade` → detalhe; linha da lista clicável → detalhe; visão inicial por query/localStorage.
- `AtividadesCalendar.tsx`: props `onConcluirRapido`; classe de atrasada; botão ✓.
- `CrmWidgets.tsx`/`Home.tsx`: link com `?visao=calendario`.

## Riscos
- Leitura de reagendamentos pode estar bloqueada por permissão para vendedor (tratada sem quebrar).
- Cliques: o ✓ precisa parar a propagação para não abrir também o detalhe.
- Lembrar a visão por aparelho: em computador compartilhado, a escolha é por navegador, não por usuário.
- Calendário com muitos itens por dia: o ✓ sempre visível no celular ocupa espaço; uso ícone pequeno.
