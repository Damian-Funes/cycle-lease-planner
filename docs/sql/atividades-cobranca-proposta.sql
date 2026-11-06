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
  tipo text NOT NULL DEFAULT 'reagendado', -- reagendado (cliente) | nao_concluido (vendedor não fez) | edicao
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
    INSERT INTO atividade_reagendamentos(atividade_id, data_anterior, data_nova, motivo, autor_id, origem, tipo)
    VALUES (NEW.id, coalesce(OLD.data_inicio, OLD.data_atividade), coalesce(NEW.data_inicio, NEW.data_atividade), 'Alterado na edição (sem motivo)', auth.uid(), 'edicao', 'edicao');
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
  IF length(trim(coalesce(p_resultado,''))) < 10 THEN RAISE EXCEPTION 'Descreva o resultado (mínimo 10 caracteres).'; END IF;
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

CREATE OR REPLACE FUNCTION public.fn_atividade_mudar_data(p_id uuid, p_data timestamptz, p_motivo text, p_autor uuid, p_origem text, p_tipo text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a atividades; n integer;
BEGIN
  IF length(trim(coalesce(p_motivo,''))) < 3 THEN RAISE EXCEPTION 'Informe o motivo.'; END IF;
  IF p_data IS NULL OR (p_data AT TIME ZONE 'America/Sao_Paulo')::date < fn_rota_hoje_brt() THEN
    RAISE EXCEPTION 'A nova data não pode estar no passado.';
  END IF;
  IF p_origem NOT IN ('app','julia') THEN RAISE EXCEPTION 'Origem inválida.'; END IF;
  IF p_tipo NOT IN ('reagendado','nao_concluido') THEN RAISE EXCEPTION 'Tipo inválido.'; END IF;
  a := fn_atividade_autorizar(p_id, p_autor);
  INSERT INTO atividade_reagendamentos(atividade_id, data_anterior, data_nova, motivo, autor_id, origem, tipo)
  VALUES (p_id, coalesce(a.data_inicio, a.data_atividade), p_data, trim(p_motivo), coalesce(auth.uid(), p_autor), p_origem, p_tipo);
  PERFORM set_config('app.reagendando', 'on', true);
  UPDATE atividades SET data_atividade = p_data, data_inicio = p_data, reagendamentos = reagendamentos + 1
  WHERE id = p_id RETURNING reagendamentos INTO n;
  PERFORM set_config('app.reagendando', 'off', true);
  RETURN n;
END $$;

-- Reagendar: a mudança vem do cliente.
CREATE OR REPLACE FUNCTION public.fn_atividade_reagendar(p_id uuid, p_data timestamptz, p_motivo text, p_autor uuid DEFAULT NULL, p_origem text DEFAULT 'app')
RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT fn_atividade_mudar_data(p_id, p_data, p_motivo, p_autor, p_origem, 'reagendado');
$$;
-- Não fiz: o vendedor não fez (tempo/esquecimento). Também exige nova data e conta como reagendamento.
CREATE OR REPLACE FUNCTION public.fn_atividade_nao_fiz(p_id uuid, p_data timestamptz, p_motivo text, p_autor uuid DEFAULT NULL, p_origem text DEFAULT 'app')
RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT fn_atividade_mudar_data(p_id, p_data, p_motivo, p_autor, p_origem, 'nao_concluido');
$$;

REVOKE ALL ON FUNCTION public.fn_atividade_autorizar(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_atividade_mudar_data(uuid, timestamptz, text, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_atividade_nao_fiz(uuid, timestamptz, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_atividade_nao_fiz(uuid, timestamptz, text, uuid, text) TO authenticated, service_role;
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

-- ===== Trava do Novo orçamento =====
-- Flag: nasce DESLIGADA. Ligar só depois do publish do frontend novo:
--   UPDATE public.app_flags SET ativo = true WHERE chave = 'trava_orcamento_ativa';
CREATE TABLE IF NOT EXISTS public.app_flags (
  chave text PRIMARY KEY,
  ativo boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT, UPDATE ON public.app_flags TO authenticated;
GRANT ALL ON public.app_flags TO service_role;
ALTER TABLE public.app_flags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Ler flags" ON public.app_flags;
CREATE POLICY "Ler flags" ON public.app_flags FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admin altera flags" ON public.app_flags;
CREATE POLICY "Admin altera flags" ON public.app_flags FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
INSERT INTO public.app_flags(chave, ativo) VALUES ('trava_orcamento_ativa', false) ON CONFLICT (chave) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.orcamento_liberacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  dia date NOT NULL,
  liberado_por uuid NOT NULL,
  motivo text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, dia)
);
GRANT SELECT ON public.orcamento_liberacoes TO authenticated;
GRANT ALL ON public.orcamento_liberacoes TO service_role;
ALTER TABLE public.orcamento_liberacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Ver própria liberação ou admin" ON public.orcamento_liberacoes;
CREATE POLICY "Ver própria liberação ou admin" ON public.orcamento_liberacoes
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'));
-- sem insert direto: só por fn_liberar_orcamento

-- Atividades do usuário vencidas há MAIS de 1 dia útil.
CREATE OR REPLACE FUNCTION public.fn_atividades_travando_orcamento(_user uuid)
RETURNS TABLE(id uuid, titulo text, data_inicio timestamptz, organizacao text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id, a.titulo, coalesce(a.data_inicio, a.data_atividade), coalesce(o.nome_fantasia, o.nome)
  FROM atividades a LEFT JOIN organizacoes o ON o.id = a.organizacao_id
  WHERE a.responsavel_id = _user AND NOT a.concluida
    AND coalesce(a.data_inicio, a.data_atividade) IS NOT NULL
    AND fn_dias_uteis_entre((coalesce(a.data_inicio, a.data_atividade) AT TIME ZONE 'America/Sao_Paulo')::date, fn_rota_hoje_brt()) > 1
  ORDER BY 3;
$$;

CREATE OR REPLACE FUNCTION public.fn_orcamento_travado(_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user IS NOT NULL
     AND coalesce((SELECT ativo FROM app_flags WHERE chave = 'trava_orcamento_ativa'), false)
     AND NOT has_role(_user, 'admin')
     AND NOT EXISTS (SELECT 1 FROM orcamento_liberacoes WHERE user_id = _user AND dia = fn_rota_hoje_brt())
     AND EXISTS (SELECT 1 FROM fn_atividades_travando_orcamento(_user));
$$;

-- Para a tela: só do próprio usuário (admin pode consultar outro).
CREATE OR REPLACE FUNCTION public.fn_minha_trava_orcamento(_user uuid DEFAULT NULL)
RETURNS TABLE(travado boolean, id uuid, titulo text, data_inicio timestamptz, organizacao text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE u uuid := coalesce(_user, auth.uid());
BEGIN
  IF u <> auth.uid() AND NOT has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Sem permissão.'; END IF;
  IF NOT fn_orcamento_travado(u) THEN RETURN QUERY SELECT false, NULL::uuid, NULL::text, NULL::timestamptz, NULL::text; RETURN; END IF;
  RETURN QUERY SELECT true, t.id, t.titulo, t.data_inicio, t.organizacao FROM fn_atividades_travando_orcamento(u) t;
END $$;

CREATE OR REPLACE FUNCTION public.fn_liberar_orcamento(p_user uuid, p_motivo text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Só admin pode liberar.'; END IF;
  IF length(trim(coalesce(p_motivo,''))) < 3 THEN RAISE EXCEPTION 'Informe o motivo.'; END IF;
  INSERT INTO orcamento_liberacoes(user_id, dia, liberado_por, motivo)
  VALUES (p_user, fn_rota_hoje_brt(), auth.uid(), trim(p_motivo))
  ON CONFLICT (user_id, dia) DO UPDATE SET liberado_por = EXCLUDED.liberado_por, motivo = EXCLUDED.motivo, created_at = now();
END $$;

-- Autoridade no banco: nenhum orçamento NOVO é gravado por vendedor travado (qualquer ponto de entrada).
-- Revisão (número "<base>-Vn" de um orçamento existente) fica fora da trava.
CREATE OR REPLACE FUNCTION public.fn_orcamentos_trava_atividades() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE base text;
BEGIN
  IF NEW.numero_orcamento ~* '-V[0-9]+$' THEN
    base := regexp_replace(NEW.numero_orcamento, '-V[0-9]+$', '', 'i');
    IF EXISTS (SELECT 1 FROM orcamentos WHERE numero_orcamento = base) THEN RETURN NEW; END IF;
  END IF;
  IF auth.uid() IS NOT NULL AND fn_orcamento_travado(auth.uid()) THEN
    RAISE EXCEPTION 'Antes de criar o orçamento, resolva suas atividades vencidas (ou peça liberação ao admin).'
      USING ERRCODE = 'P0001', HINT = 'atividades_vencidas';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_orcamentos_trava_atividades ON public.orcamentos;
CREATE TRIGGER trg_orcamentos_trava_atividades BEFORE INSERT ON public.orcamentos
  FOR EACH ROW EXECUTE FUNCTION public.fn_orcamentos_trava_atividades();

REVOKE ALL ON FUNCTION public.fn_atividades_travando_orcamento(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_orcamento_travado(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_minha_trava_orcamento(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_liberar_orcamento(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_minha_trava_orcamento(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_liberar_orcamento(uuid, text) TO authenticated;

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
    WHERE x.responsavel_id = a.responsavel_id AND r.tipo <> 'nao_concluido' AND (r.created_at AT TIME ZONE 'America/Sao_Paulo')::date >= s.ini) AS reagendamentos_semana,
  (SELECT count(*) FROM atividade_reagendamentos r JOIN atividades x ON x.id = r.atividade_id
    WHERE x.responsavel_id = a.responsavel_id AND r.tipo = 'nao_concluido' AND (r.created_at AT TIME ZONE 'America/Sao_Paulo')::date >= s.ini) AS nao_fiz_semana,
  (SELECT count(*) FROM orcamento_liberacoes l
    WHERE l.user_id = a.responsavel_id AND l.dia >= s.ini) AS liberacoes_semana
FROM atividades a CROSS JOIN semana s
WHERE a.responsavel_id IS NOT NULL
GROUP BY a.responsavel_id, s.ini;
GRANT SELECT ON public.atividades_placar_semanal TO authenticated;

COMMIT;
