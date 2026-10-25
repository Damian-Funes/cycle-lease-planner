# Autorização e prestação de contas das Rotas Comerciais

## O que será implementado
- Migrar rotas antigas para rascunho, sem apagar dados, e adicionar campos de aprovação e prestação de contas.
- Aplicar no banco as quatro travas solicitadas, proteger alterações de planejamento e manter acesso limitado ao vendedor ou admin.
- Atualizar lista e editor com objetivos, envio, reprovação e prestação de contas por parada, reutilizando a conclusão de atividades e o próximo passo existentes.
- Criar a página administrativa com aprovação em um clique, reprovação com motivo, mapa, pendências e resumo mensal; adicionar os alertas na Home.
- Entregar SQL completo, relação de arquivos/linhas e testes das regras.

## Regras complementares de segurança
- Impedir criação direta de rota aprovada/concluída e falsificação dos campos de aprovação.
- Impedir troca de vendedor, exclusão ou retorno a rascunho para contornar uma prestação pendente.
- Somente rascunhos e reprovadas são editáveis pelo vendedor; rota aprovada futura pode ser alterada, exigindo reaprovação.
- A transição de conclusão só parte de uma rota aprovada cuja data chegou. O admin pode cancelar uma viagem que não ocorreu; vendedor não cancela uma aprovada para eliminar pendência.

## Detalhes técnicos
- Migration idempotente com funções/triggers, validações de estado e concorrência, RLS e permissões explícitas; nenhuma alteração nas funções Google ou Frete.
- Componentes pequenos para status, prestação de contas e aprovação, compartilhando consultas e validações em rotas.
- Verificar regras com testes, rodar testes relacionados e validar telas disponíveis. Sem iniciar viagens ou concluir atividades reais para teste. Acesso autenticado externo pode limitar a verificação completa.