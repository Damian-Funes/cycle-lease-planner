-- PROPOSTA (NÃO APLICADA) — Correção de segurança: anon e funções abertas.
-- Aplicar só após aprovação do CEO e confirmação de que nenhum n8n/bot usa as funções de dossiê/perfil.
-- Reverter qualquer item: GRANT EXECUTE ON FUNCTION ... TO anon, authenticated;

BEGIN;

-- A) Views usadas pelo app: passam a respeitar o RLS de quem consulta; sem anon.
ALTER VIEW public.vw_atividades_usuario  SET (security_invoker = true);
ALTER VIEW public.vw_pessoa_perfil_atual SET (security_invoker = true);
ALTER VIEW public.vw_organizacao_dossie  SET (security_invoker = true);
ALTER VIEW public.vw_dossies_pendentes   SET (security_invoker = true);
REVOKE ALL ON public.vw_atividades_usuario, public.vw_pessoa_perfil_atual,
  public.vw_organizacao_dossie, public.vw_dossies_pendentes FROM anon;

-- Views/tabela sem uso no app: só servidor.
REVOKE ALL ON public.vw_dossie_resumo, public.vw_ultima_sessao_telefone,
  public.dossie_pendencias FROM anon, authenticated;
GRANT ALL ON public.vw_dossie_resumo, public.vw_ultima_sessao_telefone,
  public.dossie_pendencias TO service_role;

-- B1) Funções usadas por usuário logado: tira só anon.
REVOKE EXECUTE ON FUNCTION
  public.fn_oportunidade_rotting(uuid),
  public.fn_lgpd_excluir_dados_pessoa(uuid),
  public.fn_lgpd_exportar_dados_pessoa(uuid)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.fn_oportunidade_rotting(uuid),
  public.fn_lgpd_excluir_dados_pessoa(uuid),
  public.fn_lgpd_exportar_dados_pessoa(uuid)
TO authenticated, service_role;

-- B2) Funções só de servidor/bot (dossiê, perfil IA) e internas.
REVOKE EXECUTE ON FUNCTION
  public.buscar_pendencia_ativa(text),
  public.concluir_atividades_dossie(uuid, text),
  public.criar_atividade_dossie(uuid, text, text, text, date, uuid),
  public.criar_evento_agenda(uuid, text, text, date, date),
  public.fn_conversas_para_perfil(integer),
  public.fn_gravar_perfil(uuid, jsonb, text, integer, timestamptz, timestamptz, uuid, text, text),
  public.fn_match_pessoa_por_telefone(text),
  public.fn_proximo_comercial_para_estado(uuid),
  public.identificar_sementeira(text),
  public.upsert_dossie_por_org(uuid, text, text, text, text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.buscar_pendencia_ativa(text),
  public.concluir_atividades_dossie(uuid, text),
  public.criar_atividade_dossie(uuid, text, text, text, date, uuid),
  public.criar_evento_agenda(uuid, text, text, date, date),
  public.fn_conversas_para_perfil(integer),
  public.fn_gravar_perfil(uuid, jsonb, text, integer, timestamptz, timestamptz, uuid, text, text),
  public.fn_match_pessoa_por_telefone(text),
  public.fn_proximo_comercial_para_estado(uuid),
  public.identificar_sementeira(text),
  public.upsert_dossie_por_org(uuid, text, text, text, text)
TO service_role;

-- B3) Funções de trigger: ninguém chama direto (triggers continuam funcionando).
REVOKE EXECUTE ON FUNCTION
  public.fn_atribuir_responsavel_org(), public.fn_atribuir_responsavel_pessoa(),
  public.fn_atualizar_atividade_assumir_orgs(), public.fn_audit_trigger(),
  public.fn_congelar_ao_aprovar(), public.fn_diario_imutavel(),
  public.fn_log_oportunidade_evento(), public.fn_notificacoes_usuario_so_lida(),
  public.fn_organizacoes_matriz_validar(), public.fn_perfil_desatualizar_anteriores(),
  public.fn_rotas_periodo(), public.fn_set_responsavel_creator(),
  public.fn_set_responsavel_default(), public.fn_sync_dados_organizacao(),
  public.fn_sync_estado_organizacao(), public.fn_sync_oportunidade_atividades(),
  public.fn_validar_viagem_cadastros(), public.handle_new_user(),
  public.log_oportunidade_changes(), public.log_oportunidade_created(),
  public.recalc_montagem_total(), public.set_updated_at_formas_pagamento(),
  public.tipicos_impedir_mudanca_tipo(), public.trg_atualizar_timestamp(),
  public.trg_atualizar_ultima_interacao(), public.update_updated_at_column()
FROM PUBLIC, anon, authenticated;

-- C) search_path fixo.
ALTER FUNCTION public.fn_tel_digitos(text) SET search_path = public;
ALTER FUNCTION public.fn_tel_chave_match(text) SET search_path = public;
ALTER FUNCTION public.fn_conversas_para_perfil(integer) SET search_path = public;
ALTER FUNCTION public.fn_gravar_perfil(uuid, jsonb, text, integer, timestamptz, timestamptz, uuid, text, text) SET search_path = public;

-- Crítico do painel: push_regras só admin (policy push_regras_admin já cobre; servidor usa service_role).
DROP POLICY IF EXISTS push_regras_ver ON public.push_regras;

COMMIT;
