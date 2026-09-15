# Corrigir números duplicados de orçamento

## Problema confirmado
A numeração é calculada apenas com os orçamentos que o vendedor consegue visualizar. Como outros números ficam ocultos pelas permissões, o aplicativo pode tentar reutilizar um número existente. O tratamento atual avança somente 10 números e depois exibe o erro de duplicidade.

## Implementação
- Centralizar a resolução de colisões no banco, dentro da própria gravação, para que dois usuários nunca confirmem o mesmo número.
- Preservar o padrão atual `ORC2026-XXX` e as revisões `-V2`, `-V3`.
- Fazer a tela receber e exibir o número que o banco realmente gravou.
- Aplicar a mesma proteção ao caminho que cria orçamento a partir de um negócio.

## Verificação
- Simular tentativa de salvar com um número já existente e confirmar que o próximo disponível é usado.
- Verificar criação normal e criação de revisão.
- Executar os testes relevantes e a checagem automática do projeto.
