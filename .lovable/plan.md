

# Correcao do Logo no PDF

## Problema raiz

O logo esta sendo adicionado corretamente via `doc.addImage()` na posicao y=10. Porem, a tabela `autoTable` que mostra os dados da empresa e do cliente tambem comeca em `startY: 10`, e o cabecalho da tabela (com fundo verde) pinta por cima do logo, cobrindo-o completamente.

## Solucao

Mover o logo para **acima** da tabela e ajustar o `startY` da tabela para comecar **abaixo** do logo.

### Alteracoes em `src/lib/generatePdf.ts`

1. **Manter o logo na posicao atual** (x=15, y=10, w=25, h=12) -- ele ocupa de y=10 ate y=22
2. **Mover o `startY` da tabela** de 10 para ~24, para que a tabela comece logo abaixo do logo
3. **Remover o texto "LS DO BRASIL" do cabecalho da tabela** (coluna 0), ja que o logo real agora ficara visivel acima -- ou manter o texto como referencia da empresa mas sem cobrir o logo
4. Ajustar o `drawLogoFallback` para tambem funcionar nessa nova posicao

### Detalhes tecnicos

Na funcao `addHeader`:

- Logo: `doc.addImage(logoDataUrl, "JPEG", 15, 10, 25, 12)` (mantido)
- Tabela: mudar `startY: 10` para `startY: 24`
- Isso garante que o logo fica visivel acima da tabela com os dados da empresa/cliente

Essa e uma mudanca de 1-2 linhas que resolve o problema sem alterar nada na logica de geracao do PDF.

