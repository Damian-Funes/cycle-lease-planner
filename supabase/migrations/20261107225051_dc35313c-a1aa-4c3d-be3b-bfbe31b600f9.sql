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

ALTER TABLE public.notificacoes
  ADD COLUMN IF NOT EXISTS push_status text CHECK (push_status IN ('pendente','enviando','adiado','enviado','sem_aparelho','erro','ignorado','expirado')),
  ADD COLUMN IF NOT EXISTS push_enviado_em timestamptz;
CREATE INDEX IF NOT EXISTS notificacoes_push_adiado_idx ON public.notificacoes (created_at) WHERE push_status = 'adiado';

CREATE OR REPLACE FUNCTION public.fn_push_registrar(p_subscriber text, p_plataforma text, p_user_agent text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sessão necessária'; END IF;
  IF p_plataforma NOT IN ('ios','android','desktop') THEN p_plataforma := 'desktop'; END IF;
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
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_notificacoes_push ON public.notificacoes;
CREATE TRIGGER trg_notificacoes_push AFTER INSERT ON public.notificacoes
  FOR EACH ROW WHEN (NEW.chave IS NOT NULL) EXECUTE FUNCTION public.fn_notificacoes_push();

CREATE EXTENSION IF NOT EXISTS pg_cron;
DO $$ BEGIN PERFORM cron.unschedule('push-adiados-7h'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('push-adiados-7h', '0 10 * * *', $cron$
  SELECT net.http_post(
    url := 'https://sycqtlxoidsbsvrsvqes.supabase.co/functions/v1/push-enviar',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN5Y3F0bHhvaWRzYnN2cnN2cWVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyNTEzOTAsImV4cCI6MjA4NjgyNzM5MH0.RQK4Y4uyvus2wxfZ6qI8j-4KUyrbLffpMGuAtF1crgU"}'::jsonb,
    body := '{"acao":"adiados"}'::jsonb);
$cron$);

ALTER TABLE public.rotas ADD COLUMN IF NOT EXISTS envios_aprovacao integer NOT NULL DEFAULT 0;

INSERT INTO public.push_regras (prefixo, descricao, ativo, urgente) VALUES
  ('rota-enviada:',   'Rota enviada para aprovação (admins)', true,  false),
  ('rota-aprovada:',  'Sua rota foi aprovada',                true,  false),
  ('rota-reprovada:', 'Sua rota foi reprovada',               true,  false),
  ('rota-rascunho:',  'Rota retirada da aprovação',           false, false),
  ('rota-prestacao:', 'Prestação de contas concluída',        false, false)
ON CONFLICT (prefixo) DO NOTHING;
UPDATE public.push_regras SET ativo = false WHERE prefixo = 'orcamento-trava:';

CREATE OR REPLACE FUNCTION public.fn_rotas_contar_envio() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status='aguardando_aprovacao' AND OLD.status IS DISTINCT FROM 'aguardando_aprovacao' THEN
    NEW.envios_aprovacao := OLD.envios_aprovacao + 1;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_rotas_zz_contar_envio ON public.rotas;
CREATE TRIGGER trg_rotas_zz_contar_envio BEFORE UPDATE ON public.rotas
  FOR EACH ROW EXECUTE FUNCTION public.fn_rotas_contar_envio();

CREATE OR REPLACE FUNCTION public.fn_rotas_notificar() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE vend text; periodo text; resumo text; n int := NEW.envios_aprovacao; ator uuid := auth.uid();
BEGIN
  BEGIN
    SELECT split_part(coalesce(nullif(trim(nome),''),'Vendedor'),' ',1) INTO vend FROM profiles WHERE id=NEW.vendedor_id;
    vend := coalesce(vend,'Vendedor');
    periodo := CASE WHEN coalesce(NEW.data_fim,NEW.data_inicio)<>NEW.data_inicio
                    THEN to_char(NEW.data_inicio,'DD')||'–'||to_char(NEW.data_fim,'DD/MM')
                    ELSE to_char(NEW.data_inicio,'DD/MM') END;
    resumo := 'Rota '||coalesce(periodo,'')||' · '||(SELECT count(*) FROM rota_paradas WHERE rota_id=NEW.id)||' paradas';

    IF NEW.status='aguardando_aprovacao' AND OLD.status<>'aguardando_aprovacao' THEN
      INSERT INTO notificacoes (user_id,tipo,titulo,texto,link,chave)
      SELECT ur.user_id,'rota_enviada',
             vend||CASE WHEN n>1 THEN ' reenviou' ELSE ' enviou' END||' uma rota para aprovação', resumo,
             '/rotas/'||NEW.id,'rota-enviada:'||NEW.id||':'||n
        FROM user_roles ur WHERE ur.role='admin' AND ur.user_id IS DISTINCT FROM ator
      ON CONFLICT (user_id,chave) DO NOTHING;

    ELSIF OLD.status='aguardando_aprovacao' AND NEW.status IN ('aprovada','reprovada','rascunho') THEN
      UPDATE notificacoes SET lida_em=now()
       WHERE chave='rota-enviada:'||NEW.id||':'||n AND lida_em IS NULL;
      IF NEW.status='rascunho' THEN
        INSERT INTO notificacoes (user_id,tipo,titulo,texto,link,chave)
        SELECT ur.user_id,'rota_rascunho',vend||' retirou uma rota da aprovação',resumo,
               '/rotas/'||NEW.id,'rota-rascunho:'||NEW.id||':'||n
          FROM user_roles ur WHERE ur.role='admin' AND ur.user_id IS DISTINCT FROM ator
        ON CONFLICT (user_id,chave) DO NOTHING;
      ELSIF NEW.vendedor_id IS DISTINCT FROM ator THEN
        INSERT INTO notificacoes (user_id,tipo,titulo,texto,link,chave)
        VALUES (NEW.vendedor_id,'rota_'||NEW.status,
          CASE NEW.status WHEN 'aprovada' THEN 'Rota aprovada' ELSE 'Rota reprovada' END,
          CASE NEW.status WHEN 'aprovada' THEN resumo
               ELSE 'Motivo: '||left(coalesce(nullif(trim(NEW.motivo_reprovacao),''),'não informado'),120) END,
          '/rotas/'||NEW.id,'rota-'||NEW.status||':'||NEW.id||':'||n)
        ON CONFLICT (user_id,chave) DO NOTHING;
      END IF;
    END IF;

    IF NEW.prestacao_concluida_em IS NOT NULL AND OLD.prestacao_concluida_em IS NULL THEN
      INSERT INTO notificacoes (user_id,tipo,titulo,texto,link,chave)
      SELECT ur.user_id,'rota_prestacao',vend||' concluiu a prestação de contas',resumo,
             '/rotas/'||NEW.id,'rota-prestacao:'||NEW.id
        FROM user_roles ur WHERE ur.role='admin' AND ur.user_id IS DISTINCT FROM ator
      ON CONFLICT (user_id,chave) DO NOTHING;
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_rotas_notificar ON public.rotas;
CREATE TRIGGER trg_rotas_notificar AFTER UPDATE ON public.rotas
  FOR EACH ROW EXECUTE FUNCTION public.fn_rotas_notificar();