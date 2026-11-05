# Diagnóstico técnico
- [ ] Banco, permissões e auditoria.
- [ ] Cálculo e testes de negócio.
- [ ] Calculador, configuração e acessos nos vínculos.
- [ ] Verificação e entrega do SQL.

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
# Funil: referência x projeto
- [ ] Plano pronto, aguardando o usuário retomar (pausado a pedido).

# Rotas: traçado pelas estradas
- [x] calcularRota, DirectionsRenderer no editor e aprovações, recálculo automático, resumo, Google Maps/Waze, erros por parada.
- [x] Clientes no caminho: sugestões por trajeto, prioridade, inserção mais barata, marcadores.
- [x] Localizar organizações sem coordenada (admin, lote).
- [ ] Coluna `coordenada_aproximada` — aguardando aprovação da SQL pelo usuário.

# Viagens sem dia planejado
- [x] Migration: rota_pernoites (hotel/sem_custo/voltou_base), dia realizado, pernoite obrigatório por noite, dados existentes.
- [x] Planejamento sem dia/pernoite/diária (editor, aprovação, mapa, pedágio).
- [x] ViagemHoje: pendentes, hoje, histórico, fechar o dia, voltei para a base, encerrar.
- [x] Acompanhar/Andamento com dia real, pernoites e hotel real.
- [x] Testes.

# Júlia só para vendedores (fechamento do dia por voz)
- [x] Código de voz, pendências, notificações, testes e documentação ElevenLabs.
- [x] SQL completo de migration e cron preparado, sem execução no Supabase.
- [ ] Aplicar migration/cron — bloqueado até aprovação explícita do SQL.
- [ ] Teste real de voz e telas — depende da migration e configuração do agente/secrets ElevenLabs; secret do cron deve ser sincronizado no Vault pelo dono.

# WhatsApp: status da conta (somente leitura)
- [x] Função whatsapp-status (admin, Graph API v21.0).
- [ ] Rodar uma vez — usuário roda pelo console (sessão admin não acessível ao agente).
- [x] Função whatsapp-ativar publicada (usuário chama pelo console).
