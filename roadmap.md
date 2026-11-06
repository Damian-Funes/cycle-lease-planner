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
- [x] Aceitar quantidades por extenso, datas brasileiras e vazios semânticos; payload real validado, 63 testes passaram e função verificada sem ligações nem migration.
- [x] Normalizar campos opcionais/números e ignorar chaves extras nas ferramentas; 33 testes passaram, reprodução antes/depois validada e função publicada sem ligações nem migration.
- [x] Corrigir secrets, endpoint e erro ElevenLabs; função publicada sem ligar, 39 testes unitários/SQL e 5 de autenticação passaram; SQL de repetição validado em banco descartável.
- [ ] Aplicar docs/sql/julia-viagem-reteste-proposta.sql — aguarda aprovação explícita; reutiliza testes encerrados e exclui testes do limite de três tentativas reais, inclusive no webhook.
- [x] Corrigir cartão de configuração sempre visível, erros explícitos e seletor de viagens atuais; 19 testes e navegador desktop/mobile com consultas simuladas passaram, sem ligações nem alterações no banco. Sessão real do Damian indisponível no Supabase externo.
- [x] Código de voz, pendências, notificações, testes e documentação ElevenLabs.
- [x] SQL completo preparado; migration aprovada aplicada, cron somente proposto.
- [x] Incluir relato SPIN, atividade do próximo passo, visualização admin e novos testes.
- [x] Aplicar migration aprovada com relato e conferir celulares, RLS e status da viagem.
- [ ] Cron — permanece sem aprovação; não criar nem ativar ligações.
- [ ] Teste real de voz e telas — aguarda autorização para ligar, configuração do agente/secrets ElevenLabs e sessão autenticada indisponível no Supabase externo; cron depende de aprovação e secret sincronizado no Vault.

# WhatsApp: status da conta (somente leitura)
- [x] Função whatsapp-status (admin, Graph API v21.0).
- [ ] Rodar uma vez — usuário roda pelo console (sessão admin não acessível ao agente).
- [x] Função whatsapp-ativar publicada (usuário chama pelo console).

# Visitas alimentam a Organização
- [x] Histórico de levantamentos, situação atual, gatilho não bloqueante, contato/decisor, atividade sem duplicata, backfill (aplicado).
- [x] Aba "Levantamento técnico" na Organização e sacos/safra pré-preenchido no Diagnóstico.

# Júlia vincula empresa + Matriz/Filial + notificações "o que faltou"
- [x] SQL (matriz, vínculo sem reaprovação, busca/vínculo, decisores, notificações, correção Patos de Minas) testado e aplicado.
- [x] Ferramentas buscar/vincular, pendências únicas, sincronização de notificações (webhook, fechar dia, sino), resumo admin.
- [x] Telas: Filial/Filiais, levantamento por unidade; roteiro completo + 6 schemas no doc.

# Atividades reais, resolvíveis e cobradas
- [x] Parar de criar "Visita planejada" na viagem.
- [x] Feito/Reagendar/Cancelar com motivo (agenda, organização/negócio, aviso de abertura); edição de data passa pelo reagendar.
- [x] Aviso "Você tem N vencidas" ao abrir o CRM (1x por sessão/dia).
- [x] Aba Atrasadas + placar semanal (admin).
- [x] Ferramentas da Júlia documentadas como "Futuro — não colar".
- [x] Adendo: ação "Não fiz", Feito com 10+ caracteres, trava do Novo orçamento (tela + banco), liberação do admin, placar com Não fiz/liberações.
- [x] Migração de cobrança aplicada (trava desligada).
- [ ] Ligar trava_orcamento_ativa — depois do publish do frontend novo.
- [x] Limpeza aplicada: 25 zeradas.

# Júlia completa organizações incompletas
- [x] Regra única de completa (sem e-mail), descarte com motivo, preenchimento na lista.
- [x] Ferramentas listar_organizacoes_incompletas (1 por ligação) e completar_organizacao + item opcional nas pendências.
- [x] Faxina semanal preparada (desligada); placar com orgs completadas/descartadas; docs ElevenLabs.
- [ ] Aplicar SQL — aguardando aprovação.
- [ ] Localizar no mapa as ~45 orgs sem coordenadas (botão "Localizar organizações") — depois do SQL.
