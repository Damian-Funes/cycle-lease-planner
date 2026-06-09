
-- 1) Dossiês: substituir políticas "auth_full_access" (USING true) por restrições baseadas em papéis
DROP POLICY IF EXISTS auth_full_access ON public.dossies_sementeiras;
DROP POLICY IF EXISTS auth_full_access ON public.dossie_contatos;
DROP POLICY IF EXISTS auth_full_access ON public.dossie_equipamentos;
DROP POLICY IF EXISTS auth_full_access ON public.dossie_interacoes;
DROP POLICY IF EXISTS auth_full_access ON public.dossie_midias;

-- Quem pode acessar dossiês: papéis comerciais/operacionais aprovados
CREATE POLICY dossies_select ON public.dossies_sementeiras FOR SELECT TO authenticated
  USING (public.is_approved(auth.uid()) AND public.has_any_role(auth.uid(), ARRAY['admin','gerente_comercial','comercial','rtv','marketing','engenharia','operacao','viewer']::app_role[]));
CREATE POLICY dossies_write ON public.dossies_sementeiras FOR ALL TO authenticated
  USING (public.is_approved(auth.uid()) AND public.has_any_role(auth.uid(), ARRAY['admin','gerente_comercial','comercial','rtv','marketing','engenharia','operacao']::app_role[]))
  WITH CHECK (public.is_approved(auth.uid()) AND public.has_any_role(auth.uid(), ARRAY['admin','gerente_comercial','comercial','rtv','marketing','engenharia','operacao']::app_role[]));

CREATE POLICY dossie_contatos_select ON public.dossie_contatos FOR SELECT TO authenticated
  USING (public.is_approved(auth.uid()) AND public.has_any_role(auth.uid(), ARRAY['admin','gerente_comercial','comercial','rtv','marketing','engenharia','operacao','viewer']::app_role[]));
CREATE POLICY dossie_contatos_write ON public.dossie_contatos FOR ALL TO authenticated
  USING (public.is_approved(auth.uid()) AND public.has_any_role(auth.uid(), ARRAY['admin','gerente_comercial','comercial','rtv','marketing','engenharia','operacao']::app_role[]))
  WITH CHECK (public.is_approved(auth.uid()) AND public.has_any_role(auth.uid(), ARRAY['admin','gerente_comercial','comercial','rtv','marketing','engenharia','operacao']::app_role[]));

CREATE POLICY dossie_equipamentos_select ON public.dossie_equipamentos FOR SELECT TO authenticated
  USING (public.is_approved(auth.uid()) AND public.has_any_role(auth.uid(), ARRAY['admin','gerente_comercial','comercial','rtv','marketing','engenharia','operacao','viewer']::app_role[]));
CREATE POLICY dossie_equipamentos_write ON public.dossie_equipamentos FOR ALL TO authenticated
  USING (public.is_approved(auth.uid()) AND public.has_any_role(auth.uid(), ARRAY['admin','gerente_comercial','comercial','rtv','marketing','engenharia','operacao']::app_role[]))
  WITH CHECK (public.is_approved(auth.uid()) AND public.has_any_role(auth.uid(), ARRAY['admin','gerente_comercial','comercial','rtv','marketing','engenharia','operacao']::app_role[]));

CREATE POLICY dossie_interacoes_select ON public.dossie_interacoes FOR SELECT TO authenticated
  USING (public.is_approved(auth.uid()) AND public.has_any_role(auth.uid(), ARRAY['admin','gerente_comercial','comercial','rtv','marketing','engenharia','operacao','viewer']::app_role[]));
CREATE POLICY dossie_interacoes_write ON public.dossie_interacoes FOR ALL TO authenticated
  USING (public.is_approved(auth.uid()) AND public.has_any_role(auth.uid(), ARRAY['admin','gerente_comercial','comercial','rtv','marketing','engenharia','operacao']::app_role[]))
  WITH CHECK (public.is_approved(auth.uid()) AND public.has_any_role(auth.uid(), ARRAY['admin','gerente_comercial','comercial','rtv','marketing','engenharia','operacao']::app_role[]));

CREATE POLICY dossie_midias_select ON public.dossie_midias FOR SELECT TO authenticated
  USING (public.is_approved(auth.uid()) AND public.has_any_role(auth.uid(), ARRAY['admin','gerente_comercial','comercial','rtv','marketing','engenharia','operacao','viewer']::app_role[]));
CREATE POLICY dossie_midias_write ON public.dossie_midias FOR ALL TO authenticated
  USING (public.is_approved(auth.uid()) AND public.has_any_role(auth.uid(), ARRAY['admin','gerente_comercial','comercial','rtv','marketing','engenharia','operacao']::app_role[]))
  WITH CHECK (public.is_approved(auth.uid()) AND public.has_any_role(auth.uid(), ARRAY['admin','gerente_comercial','comercial','rtv','marketing','engenharia','operacao']::app_role[]));

-- 2) config_montagem: restringir leitura a admin/financeiro/gerente_comercial (parâmetros financeiros internos)
DROP POLICY IF EXISTS config_montagem_select ON public.config_montagem;
CREATE POLICY config_montagem_select ON public.config_montagem FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','financeiro','gerente_comercial']::app_role[]));

-- 3) equipamentos: restringir SELECT a papéis que realmente usam custos/orçamentos
DROP POLICY IF EXISTS "Approved users can view equipamentos" ON public.equipamentos;
CREATE POLICY equipamentos_select ON public.equipamentos FOR SELECT TO authenticated
  USING (public.is_approved(auth.uid()) AND public.has_any_role(auth.uid(), ARRAY['admin','gerente_comercial','comercial','financeiro','engenharia','operacao']::app_role[]));
