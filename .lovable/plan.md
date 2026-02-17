

## Ocultar Valores Individuais de Custo, Manter Apenas o Total da Entrada

O comercial precisa ver o **valor total da entrada** (soma dos custos) para completar o "Valor Total do Projeto" e fazer as contas. Porem, os valores unitarios e subtotais por equipamento devem ficar ocultos.

### Alteracoes

**1. `src/components/EquipmentSelector.tsx` (aba Dimensionamento)**
- Remover a coluna "Valor Unit." da tabela de itens
- Remover a coluna "Subtotal" da tabela de itens
- **Manter** o rodape "Custo Total (Entrada)" com o valor total calculado (o comercial precisa desse numero)
- Ajustar o `colSpan` do rodape para refletir as colunas restantes (Codigo, Descricao, Qtd, Acao)

**2. `src/components/EquipmentTable.tsx` (aba Resumo Proposta)**
- Remover a coluna "Subtotal" da tabela
- Remover o rodape "Custo Total (Entrada)" (o cliente nao deve ver custos)
- Manter apenas: Codigo, Descricao e Qtd

