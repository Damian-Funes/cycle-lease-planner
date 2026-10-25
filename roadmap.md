# Rotas: autorização e prestação de contas
- [x] Alinhar datas ao fuso America/Sao_Paulo no banco e na interface; e-mail de amanhã somente para aprovadas; testar a virada do dia.

Verificação do ajuste BRT: 25 testes passaram (10 interface, 13 banco, 2 e-mail). Migration reaplicada no banco descartável para confirmar idempotência; oito comparações BRT e nenhum current_date nas funções do banco conectado. Testes cobrem 21h BRT, meia-noite, aprovação e reaprovação noturnas e bloqueio de prestação antecipada. E-mail atualizado e função publicada, sem envio real. Build OK.
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