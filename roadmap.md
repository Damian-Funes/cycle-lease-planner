# Rotas: autorização e prestação de contas
- [x] Migration idempotente e testes das travas no banco.
- [x] Editor com objetivos, envio e prestação por parada.
- [x] Aprovações admin, resumo mensal e alertas na Home/lista.
- [x] Validar testes, telas e entregar SQL/arquivos.

Verificação Rotas: 29 testes passaram, incluindo triggers reais e RLS em Postgres descartável. Componentes reais exercitados em navegador com dados fictícios: envio, aprovação em um clique, não visita, conclusão e visita vinculada à atividade com resultado obrigatório. Sem erros de execução; mobile sem overflow. Build OK. As cinco rotas antigas continuam preservadas como rascunho. Sem sessão de Supabase externo para validar o percurso autenticado com dados reais.

# Integração Júlia
- [x] Ação de ligação com confirmação e bloqueio por contato.
- [x] Histórico e transcrição em orçamentos e oportunidades, com polling.
- [x] Relatório de motivos, indicadores, filtros e navegação.
- [x] Verificar tipos existentes, erros e testes frontend sem iniciar ligações reais.

Verificação: cinco testes unitários e testes isolados no navegador com dados fictícios (relatório desktop/mobile, filtro, transcrição, confirmação, erro 403 em português, bloqueio e polling). Sem sessão disponível para testar o fluxo autenticado real; nenhuma ligação real iniciada.