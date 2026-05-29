-- Tabela de leads vindos do RD Station
CREATE TABLE public.leads_rd (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rd_uuid text UNIQUE,
  email text,
  nome text,
  telefone text,
  empresa text,
  cargo text,
  cidade text,
  estado text,
  conversion_identifier text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  payload jsonb,
  status text NOT NULL DEFAULT 'novo',
  organizacao_id uuid,
  oportunidade_id uuid,
  convertido_por uuid,
  convertido_em timestamptz,
  descartado_motivo text,
  criado_em_rd timestamptz,
  recebido_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_leads_rd_status ON public.leads_rd(status);
CREATE INDEX idx_leads_rd_recebido_em ON public.leads_rd(recebido_em DESC);
CREATE INDEX idx_leads_rd_email ON public.leads_rd(email);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads_rd TO authenticated;
GRANT ALL ON public.leads_rd TO service_role;

ALTER TABLE public.leads_rd ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leads_rd_select" ON public.leads_rd FOR SELECT TO authenticated
USING (is_approved(auth.uid()) AND has_any_role(auth.uid(), ARRAY['admin'::app_role,'gerente_comercial'::app_role,'comercial'::app_role,'marketing'::app_role]));

CREATE POLICY "leads_rd_insert" ON public.leads_rd FOR INSERT TO authenticated
WITH CHECK (is_approved(auth.uid()) AND has_any_role(auth.uid(), ARRAY['admin'::app_role,'gerente_comercial'::app_role,'comercial'::app_role,'marketing'::app_role]));

CREATE POLICY "leads_rd_update" ON public.leads_rd FOR UPDATE TO authenticated
USING (is_approved(auth.uid()) AND has_any_role(auth.uid(), ARRAY['admin'::app_role,'gerente_comercial'::app_role,'comercial'::app_role,'marketing'::app_role]));

CREATE POLICY "leads_rd_delete" ON public.leads_rd FOR DELETE TO authenticated
USING (has_any_role(auth.uid(), ARRAY['admin'::app_role,'gerente_comercial'::app_role]));

CREATE TRIGGER trg_leads_rd_updated_at
BEFORE UPDATE ON public.leads_rd
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Log de sincronização
CREATE TABLE public.rd_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  iniciado_em timestamptz NOT NULL DEFAULT now(),
  finalizado_em timestamptz,
  total_recebidos integer NOT NULL DEFAULT 0,
  total_novos integer NOT NULL DEFAULT 0,
  total_atualizados integer NOT NULL DEFAULT 0,
  erro text,
  origem text NOT NULL DEFAULT 'cron'
);

GRANT SELECT ON public.rd_sync_log TO authenticated;
GRANT ALL ON public.rd_sync_log TO service_role;

ALTER TABLE public.rd_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rd_sync_log_select" ON public.rd_sync_log FOR SELECT TO authenticated
USING (has_any_role(auth.uid(), ARRAY['admin'::app_role,'gerente_comercial'::app_role,'marketing'::app_role]));