
DROP POLICY IF EXISTS config_montagem_select ON public.config_montagem;
CREATE POLICY config_montagem_select ON public.config_montagem
  FOR SELECT TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'financeiro'::app_role, 'gerente_comercial'::app_role, 'comercial'::app_role, 'rtv'::app_role, 'engenharia'::app_role, 'operacao'::app_role]));
