## Objetivo

Ao criar uma conexão entre 2 pontos, mover o segundo equipamento para que o ponto clicado nele encoste exatamente no ponto clicado do primeiro equipamento. A linha cinza vira opcional (os equipamentos ficam fisicamente unidos).

## Comportamento

1. Usuário entra no modo Conectar.
2. Clica no ponto A do Equipamento 1 → bolinha laranja aparece (já funciona hoje).
3. Clica no ponto B do Equipamento 2 → em vez de só salvar a conexão:
   - Calcula o vetor de deslocamento `delta = pontoA_world - pontoB_world`.
   - Aplica esse delta na `posicao` do Equipamento 2 (apenas translação, sem rotação).
   - Persiste a nova posição no `layout_equipamentos`.
   - Salva a conexão em `layout_conexoes` (mantém a linha como referência visual, agora com comprimento ~0).
4. Equipamento 1 fica fixo (âncora). Só o segundo se move.

## Regras

- Snap às 6 faces do bbox (200mm) continua funcionando para escolher os pontos.
- Não tenta resolver cadeias: se o Equipamento 2 já estava conectado a outro, essa conexão antiga é mantida (mas pode ficar visualmente desencaixada — aceito nesta fase).
- Se o usuário arrastar manualmente um equipamento conectado, a conexão **não** é refeita automaticamente (linha acompanha porque é recalculada via `c.groups[id]` no `useEffect` de `items`).
- Conectar equipamento consigo mesmo continua bloqueado (toast de erro).

## Arquivos afetados

- `src/pages/LayoutEditor.tsx` — no `handleConectarClick`, após receber o segundo ponto, calcular delta em world space, atualizar `items` (posição do 2º equipamento) e chamar `persistItem` antes do INSERT da conexão.
- `src/components/Layout3DCanvas.tsx` — nenhuma mudança estrutural; o `useEffect` que redesenha conexões já reage à mudança de `items`.

## Detalhes técnicos

- O ponto clicado hoje já é convertido para coordenadas locais do equipamento (`worldToLocal`) e armazenado em mm. Para calcular o delta:
  1. Reconstituir `pontoA_world` a partir de `conexaoPontoTemp` (local mm → local m → `localToWorld` no grupo do Eq.1).
  2. Reconstituir `pontoB_world` a partir do clique atual no Eq.2.
  3. `delta = pontoA_world.sub(pontoB_world)`.
  4. `novaPosicao = item2.posicao + delta` (Y inclusive — se quiser travar Y, fácil ajustar).

- A linha desenhada no `useEffect` vai ter comprimento ~0; pode ser escondida quando `length < 1mm` para evitar artefato visual.

## Não muda

- GLB loading, categorias, catálogo, sistema de altura/rotação, iluminação, TransformControls, exportação PDF, transparência de seleção.
- Tabela `layout_conexoes` permanece igual.
- Sistema de portas cadastradas (Fase 1 anterior) não é pré-requisito — funciona com o snap heurístico atual.

## Pergunta única

Travar Y no movimento (só desloca em X/Z, mantém altura) ou permitir delta livre nos 3 eixos? Sugiro **delta livre** já que o ponto clicado pode estar no topo/base e faz sentido o equipamento subir/descer pra encaixar.
