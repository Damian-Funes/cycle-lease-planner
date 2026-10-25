# Diagnóstico técnico e capacidade

- Criar modelos e parâmetros editáveis pelo admin, com os valores fornecidos e leitura autenticada.
- Salvar diagnósticos e snapshot completo por negócio/organização, com acesso próprio, administrativo ou permitido pelo negócio, e auditoria.
- Criar calculador com formulário à esquerda, resultados ao vivo à direita, comparação de todos os modelos e menor modelo com folga mínima.
- Incluir equipamento atual, conversão sacos/h, vínculos, edição do último diagnóstico e geração de orçamento após salvar.
- Adicionar configuração administrativa e acessos na Home, negócio e organização.
- Testar fórmulas, recomendação e validações; verificar telas sem alterar Orçamento, Típicos, Rotas ou Atividades.

## Interpretações
- “Justo” atende à janela mas fica abaixo da folga mínima; modelos que atingem a folga aparecem como aptos, com destaque de recomendação apenas no menor.
- Produtos líquidos e pó são registrados, sem alterar a fórmula nesta etapa.
- Milho, trigo e outra exigem peso informado enquanto não houver padrão cadastrado.

## Detalhes técnicos
- Migration idempotente com grants, RLS usando has_role/pode_ver_oportunidade e triggers de atualização/auditoria existentes.
- Cálculo puro em src/lib/capacidade.ts e consultas compartilhadas para calculador, configuração e resumo dos diagnósticos.
- Nenhuma trava de orçamento, alteração de status ou mudança em funções existentes.