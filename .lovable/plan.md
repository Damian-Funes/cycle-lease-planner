# Reorganizar a tela Nova/Editar rota (só layout)

## Como está hoje (`src/pages/RotaEditor.tsx`)
Cabeçalho (não fixo): voltar, título, status, Otimizar ordem, Salvar.
Corpo: grade de 2 colunas no desktop (`lg:grid-cols-2`), uma coluna no celular. A página inteira rola.

Coluna esquerda, nesta ordem:
1. Avisos de status (reprovada, aguardando, aprovada), botões Viagem de hoje e Acompanhar
2. Lista de faltas e botão **Enviar para aprovação**, ou Concluir prestação / Cancelar viagem
3. Card de dados: início, fim, veículo, alimentação, badge de km, observações
4. Card "Resumo da rota": km, tempo, km por dia, aviso de rota longa, links do Google Maps
5. Card de custo (`CustoViagemCard`)
6. **Clientes no caminho** (`ClientesNoCaminho`): aparece depois que a rota é calculada, com lista de sugestões e raio
7. "Paradas (n)", botão Adicionar parada e lista de paradas. O `overflow-y-auto` não tem altura máxima, então a lista nunca rola sozinha e só cresce

Coluna direita: card do mapa com filtros de categoria, "Só no caminho" e legenda. Ele não é fixo e tem altura mínima de 400 px.

**O que bagunça:** as duas colunas ficam na mesma linha da grade, que tem a altura da coluna mais alta. Quando o resumo, as sugestões e as paradas aparecem, a esquerda cresce. O mapa estica ou fica para trás conforme a página rola. No celular o mapa fica no fim, depois de todas as paradas. O botão Enviar fica no topo e o Salvar fica no cabeçalho, que some ao rolar.

O mapa já faz: clicar num cliente sugerido abre o card dele. Ele não faz: clicar no marcador de uma parada não leva a nada, e clicar numa parada não mexe no mapa.

## Como fica (desktop, a partir de 1024 px)
```text
+------------------------------------------------------------------+
| <- Rota Comercial [status]  312 km · 2 dias · 6 paradas · R$ 1.240 |  cabeçalho fixo
+-------------------------------+----------------------------------+
| Avisos de status (compactos)  |                                  |
| Dados: vendedor/datas/veículo |   MAPA FIXO (altura da tela      |
|  (recolhível depois de salvo) |   menos o cabeçalho), filtros    |
| [Paradas | Sugestões | Custo] |   e legenda como hoje            |
|  conteúdo da aba, com rolagem |                                  |
|  própria                      |                                  |
+-------------------------------+                                  |
| [Otimizar] [Salvar] [Enviar]  |  <- rodapé fixo da coluna        |
+-------------------------------+----------------------------------+
```
- A página para de rolar: a tela tem a altura da janela, e só o conteúdo da coluna esquerda rola. O mapa nunca se move.
- Proporção das colunas: cerca de 45/55, com o mapa maior.
- **Cabeçalho resumo fixo:** km, dias, número de paradas, custo estimado e status, usando valores que a tela já calcula.
- **Abas da coluna esquerda:**
  - **Paradas (n):** cards atuais e botão Adicionar parada no topo da aba
  - **Sugestões:** Clientes no caminho, com raio. A seção "Fora do raio" continua no modal de adicionar
  - **Custo e trajeto:** custo, km por dia, aviso de rota longa e links do Google Maps/Waze
- Prestação de contas: a aba Paradas continua mostrando os campos de prestação de cada parada.
- **Rodapé fixo** com as ações que já existem para cada status: Otimizar, Salvar, Enviar para aprovação, Concluir prestação, Cancelar viagem. As faltas aparecem logo acima do rodapé, e um "ver faltas" leva até elas.

## Mapa e lista conectados
- Clicar numa parada da lista centraliza o mapa nela, aproxima e faz o marcador pular. Se a parada não tem coordenada, a tela avisa "sem localização".
- Clicar no marcador de uma parada abre a aba Paradas, rola até o card e o destaca com uma borda verde por cerca de 2 s.
- Clicar num cliente sugerido no mapa continua como hoje. Além disso, abre a aba Sugestões no item dele.
- Adicionar ou remover uma parada não recentraliza o mapa à força, mantendo o comportamento atual.

## Celular e tablet (abaixo de 1024 px)
- O cabeçalho resumo fica fixo, com duas abas de topo: **Lista** e **Mapa**.
  - **Lista:** dados, sub-abas Paradas, Sugestões e Custo, e rodapé fixo com as ações
  - **Mapa:** mapa na tela cheia. Tocar num marcador de parada volta para Lista já rolada até ela
- O mapa continua montado ao trocar de aba (fica escondido em vez de ser recriado), para não recarregar o Google Maps.

## Fora do escopo
Regras, cálculo de rota, pedágio, custo, aprovação, prestação, dados e o modal Adicionar parada (exceto onde ele é aberto).

## Riscos
- **Google Maps em contêiner escondido ou redimensionado:** pode aparecer cinza. Ao mostrar a aba ou mudar o tamanho, o mapa é avisado do novo tamanho e reenquadrado.
- **Altura da tela no celular** (barra do navegador): usar a altura real da tela visível do celular, para o rodapé não ficar escondido.
- **Campos "Objetivo" em edição dentro das abas:** como as abas só ficam escondidas, o texto digitado não se perde ao trocar.
- **Prestação de contas com muitas paradas:** a rolagem passa a ser só da lista. Conferir que o teclado do celular não cobre o rodapé.
- **Hábito:** o Salvar sai do cabeçalho e vai para o rodapé, e o Enviar desce do topo para o rodapé. Haverá uma mudança visual para os vendedores.
- **Arquivo grande (800 linhas):** dividir em partes visuais (cabeçalho resumo, painel de dados, lista de paradas, rodapé de ações) sem mover a lógica. A lógica fica no `RotaEditor`, o que reduz o risco de regressão.

## Detalhes técnicos
- Layout: `h-[100dvh] flex flex-col`. O main fica `flex-1 min-h-0 grid lg:grid-cols-[minmax(380px,45%)_1fr]`. A coluna esquerda fica `flex flex-col min-h-0`, com a área das abas `flex-1 overflow-y-auto` e o rodapé `border-t bg-background`.
- Abas com `Tabs` do shadcn e `forceMount` + `hidden` para manter o estado. O mapa fica com `hidden lg:block` controlado pela aba no celular.
- Mapa ↔ lista: `paradaRefs` (Map id→HTMLElement), estado `destacadaId`, listener `click` no marcador da parada → `setAba('paradas')` + `scrollIntoView({block:'center'})`. Lista → `map.panTo` + `setZoom(max(atual,11))` + `marker.setAnimation(BOUNCE)` por 1,4 s. Os marcadores ficam guardados num `Map` por id da parada.
- `google.maps.event.trigger(map,'resize')` (ou um re-`fitBounds`) num `ResizeObserver` do contêiner do mapa.
- Nenhuma alteração em `src/lib/*`, nas consultas, no SQL ou nas funções do servidor.
- Verificação: Playwright em 1280×800 e 390×844 com uma rota de 10+ paradas, conferindo que a posição do mapa é igual antes e depois de adicionar paradas, e testando os cliques entre lista e mapa.
