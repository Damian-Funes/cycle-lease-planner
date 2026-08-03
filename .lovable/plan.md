# Corrigir orientação 3D do produto 0202

## Diagnóstico (confirmado)

O modelo do 0202 (`CAIXA DE RECEBIMENTO 8 TON.`) tem no banco `glb_rotacao_x = 0` e `glb_rotacao_z = 0`, ou seja, nenhuma correção aplicada. A inclinação vem de dentro do próprio arquivo GLB: o nó raiz `0202` foi exportado com uma rotação embutida de aproximadamente:

- X = 77,84 graus
- Y = 1,01 graus
- Z = 0 graus

O editor de orientação atual só permite girar em passos de 90 graus e só nos eixos X e Z. Como a inclinação do arquivo não é múltipla de 90 e tem componente em Y, é matematicamente impossível acertar esse modelo com os controles de hoje — daí a sensação de que "sempre fica meio inclinado".

## O que fazer

1. **Alinhar automaticamente (resolve o 0202 e qualquer outro modelo torto)**
   Novo botão "Alinhar automaticamente" no editor de orientação: lê a rotação embutida do nó raiz do GLB e calcula a correção inversa em graus, gravando nos campos de rotação do equipamento. Para o 0202 isso resulta em X = 282, Y = 359 (arredondado ao grau).

2. **Controles finos**
   Além dos passos de 90 graus, adicionar ajuste de 1 e 5 graus e campos numéricos editáveis para cada eixo, para o usuário refinar visualmente.

3. **Eixo Y**
   Passar a suportar rotação em Y (hoje só X e Z), necessária porque a inclinação do 0202 tem componente em Y.

4. **Aplicar em toda a exibição**
   A rotação em Y precisa ser respeitada no visualizador do catálogo e na tela de detalhe do visualizador 3D, além do editor.

5. **Salvar o valor do 0202**
   Depois de validar visualmente, gravar a rotação corrigida no registro do equipamento 0202.

## Detalhes técnicos

- Migração: adicionar coluna `glb_rotacao_y` (integer, default 0) em `public.equipamentos`.
- `src/components/GlbOrientationEditor.tsx`: prop `rotacaoY`, `onChange(x, y, z)`, botões +/-90, +/-5, +/-1 por eixo, inputs numéricos, e o botão de alinhamento automático (extrai o quaternion do nó raiz via `GLTFLoader`, converte para Euler, inverte e arredonda).
- `applyRotation` passa a aplicar `rotation.y` e recentrar/apoiar no chão como já faz hoje.
- `src/components/visualizador/EquipmentViewer3D.tsx`: nova prop `rotacaoY`.
- `src/pages/VisualizadorDetalhe.tsx`: buscar e repassar `glb_rotacao_y`.
- `src/pages/Catalogo.tsx`: passar/salvar o novo campo no formulário do equipamento.
- Sem mudança na lógica de negócio, preços ou PDFs.
