# Corrigir o layout da tela Nova/Editar rota (só layout)

## Como estava antes da última mudança
- Tela `src/pages/RotaEditor.tsx`, rota `/rotas/:id`.
- A página tinha `min-h-screen` e uma grade de duas colunas (`lg:grid-cols-2`) sem altura fixa.
- Ordem na coluna esquerda:
  1. avisos de status
  2. faltas e Enviar
  3. dados da rota
  4. resumo
  5. custo
  6. clientes no caminho
  7. paradas
- O mapa ficava na coluna direita.
- **Causa:** nenhuma altura limitava a tela. A lista tinha `overflow-y-auto`, mas sem `min-h-0` nem altura máxima, então nunca rolava sozinha. A coluna esquerda crescia, a grade crescia junto e a página inteira rolava, levando o mapa embora. No celular, o mapa ficava depois de todas as paradas.

## Como está agora (já aplicado na última rodada, ainda não conferido logado)
- A tela tem `h-[100dvh] overflow-hidden`, o conteúdo principal `flex-1 min-h-0`, e as colunas são 45% / 55%.
- O mapa ocupa a altura toda da coluna direita e não rola.
- O cabeçalho é compacto, com km, dias, número de paradas e custo.
- A coluna esquerda tem abas Paradas / Sugestões / Custo e trajeto e rodapé fixo com Otimizar, Salvar, Enviar, Concluir e Cancelar. As faltas aparecem recolhidas acima do rodapé.
- Clicar na parada centraliza o mapa nela e o marcador pula. Clicar no marcador abre a aba Paradas, rola até a parada e a destaca.
- No celular há abas Lista e Mapa.

**Diferença que falta para o pedido:** hoje rola a coluna esquerda inteira (dados + abas + lista). O CEO quer que só a lista role.

## O que muda
```text
+--------------------------------------------------------------+
| <- Rota [status]   312 km · 2 dias · 6 paradas · R$ 1.240    |  fixo
+-----------------------------+--------------------------------+
| Avisos (1 linha)            |                                |
| Dados compactos (fixo)      |                                |
| [Paradas|Sugestões|Custo]   |        MAPA FIXO               |
| +-------------------------+ |        altura total            |
| | lista com rolagem       | |                                |
| | PRÓPRIA                 | |                                |
| +-------------------------+ |                                |
| [Otimizar][Salvar][Enviar]  |                                |
+-----------------------------+--------------------------------+
```
1. **Topo da coluna esquerda fixo:** avisos, dados da rota e a barra de abas saem da área que rola e ficam com `shrink-0`.
2. **Só o conteúdo da aba rola:** a lista de paradas e clientes, as sugestões e o custo ficam num quadro `flex-1 min-h-0 overflow-y-auto`, com borda e fundo leve para parecer um quadro.
3. **Dados mais compactos:**
   - Desktop: início, fim, veículo e alimentação numa linha só, em 4 colunas.
   - Telas menores: 2 colunas.
   - Observações continuam recolhidas.
   - Quando a rota não está em planejamento, os dados viram uma linha de texto só leitura, para dar mais espaço à lista.
4. **Adicionar parada e "Fora do raio":** o botão Adicionar fica no topo fixo da aba Paradas. "Fora do raio" continua no modal, que abre por cima e não empurra nada.
5. **Proteção para telas baixas** (notebook com menos de cerca de 650 px de altura): o quadro da lista mantém pelo menos cerca de 220 px. Se não couber, só o bloco de dados ganha rolagem interna, nunca a página.
6. **Celular:** mantém as abas Lista e Mapa, com a mesma regra: topo fixo, lista rolando e rodapé fixo.

Fica igual: cálculo de rota, custo, pedágio, aprovação, prestação, dados e regras.

## Riscos
- **Tela muito baixa ou zoom alto:** o espaço da lista fica pequeno. Isso é tratado pelo item 5.
- **Teclado do celular** ao editar o "Objetivo": pode cobrir o rodapé. O `100dvh` acompanha o tamanho real da tela, mas vou conferir.
- **Mapa cinza** ao trocar a aba no celular: já existe um reenquadramento quando o mapa muda de tamanho. Vou conferir.
- **Prestação de contas com muitas paradas:** os formulários ficam dentro do quadro que rola. Não perdem o que foi digitado, porque as abas só escondem o conteúdo.
- **Conferência na prática:** este projeto não deixa eu entrar com uma conta de teste. A conferência com uma rota de verdade vai depender de você abrir a tela, ou de eu testar só a estrutura.

## Detalhes técnicos
- Coluna esquerda: `flex flex-col min-h-0`.
- Filhos da coluna esquerda:
  - topo: `shrink-0 max-h-[45%] overflow-y-auto` (dados + abas)
  - meio: `flex-1 min-h-[220px] overflow-y-auto` (conteúdo da aba)
  - rodapé: `shrink-0`
- A barra de abas deixa de ser `sticky` e passa para o topo fixo.
- O botão "Adicionar Parada" e o contador saem de `listaParadas` e vão para a linha da barra de abas quando a aba Paradas está ativa.
- O `scrollIntoView` do clique no marcador passa a rolar o quadro da lista, e não a página.
- Nenhuma mudança em `src/lib/*`, nas consultas ou no SQL.
