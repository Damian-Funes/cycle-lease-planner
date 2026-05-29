
-- Fix overly permissive policies and function search paths

-- 1) config_montagem: restrict SELECT to approved users
DROP POLICY IF EXISTS config_montagem_select ON public.config_montagem;
CREATE POLICY config_montagem_select ON public.config_montagem
  FOR SELECT
  USING (public.is_approved(auth.uid()));

-- 2) formas_pagamento: restrict writes to admins, keep reads broad
DROP POLICY IF EXISTS formas_pagamento_write ON public.formas_pagamento;
CREATE POLICY formas_pagamento_admin_write ON public.formas_pagamento
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 3) historico_oportunidade: explicitly deny client INSERT/UPDATE/DELETE (writes via triggers/service role)
CREATE POLICY hist_opp_no_client_insert ON public.historico_oportunidade
  FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY hist_opp_no_client_update ON public.historico_oportunidade
  FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY hist_opp_no_client_delete ON public.historico_oportunidade
  FOR DELETE TO authenticated USING (false);

-- 4) Set immutable search_path on user-defined functions
ALTER FUNCTION public.set_updated_at_formas_pagamento() SET search_path = public;
ALTER FUNCTION public.trg_atualizar_timestamp() SET search_path = public;
ALTER FUNCTION public.trg_atualizar_ultima_interacao() SET search_path = public;
ALTER FUNCTION public.buscar_dossies_similares(text, integer) SET search_path = public;
