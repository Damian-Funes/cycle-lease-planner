-- Atividades reais, resolvíveis e cobradas — MIGRAÇÃO (aplicar só após aprovação)
BEGIN;

ALTER TABLE public.atividades
  ADD COLUMN IF NOT EXISTS situacao text NOT NULL DEFAULT 'aberta',
  ADD COLUMN IF NOT EXISTS motivo_cancelamento text,
  ADD COLUMN IF NOT EXISTS reagendamentos integer NOT NULL DEFAULT 0;
UPDATE public.atividades SET situacao = 'concluida' WHERE concluida AND situacao = 'aberta';

CREATE OR REPLACE FUNCTION public.fn_atividades_situacao_validar() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.situacao NOT IN ('aberta','concluida','cancelada') THEN
    RAISE EXCEPTION 'Situação inválida: %', NEW.situacao;
  END IF;
  -- mantém concluida/situacao coerentes para leitores antigos
  IF NEW.concluida AND NEW.situacao = 'aberta' THEN NEW.situacao := 'concluida'; END IF;
  IF NOT NEW.concluida AND NEW.situacao <> 'aberta' THEN NEW.situacao := 'aberta'; NEW.motivo_cancelamento := NULL; END IF;
  IF NEW.situacao = 'cancelada' THEN NEW.concluida := true; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_atividades_situacao ON public.atividades;
CREATE TRIGGER trg_atividades_situacao BEFORE INSERT OR UPDATE ON public.atividades
  FOR EACH ROW EXECUTE FUNCTION public.fn_atividades_situacao_validar();

CREATE TABLE IF NOT EXISTS public.atividade_reagendamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  atividade_id uuid NOT NULL REFERENCES public.atividades(id) ON DELETE CASCADE,
  data_anterior timestamptz,
  data_nova timestamptz NOT NULL,
  motivo text NOT NULL,
  autor_id uuid,
  origem text NOT NULL DEFAULT 'app',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS atividade_reagendamentos_ativ_idx ON public.atividade_reagendamentos(atividade_id, created_at DESC);
GRANT SELECT ON public.atividade_reagendamentos TO authenticated;
GRANT ALL ON public.atividade_reagendamentos TO service_role;
ALTER TABLE public.atividade_reagendamentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Ver reagendamentos de atividade visível" ON public.atividade_reagendamentos;
CREATE POLICY "Ver reagendamentos de atividade visível" ON public.atividade_reagendamentos
  FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.atividades a WHERE a.id = atividade_id));

-- A data efetiva é coalesce(data_inicio, data_atividade) (a agenda usa data_inicio).
-- Data mudou numa atividade aberta fora das funções: registra mesmo assim (nada some em silêncio).
CREATE OR REPLACE FUNCTION public.fn_atividade_data_guarda() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT OLD.concluida AND NOT NEW.concluida
     AND coalesce(NEW.data_inicio, NEW.data_atividade) IS DISTINCT FROM coalesce(OLD.data_inicio, OLD.data_atividade)
     AND coalesce(current_setting('app.reagendando', true), '') <> 'on' THEN
    INSERT INTO atividade_reagendamentos(atividade_id, data_anterior, data_nova, motivo, autor_id, origem)
    VALUES (NEW.id, coalesce(OLD.data_inicio, OLD.data_atividade), coalesce(NEW.data_inicio, NEW.data_atividade), 'Alterado na edição (sem motivo)', auth.uid(), 'edicao');
    NEW.reagendamentos := OLD.reagendamentos + 1;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_atividade_data_guarda ON public.atividades;
CREATE TRIGGER trg_atividade_data_guarda BEFORE UPDATE OF data_inicio, data_atividade ON public.atividades
  FOR EACH ROW EXECUTE FUNCTION public.fn_atividade_data_guarda();

-- Quem pode agir: responsável, admin ou gerente; service_role (Júlia) informa o autor.
CREATE OR REPLACE FUNCTION public.fn_atividade_autorizar(_id uuid, _autor uuid)
RETURNS public.atividades LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a atividades; quem uuid := coalesce(auth.uid(), _autor);
BEGIN
  SELECT * INTO a FROM atividades WHERE id = _id FOR UPDATE;
  IF a.id IS NULL THEN RAISE EXCEPTION 'Atividade não encontrada.'; END IF;
  IF a.concluida THEN RAISE EXCEPTION 'Atividade já resolvida.'; END IF;
  IF auth.uid() IS NULL AND coalesce(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'Sem permissão.'; END IF;
  IF quem IS NULL OR NOT (a.responsavel_id = quem OR has_any_role(quem, ARRAY['admin','gerente_comercial']::app_role[])) THEN
    RAISE EXCEPTION 'Sem permissão para esta atividade.';
  END IF;
  RETURN a;
END $$;

CREATE OR REPLACE FUNCTION public.fn_atividade_concluir(p_id uuid, p_resultado text, p_autor uuid DEFAULT NULL, p_origem text DEFAULT 'app')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF length(trim(coalesce(p_resultado,''))) < 3 THEN RAISE EXCEPTION 'Informe o resultado.'; END IF;
  PERFORM fn_atividade_autorizar(p_id, p_autor);
  UPDATE atividades SET concluida = true, situacao = 'concluida', data_conclusao = now(),
    resultado = trim(p_resultado) || CASE WHEN p_origem = 'julia' THEN ' (via Júlia)' ELSE '' END
  WHERE id = p_id;
END $$;

CREATE OR REPLACE FUNCTION public.fn_atividade_cancelar(p_id uuid, p_motivo text, p_autor uuid DEFAULT NULL, p_origem text DEFAULT 'app')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF length(trim(coalesce(p_motivo,''))) < 3 THEN RAISE EXCEPTION 'Informe o motivo.'; END IF;
  PERFORM fn_atividade_autorizar(p_id, p_autor);
  UPDATE atividades SET concluida = true, situacao = 'cancelada', data_conclusao = now(),
    motivo_cancelamento = trim(p_motivo) || CASE WHEN p_origem = 'julia' THEN ' (via Júlia)' ELSE '' END
  WHERE id = p_id;
END $$;

CREATE OR REPLACE FUNCTION public.fn_atividade_reagendar(p_id uuid, p_data timestamptz, p_motivo text, p_autor uuid DEFAULT NULL, p_origem text DEFAULT 'app')
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a atividades; n integer;
BEGIN
  IF length(trim(coalesce(p_motivo,''))) < 3 THEN RAISE EXCEPTION 'Informe o motivo.'; END IF;
  IF p_data IS NULL OR (p_data AT TIME ZONE 'America/Sao_Paulo')::date < fn_rota_hoje_brt() THEN
    RAISE EXCEPTION 'A nova data não pode estar no passado.';
  END IF;
  IF p_origem NOT IN ('app','julia') THEN RAISE EXCEPTION 'Origem inválida.'; END IF;
  a := fn_atividade_autorizar(p_id, p_autor);
  INSERT INTO atividade_reagendamentos(atividade_id, data_anterior, data_nova, motivo, autor_id, origem)
  VALUES (p_id, coalesce(a.data_inicio, a.data_atividade), p_data, trim(p_motivo), coalesce(auth.uid(), p_autor), p_origem);
  PERFORM set_config('app.reagendando', 'on', true);
  UPDATE atividades SET data_atividade = p_data, data_inicio = p_data, reagendamentos = reagendamentos + 1
  WHERE id = p_id RETURNING reagendamentos INTO n;
  PERFORM set_config('app.reagendando', 'off', true);
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION public.fn_atividade_autorizar(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_atividade_concluir(uuid, text, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_atividade_cancelar(uuid, text, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_atividade_reagendar(uuid, timestamptz, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_atividade_concluir(uuid, text, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_atividade_cancelar(uuid, text, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_atividade_reagendar(uuid, timestamptz, text, uuid, text) TO authenticated, service_role;
-- p_autor só vale para service_role (auth.uid() tem prioridade).

CREATE OR REPLACE FUNCTION public.fn_dias_uteis_entre(_de date, _ate date) RETURNS integer
LANGUAGE sql IMMUTABLE AS $$
  SELECT count(*)::int FROM generate_series(_de + 1, _ate, interval '1 day') d
  WHERE extract(isodow FROM d) < 6;
$$;

-- Cobrança: sininho do responsável no dia do vencimento; admins após 3 dias úteis e com 3+ reagendamentos.
CREATE OR REPLACE FUNCTION public.fn_sincronizar_cobranca_atividades() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE hoje date := fn_rota_hoje_brt(); n_ins int := 0; n_res int := 0; c int;
BEGIN
  WITH v AS (
    SELECT a.id, a.responsavel_id, a.titulo, a.reagendamentos,
           (coalesce(a.data_inicio, a.data_atividade) AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
           coalesce(p.nome, 'Vendedor') AS vendedor,
           coalesce(o.nome_fantasia, o.nome) AS org
    FROM atividades a
    LEFT JOIN profiles p ON p.user_id = a.responsavel_id
    LEFT JOIN organizacoes o ON o.id = a.organizacao_id
    WHERE NOT a.concluida AND a.responsavel_id IS NOT NULL AND coalesce(a.data_inicio, a.data_atividade) IS NOT NULL
      AND (coalesce(a.data_inicio, a.data_atividade) AT TIME ZONE 'America/Sao_Paulo')::date <= hoje
  ), alvo AS (
    SELECT v.responsavel_id AS user_id, 'atividade:'||v.id||':vencida' AS chave, 'atividade_vencida' AS tipo,
           'Atividade vencida: '||v.titulo AS titulo,
           coalesce(v.org||' — ', '')||'Marque como feita, reagende ou cancele.' AS texto
    FROM v
    UNION ALL
    SELECT ur.user_id, 'atividade:'||v.id||':escalada', 'atividade_escalada',
           v.vendedor||': atividade vencida há '||fn_dias_uteis_entre(v.dia, hoje)||' dias úteis',
           v.titulo||coalesce(' — '||v.org, '')
    FROM v JOIN user_roles ur ON ur.role = 'admin'
    WHERE fn_dias_uteis_entre(v.dia, hoje) > 3
    UNION ALL
    SELECT ur.user_id, 'atividade:'||a.id||':empurrando', 'atividade_empurrando',
           coalesce(p.nome,'Vendedor')||' está empurrando: reagendada '||a.reagendamentos||' vezes',
           a.titulo
    FROM atividades a JOIN user_roles ur ON ur.role = 'admin' LEFT JOIN profiles p ON p.user_id = a.responsavel_id
    WHERE NOT a.concluida AND a.reagendamentos >= 3
  ), ins AS (
    INSERT INTO notificacoes(user_id, chave, tipo, titulo, texto, link)
    SELECT user_id, chave, tipo, titulo, texto, '/atividades?atrasadas=1' FROM alvo
    ON CONFLICT (user_id, chave) DO UPDATE SET resolvida_em = NULL, titulo = EXCLUDED.titulo, texto = EXCLUDED.texto
      WHERE notificacoes.resolvida_em IS NOT NULL OR notificacoes.titulo <> EXCLUDED.titulo
    RETURNING 1
  ) SELECT count(*) INTO n_ins FROM ins;

  -- resolve as de atividades que deixaram de estar em atraso
  UPDATE notificacoes n SET resolvida_em = now()
  WHERE n.resolvida_em IS NULL AND n.chave LIKE 'atividade:%'
    AND NOT EXISTS (
      SELECT 1 FROM atividades a
      WHERE a.id = fn_uuid_seguro(split_part(n.chave, ':', 2)) AND NOT a.concluida
        AND CASE split_part(n.chave, ':', 3)
              WHEN 'empurrando' THEN a.reagendamentos >= 3
              WHEN 'escalada' THEN fn_dias_uteis_entre((coalesce(a.data_inicio, a.data_atividade) AT TIME ZONE 'America/Sao_Paulo')::date, hoje) > 3
              ELSE (coalesce(a.data_inicio, a.data_atividade) AT TIME ZONE 'America/Sao_Paulo')::date <= hoje END);
  GET DIAGNOSTICS c = ROW_COUNT; n_res := c;
  RETURN jsonb_build_object('inseridas', n_ins, 'resolvidas', n_res);
END $$;
REVOKE ALL ON FUNCTION public.fn_sincronizar_cobranca_atividades() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_sincronizar_cobranca_atividades() TO service_role;

-- Resolve na hora quando a atividade é concluída/cancelada/reagendada.
CREATE OR REPLACE FUNCTION public.fn_atividade_resolver_notificacoes() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.concluida THEN
    UPDATE notificacoes SET resolvida_em = now()
    WHERE resolvida_em IS NULL AND chave LIKE 'atividade:'||NEW.id||':%';
  ELSIF coalesce(NEW.data_inicio, NEW.data_atividade) IS DISTINCT FROM coalesce(OLD.data_inicio, OLD.data_atividade)
        AND (coalesce(NEW.data_inicio, NEW.data_atividade) AT TIME ZONE 'America/Sao_Paulo')::date > fn_rota_hoje_brt() THEN
    UPDATE notificacoes SET resolvida_em = now()
    WHERE resolvida_em IS NULL AND chave IN ('atividade:'||NEW.id||':vencida', 'atividade:'||NEW.id||':escalada');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_atividade_resolver_notificacoes ON public.atividades;
CREATE TRIGGER trg_atividade_resolver_notificacoes AFTER UPDATE ON public.atividades
  FOR EACH ROW EXECUTE FUNCTION public.fn_atividade_resolver_notificacoes();

-- Placar semanal (segunda a domingo, BRT) por responsável. Só leitura; respeita RLS de atividades.
CREATE OR REPLACE VIEW public.atividades_placar_semanal WITH (security_invoker = true) AS
WITH semana AS (
  SELECT date_trunc('week', (now() AT TIME ZONE 'America/Sao_Paulo'))::date AS ini
)
SELECT a.responsavel_id,
  count(*) FILTER (WHERE (coalesce(a.data_inicio, a.data_atividade) AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN s.ini AND s.ini + 6
                     AND (coalesce(a.data_inicio, a.data_atividade) AT TIME ZONE 'America/Sao_Paulo')::date <= fn_rota_hoje_brt()) AS vencendo_semana,
  count(*) FILTER (WHERE (coalesce(a.data_inicio, a.data_atividade) AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN s.ini AND s.ini + 6
                     AND a.situacao = 'concluida'
                     AND (a.data_conclusao AT TIME ZONE 'America/Sao_Paulo')::date <= (coalesce(a.data_inicio, a.data_atividade) AT TIME ZONE 'America/Sao_Paulo')::date) AS no_prazo_semana,
  count(*) FILTER (WHERE NOT a.concluida AND coalesce(a.data_inicio, a.data_atividade) < now()) AS vencidas_abertas,
  min(coalesce(a.data_inicio, a.data_atividade)) FILTER (WHERE NOT a.concluida AND coalesce(a.data_inicio, a.data_atividade) < now()) AS mais_antiga,
  count(*) FILTER (WHERE NOT a.concluida AND a.reagendamentos >= 3) AS empurrando,
  (SELECT count(*) FROM atividade_reagendamentos r JOIN atividades x ON x.id = r.atividade_id
    WHERE x.responsavel_id = a.responsavel_id AND (r.created_at AT TIME ZONE 'America/Sao_Paulo')::date >= s.ini) AS reagendamentos_semana
FROM atividades a CROSS JOIN semana s
WHERE a.responsavel_id IS NOT NULL
GROUP BY a.responsavel_id, s.ini;
GRANT SELECT ON public.atividades_placar_semanal TO authenticated;

COMMIT;
