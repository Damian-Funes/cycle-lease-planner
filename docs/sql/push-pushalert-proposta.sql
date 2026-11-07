-- PROPOSTA (não aplicada): notificações push via PushAlert.
-- Aplicar somente após aprovação do CEO.

-- 1) Aparelhos inscritos (vários por usuário).
CREATE TABLE IF NOT EXISTS public.push_inscricoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscriber_id text NOT NULL UNIQUE CHECK (length(subscriber_id) BETWEEN 3 AND 200),
  plataforma text NOT NULL CHECK (plataforma IN ('ios','android','desktop')),
  user_agent text CHECK (length(user_agent) <= 120),
  ativo boolean NOT NULL DEFAULT true,
  motivo_inativo text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  ultimo_envio timestamptz
);
CREATE INDEX IF NOT EXISTS push_inscricoes_user_ativo_idx ON public.push_inscricoes (user_id) WHERE ativo;
GRANT SELECT ON public.push_inscricoes TO authenticated;
GRANT ALL ON public.push_inscricoes TO service_role;
ALTER TABLE public.push_inscricoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY push_inscricoes_ver ON public.push_inscricoes FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
-- Escrita só pelas RPCs abaixo (SECURITY DEFINER) e pelo servidor.

-- 2) Quais avisos viram push (por prefixo da chave da notificação). Espelho: supabase/functions/_shared/push.ts
CREATE TABLE IF NOT EXISTS public.push_regras (
  prefixo text PRIMARY KEY,
  descricao text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  urgente boolean NOT NULL DEFAULT false
);
GRANT SELECT ON public.push_regras TO authenticated;
GRANT UPDATE (ativo, urgente) ON public.push_regras TO authenticated;
GRANT ALL ON public.push_regras TO service_role;
ALTER TABLE public.push_regras ENABLE ROW LEVEL SECURITY;
CREATE POLICY push_regras_ver ON public.push_regras FOR SELECT TO authenticated USING (true);
CREATE POLICY push_regras_admin ON public.push_regras FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
INSERT INTO public.push_regras (prefixo, descricao, ativo, urgente) VALUES
  ('atividade:',        'Atividade vencida / escalada', true,  false),
  ('julia-admin:',      'Alguém marcou para você',      true,  false),
  ('caiu:',             'Ligação da Júlia caiu',        true,  true),
  ('falha:',            'Júlia não conseguiu ligar',    true,  false),
  ('nota:',             'Nota do hotel pendente',       true,  false),
  ('julia-recusadas:',  'Alerta de gasto da Júlia',     true,  true),
  ('rota-',             'Rota aprovada/reprovada',      true,  false),
  ('orcamento-trava:',  'Trava de orçamento',           true,  false),
  ('pend:',             'Pendências da viagem',         false, false),
  ('resumo:',           'Resumo do dia da viagem',      false, false)
ON CONFLICT (prefixo) DO NOTHING;

-- 3) Estado do push na própria notificação (nunca reenvia: só INSERT gera 'pendente').
ALTER TABLE public.notificacoes
  ADD COLUMN IF NOT EXISTS push_status text CHECK (push_status IN ('pendente','enviando','adiado','enviado','sem_aparelho','erro','ignorado','expirado')),
  ADD COLUMN IF NOT EXISTS push_enviado_em timestamptz;
CREATE INDEX IF NOT EXISTS notificacoes_push_adiado_idx ON public.notificacoes (created_at) WHERE push_status = 'adiado';

-- 4) RPCs do aparelho.
CREATE OR REPLACE FUNCTION public.fn_push_registrar(p_subscriber text, p_plataforma text, p_user_agent text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sessão necessária'; END IF;
  IF p_plataforma NOT IN ('ios','android','desktop') THEN p_plataforma := 'desktop'; END IF;
  -- Mesmo aparelho com outro usuário logado: reatribui ao atual.
  INSERT INTO push_inscricoes (user_id, subscriber_id, plataforma, user_agent)
  VALUES (auth.uid(), left(trim(p_subscriber),200), p_plataforma, left(p_user_agent,120))
  ON CONFLICT (subscriber_id) DO UPDATE
    SET user_id = auth.uid(), plataforma = EXCLUDED.plataforma, user_agent = EXCLUDED.user_agent,
        ativo = true, motivo_inativo = NULL, atualizado_em = now();
END $$;
REVOKE ALL ON FUNCTION public.fn_push_registrar(text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_push_registrar(text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_push_desativar(p_subscriber text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE push_inscricoes SET ativo = false, motivo_inativo = 'saiu do CRM', atualizado_em = now()
   WHERE subscriber_id = p_subscriber AND (user_id = auth.uid() OR has_role(auth.uid(),'admin'));
END $$;
REVOKE ALL ON FUNCTION public.fn_push_desativar(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_push_desativar(text) TO authenticated;

-- 5) Gatilho: só no INSERT real (ON CONFLICT DO UPDATE não dispara AFTER INSERT).
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE OR REPLACE FUNCTION public.fn_notificacoes_push() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r push_regras;
BEGIN
  SELECT * INTO r FROM push_regras WHERE NEW.chave LIKE prefixo || '%' ORDER BY length(prefixo) DESC LIMIT 1;
  IF r.prefixo IS NULL OR NOT r.ativo THEN RETURN NULL; END IF;
  UPDATE notificacoes SET push_status = 'pendente' WHERE id = NEW.id;
  BEGIN
    PERFORM net.http_post(
      url := 'https://sycqtlxoidsbsvrsvqes.supabase.co/functions/v1/push-enviar',
      headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN5Y3F0bHhvaWRzYnN2cnN2cWVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyNTEzOTAsImV4cCI6MjA4NjgyNzM5MH0.RQK4Y4uyvus2wxfZ6qI8j-4KUyrbLffpMGuAtF1crgU"}'::jsonb,
      body := jsonb_build_object('notificacao_id', NEW.id));
  EXCEPTION WHEN OTHERS THEN NULL; -- push nunca impede o sininho
  END;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_notificacoes_push ON public.notificacoes;
CREATE TRIGGER trg_notificacoes_push AFTER INSERT ON public.notificacoes
  FOR EACH ROW WHEN (NEW.chave IS NOT NULL) EXECUTE FUNCTION public.fn_notificacoes_push();

-- 6) Resumo dos avisos segurados no silêncio (21h–7h): uma vez por dia, 7h BRT = 10h UTC.
CREATE EXTENSION IF NOT EXISTS pg_cron;
DO $$ BEGIN PERFORM cron.unschedule('push-adiados-7h'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('push-adiados-7h', '0 10 * * *', $cron$
  SELECT net.http_post(
    url := 'https://sycqtlxoidsbsvrsvqes.supabase.co/functions/v1/push-enviar',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN5Y3F0bHhvaWRzYnN2cnN2cWVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyNTEzOTAsImV4cCI6MjA4NjgyNzM5MH0.RQK4Y4uyvus2wxfZ6qI8j-4KUyrbLffpMGuAtF1crgU"}'::jsonb,
    body := '{"acao":"adiados"}'::jsonb);
$cron$);
