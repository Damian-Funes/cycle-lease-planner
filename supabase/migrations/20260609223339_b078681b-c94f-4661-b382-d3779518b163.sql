
CREATE TABLE IF NOT EXISTS public.email_notifications_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL,
  destinatario_user_id uuid,
  destinatario_email text NOT NULL,
  assunto text NOT NULL,
  enviado_em timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'enviado',
  erro text,
  referencia_id uuid,
  referencia_tipo text
);
CREATE INDEX IF NOT EXISTS idx_email_log_tipo_ref ON public.email_notifications_log(tipo, referencia_id, enviado_em DESC);
CREATE INDEX IF NOT EXISTS idx_email_log_user ON public.email_notifications_log(destinatario_user_id, enviado_em DESC);

GRANT SELECT ON public.email_notifications_log TO authenticated;
GRANT ALL ON public.email_notifications_log TO service_role;
ALTER TABLE public.email_notifications_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin ve tudo log" ON public.email_notifications_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "usuario ve seus logs" ON public.email_notifications_log
  FOR SELECT TO authenticated
  USING (destinatario_user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.email_notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  resumo_semanal boolean NOT NULL DEFAULT true,
  orgs_incompletas boolean NOT NULL DEFAULT true,
  deals_parados boolean NOT NULL DEFAULT true,
  atividades_vencidas boolean NOT NULL DEFAULT true,
  oportunidade_ganha boolean NOT NULL DEFAULT true,
  cliente_sem_visita boolean NOT NULL DEFAULT true,
  rota_amanha boolean NOT NULL DEFAULT true,
  resumo_diario boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.email_notification_preferences TO authenticated;
GRANT ALL ON public.email_notification_preferences TO service_role;
ALTER TABLE public.email_notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "usuario gerencia suas prefs" ON public.email_notification_preferences
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "admin ve todas prefs" ON public.email_notification_preferences
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_email_prefs_updated
  BEFORE UPDATE ON public.email_notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
