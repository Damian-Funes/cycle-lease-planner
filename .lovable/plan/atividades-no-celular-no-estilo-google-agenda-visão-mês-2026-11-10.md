# Atividades no celular no estilo Google Agenda (visão mês)

Só tela e navegação. Sem SQL e sem mudança de regra. O SQL dos dias anteriores continua aguardando o CEO e não será aplicado.

## Antes e depois

| | Hoje no celular | Depois (telas menores que 768px) |
|---|---|---|
| Topo | O cabeçalho do computador espremido: Início, abas Lista/Calendário/Atrasadas, botão Concluídas, Nova e avatar | Topo compacto: ☰, "novembro ▾" (abre o seletor de mês/ano), lupa, botão "hoje" com o número do dia, avatar |
| Meses | Setas ‹ › | Faixa rolável de meses: "nov." (preenchido) · "dez." · 2027 · "jan." · "fev."…, e tocar num mês pula para ele. Deslizar para os lados também troca o mês |
| Filtros | A coluna lateral de 240px empurra o calendário | Ficam no menu ☰ (painel lateral): Período, Responsável, Tipos, interruptores "Concluídas" e "Só atrasadas", troca para Lista e, para admin, "Atrasadas do time" |
| Grade | Calendário pequeno do computador | Mês em tela cheia: D S T Q Q S S (o dia da semana de hoje em destaque), 6 semanas, linhas finas, número do dia no topo e hoje num círculo verde |
| Atividades na célula | Linha com ícone e hora | Etiquetas coloridas da largura da célula, título curto em negrito e cortado com "…". Cabem 3 por dia, e o resto vira "+N" |
| Cores | Cor do tipo | Cor do tipo. Atrasadas em vermelho, concluídas esmaecidas e riscadas (quando "Concluídas" está ligado) |
| Tocar numa etiqueta | Abre o detalhe | Igual: abre o detalhe já existente com Feito / Não fiz / Reagendar / Cancelar |
| Tocar no dia ou no "+N" | — | Abre a lista daquele dia, de baixo para cima: atividades por hora (com o ✓ rápido) e botão "Nova neste dia" |
| Criar | Botão "Nova" no topo | Botão "+" grande e redondo no canto inferior direito, que abre o formulário atual |
| Visão inicial | A última escolhida | No celular abre sempre no Calendário mês. A Lista continua disponível pelo menu ☰ |

O computador fica exatamente como está. Os temas claro e escuro usam as cores do app. As cores dos tipos ganham um fundo suave com texto escuro ou claro conforme o tema, para continuarem legíveis.

## Observações

- As atividades têm só data e hora de início. Por isso não existe atividade que "atravesse vários dias": cada uma aparece no seu dia.
- O calendário atual não tem arrastar. No celular não haverá arrastar (deslizar troca de mês). Mudar a data continua pelo Reagendar, que pede motivo.
- A lupa abre uma busca por título, empresa ou pessoa dentro das atividades já carregadas. Tocar num resultado pula para o mês da atividade e abre o detalhe.
- "Nova neste dia" abre o formulário atual já com aquela data, às 9h.

## Riscos

- **Deslizar para trocar de mês x rolar a página:** só conta como troca de mês um deslize horizontal claro (mais de 60px e mais lateral do que vertical).
- **Toque errado em células pequenas:** etiquetas com no mínimo 18px de altura, e o "+N" abre a lista do dia, onde os toques são grandes.
- **Busca:** só acha o que está carregado pelos filtros atuais (o mesmo comportamento da lista de hoje). Isso fica dito no campo de busca.
- **iPhone com barra inferior:** o "+" e a lista do dia respeitam a área segura da tela.
- **Tablets entre 768px e 1024px:** continuam com o layout do computador. Se o CEO quiser, dá para subir o limite depois.

## Detalhes técnicos

- **Novo `src/components/atividade/CalendarioMesMobile.tsx`:**
  - Recebe as props de `AtividadesCalendar` (`atividades`, `tipos`, `onSelectAtividade`, `onConcluirRapido`) mais `onNovaNoDia(date)`.
  - Grade de 42 dias com date-fns e `ptBR`, faixa de meses (de 12 meses antes a 12 meses depois, rolada até o mês atual) e deslize por eventos de toque.
  - Lista do dia com o `Drawer` (vaul).
  - Cor da etiqueta: `tipo.cor` com transparência de fundo, e `destructive` quando atrasada.
- **`src/pages/Atividades.tsx`:**
  - Usa `useIsMobile()`. No celular, mostra o cabeçalho compacto, o `Sheet` lateral com os mesmos controles da coluna lateral (o mesmo estado: `periodo`, `respSel`, `tiposSel`, `showConcluidas`), o botão flutuante e a nova grade.
  - Novo filtro só de tela, "Só atrasadas", que equivale a `periodo="atrasadas"`.
  - A visão inicial no celular é sempre `calendario`, salvo `?visao=` na URL. O `localStorage` continua valendo só no computador.
  - O cabeçalho e a coluna lateral do computador ficam sem mudança.
- **`NovaAtividadeQuickForm`:** nova prop opcional `dataInicial?: Date`, que preenche a data inicial. Quem já usa o formulário continua igual.
- **Verificação:** Playwright em 390×844 e em 1280 (para confirmar que o computador não mudou), com print nos temas claro e escuro. Teste pequeno da montagem da grade (42 dias, mês certo e semana começando no domingo).
