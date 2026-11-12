# Gravar conversa com o cliente (fazer depois do funil Multinacionais)

SQL só como proposta em `docs/sql/gravacao-conversa-proposta.sql`, aplicado após OK do CEO.

## O que já existe
- Armazenamento: buckets privados `deal-files`, `plantas-cliente`, `viagens` (nenhum de áudio).
- Tipos de atividade: Reunião e Visita já existem (usaremos "Visita" se presencial, "Reunião" se no escritório do cliente).
- WhatsApp (Pipeline 2): a transcrição é feita fora do CRM e só grava o texto em `whatsapp_mensagens_recebidas.transcricao*`. Não há função de transcrição no CRM para reaproveitar; reaproveitamos só o padrão de colunas (pendente/erro/original).
- Debrief da Júlia: validação compartilhada em `_shared` — o resumo da IA usa o mesmo formato.
- Segredo ELEVENLABS_API_KEY já existe (a confirmar que é a mesma chave da Júlia e que inclui Speech-to-Text).

## Antes / depois
| Antes | Depois |
|---|---|
| Visita só registrada por voz com a Júlia ou digitada | Botão "Gravar conversa" na empresa, negócio e parada da Viagem de hoje |
| Sem prova de autorização | Gravação começa com a pergunta lida + resposta; consentimento salvo (quem, quando, empresa/pessoa) |
| Tarefas criadas à mão | IA sugere tarefas; vendedor confirma com um toque |

## Fluxo
1. Tela de consentimento: texto "Posso gravar nossa conversa para registrar o que combinamos?", escolhe a pessoa (opcional) e toca "Cliente autorizou — gravar". Se recusar, não grava (e registra a recusa).
2. Gravação: MediaRecorder (Safari usa mp4/aac, Chrome webm/opus), Wake Lock, cronômetro, pausar/retomar, partes de 30 s enviadas ao armazenamento enquanto grava. Aviso fixo: "Não troque de app nem bloqueie a tela". Se a página perder o foco, marca a gravação como interrompida e oferece "continuar" (nova parte).
3. Ao finalizar: função `gravacao-processar` junta as partes, transcreve com ElevenLabs Scribe (pt, com separação de falantes) e gera o resumo com a IA do Lovable no formato do debrief: participantes, situação (sacos/safra, equipamento atual), problema, interesse, objeções, concorrente, próximo passo + data, tarefas sugeridas.
4. Cria atividade concluída (Visita/Reunião) na empresa/negócio e liga à parada, se houver; atividade mostra resumo, transcrição e player (link assinado de 10 min).
5. Tarefas sugeridas aparecem como cartões "Criar" / "Descartar"; só viram atividades com o toque (via função SQL existente de criação de atividade).
6. Visibilidade: mesma regra da empresa (dono + admin/gerente); áudio só por link assinado.
7. Retenção proposta: áudio apagado após 12 meses (job diário); transcrição, resumo e consentimento ficam. Pedido LGPD do titular apaga também o áudio (estende `fn_lgpd_excluir_dados_pessoa`).

## Custo estimado por hora de áudio
- ElevenLabs Scribe: cerca de US$ 0,22–0,40/h conforme plano (≈ R$ 1,30–2,40).
- Resumo IA: ~15 mil palavras de transcrição por hora → poucos centavos (< R$ 0,20).
- Armazenamento: ~30–60 MB/h (aac/opus 64 kbps) — irrelevante.
- Total: aproximadamente R$ 1,50–2,60 por hora gravada.

## Riscos
- iPhone: Safari para a gravação ao bloquear tela/trocar app; Wake Lock só no iOS 16.4+. Mitigação: partes de 30 s + aviso + retomar.
- Tamanho: 2 h ≈ 100 MB; partes pequenas evitam upload grande; limite de 3 h por gravação.
- Ruído (galpão, máquinas): transcrição pior; dica na tela para deixar o celular na mesa perto do cliente; resumo marca "trechos inaudíveis".
- LGPD: consentimento gravado no próprio áudio + registro; retenção de 12 meses; nunca público; recusa também registrada.
- Custo fora de controle: limite mensal de horas em configuração, aviso ao admin igual ao da Júlia.

## Detalhes técnicos
SQL proposto (docs/sql, não aplicado):
- Bucket privado `gravacoes` (criado pela ferramenta, não por SQL); políticas em `storage.objects` com `CASE bucket_id` + `fn_uuid_seguro`, caminho `<gravacao_id>/<parte>`.
- Tabela `gravacoes_conversa`: organizacao_id, oportunidade_id, rota_parada_id, pessoa_id, vendedor_id, consentimento_em, consentimento_texto, recusado, status (gravando/processando/pronta/erro/interrompida), duracao_s, partes, transcricao, resumo jsonb, tarefas_sugeridas jsonb, atividade_id, audio_apagado_em, erro, timestamps. GRANT authenticated/service_role; RLS: ver/editar quem pode ver a organização (mesma regra atual) + admin; só service_role grava transcrição/resumo.
- `fn_gravacao_confirmar_tarefa(_gravacao_id, _indice)`: cria a atividade e marca a sugestão como criada (idempotente).
- `fn_gravacoes_expirar()`: service-only, apaga áudios > 12 meses (cron diário) e grava `audio_apagado_em`.
- Configuração em `gravacao_config`: meses de retenção, limite mensal de horas.

Código: `src/lib/gravacao.ts` (puro: escolha de formato, divisão em partes, validação do resumo, testado), componente `GravarConversa`, função `gravacao-processar` (valida usuário, Zod, ElevenLabs direto com xi-api-key, IA via gateway).
