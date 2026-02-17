

## Corrigir logo no PDF

O logo ja esta definido como base64 no codigo, mas o `addImage` do jsPDF pode falhar silenciosamente com certas imagens PNG. A solucao e pre-carregar a imagem em um `HTMLImageElement` ou usar um canvas intermediario para garantir que o jsPDF consiga processar.

### Alteracao em `src/lib/generatePdf.ts`

1. Tornar a funcao `generatePdf` **async**
2. Antes de gerar o PDF, pre-carregar o logo em um `Image()` do HTML e desenhar em um canvas temporario, convertendo para um data URL limpo (JPEG ou PNG re-renderizado)
3. Passar essa imagem processada para `doc.addImage` em cada chamada de `addHeader`
4. Manter o fallback de texto caso a imagem falhe

Fluxo:

```text
base64 original --> new Image() --> canvas.drawImage() --> canvas.toDataURL("image/png") --> doc.addImage()
```

Isso resolve problemas comuns onde o jsPDF nao consegue decodificar o PNG original diretamente.

### Ajustes necessarios

- `generatePdf` passa a ser `async` (retorna `Promise<void>`)
- `addHeader` recebe um parametro adicional `logoImage: string | null` (a imagem ja processada)
- O botao "Exportar PDF" no `ProposalTab.tsx` ja usa `await`, entao nao precisa de mudanca la

