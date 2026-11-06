-- Júlia completa organizações incompletas (1 por ligação) — MIGRAÇÃO (aplicar só após aprovação)
-- Regra única de "completa": >=1 pessoa com telefone/celular + cidade + UF + responsável. E-mail não conta.
-- Telefone da empresa sem pessoa NÃO conta. Descarte em campos próprios (status intocado).

-- 1) Campos novos
ALTER TABLE public.organizacoes
  ADD COLUMN IF NOT EXISTS descartada_em timestamptz,
  ADD COLUMN IF NOT EXISTS descartada_por uuid,
  ADD COLUMN IF NOT EXISTS descarte_motivo text,
  ADD COLUMN IF NOT EXISTS descarte_obs text,
  ADD COLUMN IF NOT EXISTS completada_em timestamptz;

ALTER TABLE public.organizacao_levantamentos
  ADD COLUMN IF NOT EXISTS contato_telefone text,
  ADD COLUMN IF NOT EXISTS acao text;
ALTER TABLE public.organizacao_levantamentos DROP CONSTRAINT IF EXISTS organizacao_levantamentos_origem_check;
ALTER TABLE public.organizacao_levantamentos ADD CONSTRAINT organizacao_levantamentos_origem_check
  CHECK (origem = ANY (ARRAY['visita_rota','manual','whatsapp','julia','faxina']));
ALTER TABLE public.organizacao_levantamentos DROP CONSTRAINT IF EXISTS organizacao_levantamentos_acao_check;
ALTER TABLE public.organizacao_levantamentos ADD CONSTRAINT organizacao_levantamentos_acao_check
  CHECK (acao IS NULL OR acao = ANY (ARRAY['completou','descobrir','sugerir_visita','descartou','reabriu']));

-- Faxina semanal (preparada, desligada): ligação sem viagem.
ALTER TABLE public.ligacoes_viagem DROP CONSTRAINT IF EXISTS ligacoes_viagem_origem_check;
ALTER TABLE public.ligacoes_viagem ADD CONSTRAINT ligacoes_viagem_origem_check
  CHECK (origem = ANY (ARRAY['inicial','retentativa','retorno','teste','faxina']));
ALTER TABLE public.ligacoes_viagem ALTER COLUMN rota_id DROP NOT NULL;
ALTER TABLE public.ligacoes_viagem DROP CONSTRAINT IF EXISTS ligacoes_viagem_rota_obrigatoria;
ALTER TABLE public.ligacoes_viagem ADD CONSTRAINT ligacoes_viagem_rota_obrigatoria
  CHECK (rota_id IS NOT NULL OR origem = 'faxina');

CREATE TABLE IF NOT EXISTS public.faxina_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  ativo boolean NOT NULL DEFAULT false,
  dia_semana integer NOT NULL DEFAULT 5 CHECK (dia_semana BETWEEN 1 AND 7), -- 1=seg … 7=dom
  hora time NOT NULL DEFAULT '17:00',
  orgs_por_ligacao integer NOT NULL DEFAULT 1 CHECK (orgs_por_ligacao BETWEEN 1 AND 5),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT, UPDATE ON public.faxina_config TO authenticated;
GRANT ALL ON public.faxina_config TO service_role;
ALTER TABLE public.faxina_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Ler faxina" ON public.faxina_config;
CREATE POLICY "Ler faxina" ON public.faxina_config FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admin altera faxina" ON public.faxina_config;
CREATE POLICY "Admin altera faxina" ON public.faxina_config FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
INSERT INTO public.faxina_config(id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- 2) Regra única
CREATE OR REPLACE FUNCTION public.fn_tel_valido(_t text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT length(regexp_replace(coalesce(_t,''), '\D', '', 'g')) >= 10;
$$;

CREATE OR REPLACE FUNCTION public.fn_organizacao_faltas(_org uuid) RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT array_remove(ARRAY[
    CASE WHEN NOT EXISTS (SELECT 1 FROM pessoas p WHERE p.organizacao_id = o.id
              AND (fn_tel_valido(p.telefone) OR fn_tel_valido(p.celular))) THEN 'contato' END,
    CASE WHEN nullif(btrim(o.cidade),'') IS NULL THEN 'cidade' END,
    CASE WHEN o.estado_id IS NULL AND nullif(btrim(o.estado),'') IS NULL THEN 'uf' END,
    CASE WHEN o.responsavel_id IS NULL THEN 'responsavel' END
  ], NULL)
  FROM organizacoes o WHERE o.id = _org;
$$;
REVOKE ALL ON FUNCTION public.fn_organizacao_faltas(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_organizacao_faltas(uuid) TO service_role;

-- Visão lida por badge, lista e Júlia. security_invoker: cada um vê só o que pode ver.
CREATE OR REPLACE VIEW public.organizacao_completude WITH (security_invoker = true) AS
SELECT o.id, o.responsavel_id,
  NOT EXISTS (SELECT 1 FROM pessoas p WHERE p.organizacao_id = o.id
              AND (fn_tel_valido(p.telefone) OR fn_tel_valido(p.celular))) AS falta_contato,
  nullif(btrim(o.cidade),'') IS NULL AS falta_cidade,
  (o.estado_id IS NULL AND nullif(btrim(o.estado),'') IS NULL) AS falta_uf,
  o.responsavel_id IS NULL AS falta_responsavel
FROM organizacoes o
WHERE o.descartada_em IS NULL;
GRANT SELECT ON public.organizacao_completude TO authenticated;

-- completada_em: quando a organização passou a completa (placar). Atual completas = created_at (não contam na semana).
UPDATE public.organizacoes o SET completada_em = o.created_at
 WHERE completada_em IS NULL AND cardinality(fn_organizacao_faltas(o.id)) = 0;

CREATE OR REPLACE FUNCTION public.fn_atualizar_completude(_org uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE completa boolean;
BEGIN
  IF _org IS NULL THEN RETURN; END IF;
  completa := cardinality(coalesce(fn_organizacao_faltas(_org), ARRAY['x'])) = 0;
  UPDATE organizacoes SET completada_em = CASE WHEN completa THEN coalesce(completada_em, now()) ELSE NULL END
   WHERE id = _org AND (completada_em IS NULL) = completa;
END $$;

CREATE OR REPLACE FUNCTION public.fn_completude_pessoas_trg() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN PERFORM fn_atualizar_completude(OLD.organizacao_id); END IF;
  IF TG_OP <> 'DELETE' THEN PERFORM fn_atualizar_completude(NEW.organizacao_id); END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_completude_pessoas ON public.pessoas;
CREATE TRIGGER trg_completude_pessoas AFTER INSERT OR DELETE OR UPDATE OF organizacao_id, telefone, celular ON public.pessoas
  FOR EACH ROW EXECUTE FUNCTION public.fn_completude_pessoas_trg();

CREATE OR REPLACE FUNCTION public.fn_completude_org_trg() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM fn_atualizar_completude(NEW.id);
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_completude_org ON public.organizacoes;
CREATE TRIGGER trg_completude_org AFTER INSERT OR UPDATE OF cidade, estado, estado_id, responsavel_id ON public.organizacoes
  FOR EACH ROW EXECUTE FUNCTION public.fn_completude_org_trg();

-- 3) Descartar / reabrir
CREATE OR REPLACE FUNCTION public.fn_organizacao_descartar(p_org uuid, p_motivo text, p_obs text DEFAULT NULL, p_autor uuid DEFAULT NULL, p_origem text DEFAULT 'manual')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o organizacoes; quem uuid := coalesce(auth.uid(), p_autor); n int;
  rotulo text := CASE p_motivo WHEN 'fechou' THEN 'Fechou' WHEN 'nao_trata_semente' THEN 'Não trata semente'
                  WHEN 'duplicada' THEN 'Duplicada' WHEN 'outro' THEN 'Outro' END;
BEGIN
  IF rotulo IS NULL THEN RAISE EXCEPTION 'Motivo inválido: use fechou, nao_trata_semente, duplicada ou outro.'; END IF;
  IF p_motivo = 'outro' AND length(btrim(coalesce(p_obs,''))) < 3 THEN RAISE EXCEPTION 'Explique o motivo.'; END IF;
  IF p_origem NOT IN ('manual','julia','faxina') THEN RAISE EXCEPTION 'Origem inválida.'; END IF;
  IF auth.uid() IS NULL AND coalesce(auth.role(),'') <> 'service_role' THEN RAISE EXCEPTION 'Sem permissão.'; END IF;
  SELECT * INTO o FROM organizacoes WHERE id = p_org FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION 'Organização não encontrada.'; END IF;
  IF quem IS NULL OR NOT (o.responsavel_id = quem OR has_any_role(quem, ARRAY['admin','gerente_comercial']::app_role[])) THEN
    RAISE EXCEPTION 'Sem permissão para descartar esta organização.'; END IF;
  IF o.descartada_em IS NOT NULL THEN
    RETURN jsonb_build_object('ja_descartada', true, 'motivo', o.descarte_motivo);
  END IF;
  UPDATE organizacoes SET descartada_em = now(), descartada_por = quem, descarte_motivo = p_motivo,
    descarte_obs = nullif(btrim(coalesce(p_obs,'')),'') WHERE id = p_org;
  INSERT INTO organizacao_levantamentos(organizacao_id, origem, autor_id, data_visita, acao, resultado)
  VALUES (p_org, p_origem, quem, fn_rota_hoje_brt(), 'descartou',
          'Descartada: '||rotulo||coalesce(' — '||nullif(btrim(coalesce(p_obs,'')),''),''));
  -- some das cobranças: atividades abertas viram canceladas com motivo
  UPDATE atividades SET concluida = true, situacao = 'cancelada', data_conclusao = now(),
    motivo_cancelamento = 'Organização descartada: '||rotulo
  WHERE organizacao_id = p_org AND NOT concluida;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN jsonb_build_object('ja_descartada', false, 'motivo', p_motivo, 'atividades_canceladas', n);
END $$;

CREATE OR REPLACE FUNCTION public.fn_organizacao_reabrir(p_org uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Só admin pode reabrir.'; END IF;
  UPDATE organizacoes SET descartada_em = NULL, descartada_por = NULL, descarte_motivo = NULL, descarte_obs = NULL
   WHERE id = p_org AND descartada_em IS NOT NULL;
  IF FOUND THEN
    INSERT INTO organizacao_levantamentos(organizacao_id, origem, autor_id, data_visita, acao, resultado)
    VALUES (p_org, 'manual', auth.uid(), fn_rota_hoje_brt(), 'reabriu', 'Organização reaberta pelo admin');
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.fn_organizacao_descartar(uuid, text, text, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_organizacao_reabrir(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_organizacao_descartar(uuid, text, text, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_organizacao_reabrir(uuid) TO authenticated;

-- 4) Priorização (1 por ligação por padrão)
CREATE OR REPLACE FUNCTION public.fn_distancia_km(lat1 numeric, lng1 numeric, lat2 numeric, lng2 numeric) RETURNS numeric
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN lat1 IS NULL OR lng1 IS NULL OR lat2 IS NULL OR lng2 IS NULL THEN NULL ELSE
    (6371 * 2 * asin(sqrt(power(sin(radians((lat2-lat1)/2)),2)
      + cos(radians(lat1))*cos(radians(lat2))*power(sin(radians((lng2-lng1)/2)),2))))::numeric END;
$$;

CREATE OR REPLACE FUNCTION public.fn_organizacoes_incompletas_priorizadas(p_vendedor uuid, p_rota uuid DEFAULT NULL, p_limite integer DEFAULT 1)
RETURNS TABLE(organizacao_id uuid, nome text, cidade text, uf text, falta text[], prioridade integer, motivo text, distancia_km numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH refs AS (
    SELECT 'parada'::text AS tipo, coalesce(org.nome_fantasia, org.nome, p.cidade) AS rotulo, p.cidade, p.estado AS uf,
           p.latitude AS lat, p.longitude AS lng
    FROM rota_paradas p LEFT JOIN organizacoes org ON org.id = p.organizacao_id
    WHERE p_rota IS NOT NULL AND p.rota_id = p_rota AND p.visitada IS NULL AND coalesce(p.tipo,'') <> 'pernoite'
    UNION ALL
    SELECT 'pernoite', 'pernoite de hoje', n.cidade, n.estado, n.latitude, n.longitude
    FROM rota_pernoites n WHERE p_rota IS NOT NULL AND n.rota_id = p_rota AND n.noite = fn_rota_hoje_brt()
  ), cand AS (
    SELECT o.id, coalesce(o.nome_fantasia, o.nome) AS nome, o.cidade, coalesce(e.sigla, upper(o.estado))::text AS uf,
           o.latitude, o.longitude, o.created_at, fn_organizacao_faltas(o.id) AS falta
    FROM organizacoes o LEFT JOIN estados e ON e.id = o.estado_id
    WHERE o.responsavel_id = p_vendedor AND o.descartada_em IS NULL
      -- não repetir a mesma organização em menos de 7 dias
      AND NOT EXISTS (SELECT 1 FROM organizacao_levantamentos l WHERE l.organizacao_id = o.id
                      AND l.origem IN ('julia','faxina') AND l.created_at > now() - interval '7 days')
  ), aval AS (
    SELECT c.*,
      (SELECT r.rotulo FROM refs r WHERE r.tipo = 'parada' AND nullif(btrim(c.cidade),'') IS NOT NULL
         AND lower(unaccent_simple(btrim(r.cidade))) = lower(unaccent_simple(btrim(c.cidade)))
         AND upper(coalesce(r.uf,'')) = coalesce(c.uf,'') LIMIT 1) AS mesma_cidade,
      pt.km AS perto_km, pt.tipo AS perto_tipo, pt.rotulo AS perto_rotulo,
      EXISTS (SELECT 1 FROM oportunidades op WHERE op.organizacao_id = c.id AND op.status = 'aberta')
        OR EXISTS (SELECT 1 FROM orcamentos oc WHERE oc.organizacao_id = c.id) AS tem_negocio
    FROM cand c
    LEFT JOIN LATERAL (
      SELECT r2.rotulo, r2.tipo, fn_distancia_km(c.latitude, c.longitude, r2.lat, r2.lng) AS km FROM refs r2
      WHERE fn_distancia_km(c.latitude, c.longitude, r2.lat, r2.lng) <= 60
      ORDER BY 3 LIMIT 1) pt ON true
    WHERE cardinality(c.falta) > 0
  )
  SELECT a.id, a.nome, a.cidade, a.uf, a.falta,
    CASE WHEN a.mesma_cidade IS NOT NULL THEN 1 WHEN a.perto_km IS NOT NULL THEN 2 WHEN a.tem_negocio THEN 3 ELSE 4 END,
    CASE WHEN a.mesma_cidade IS NOT NULL THEN 'mesma cidade da parada '||a.mesma_cidade
         WHEN a.perto_km IS NOT NULL THEN 'a '||round(a.perto_km)||' km '||CASE WHEN a.perto_tipo = 'pernoite' THEN 'do pernoite de hoje' ELSE 'da parada '||a.perto_rotulo END
         WHEN a.tem_negocio THEN 'tem negócio ou orçamento'
         ELSE 'incompleta há mais tempo' END,
    round(a.perto_km, 1)
  FROM aval a
  ORDER BY 6, a.perto_km NULLS LAST, a.created_at
  LIMIT greatest(1, least(coalesce(p_limite, 1), 5));
$$;
REVOKE ALL ON FUNCTION public.fn_organizacoes_incompletas_priorizadas(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_organizacoes_incompletas_priorizadas(uuid, uuid, integer) TO service_role;

-- 5) Júlia: completar (uma transação, idempotente, nunca sobrescreve telefone/cidade)
CREATE OR REPLACE FUNCTION public.julia_completar_organizacao(p_ligacao uuid, p_org uuid, p_dados jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l ligacoes_viagem; o organizacoes; pe pessoas; v_tel text; v_dig text; v_nome text; v_cargo text;
  v_cidade text; v_uf text; v_estado uuid; acoes text[] := '{}'; avisos text[] := '{}'; v_acao text;
  v_data date; v_ativ uuid; v_titulo text; r jsonb; v_origem text;
BEGIN
  SELECT * INTO l FROM ligacoes_viagem WHERE id = p_ligacao AND status IN ('discando','em_andamento');
  IF l.id IS NULL THEN RAISE EXCEPTION 'Ligação inválida ou encerrada.'; END IF;
  v_origem := CASE WHEN l.origem = 'faxina' THEN 'faxina' ELSE 'julia' END;
  SELECT * INTO o FROM organizacoes WHERE id = p_org FOR UPDATE;
  IF o.id IS NULL OR NOT pode_ver_organizacao(l.vendedor_id, o.estado_id, o.responsavel_id) THEN
    RAISE EXCEPTION 'Organização não encontrada para este vendedor.'; END IF;
  IF o.descartada_em IS NOT NULL THEN
    RETURN jsonb_build_object('salvo', true, 'acoes', ARRAY['ja_descartada'], 'avisos', avisos, 'faltas', '{}'::text[]);
  END IF;

  -- descarte encerra o assunto
  IF nullif(p_dados->>'descartar_motivo','') IS NOT NULL THEN
    r := fn_organizacao_descartar(p_org, p_dados->>'descartar_motivo', p_dados->>'descartar_obs', l.vendedor_id, v_origem);
    RETURN jsonb_build_object('salvo', true, 'acoes', ARRAY['descartou'], 'avisos', avisos, 'faltas', '{}'::text[], 'detalhe', r);
  END IF;

  v_nome := nullif(btrim(p_dados->>'pessoa_nome'),'');
  v_cargo := nullif(btrim(p_dados->>'pessoa_cargo'),'');
  v_tel := nullif(btrim(p_dados->>'pessoa_telefone'),'');
  v_dig := nullif(regexp_replace(coalesce(v_tel,''), '\D', '', 'g'), '');
  IF v_tel IS NOT NULL AND NOT fn_tel_valido(v_tel) THEN RAISE EXCEPTION 'Telefone incompleto: diga com DDD.'; END IF;

  IF v_dig IS NOT NULL AND EXISTS (SELECT 1 FROM pessoas p WHERE p.organizacao_id = p_org
       AND (regexp_replace(coalesce(p.telefone,''),'\D','','g') = v_dig OR regexp_replace(coalesce(p.celular,''),'\D','','g') = v_dig)) THEN
    acoes := array_append(acoes, 'telefone_ja_existia'::text);
  ELSIF v_nome IS NOT NULL THEN
    SELECT * INTO pe FROM pessoas p WHERE p.organizacao_id = p_org
      AND lower(unaccent_simple(btrim(p.nome))) = lower(unaccent_simple(v_nome)) ORDER BY p.created_at LIMIT 1;
    IF pe.id IS NULL THEN
      INSERT INTO pessoas(nome, cargo, telefone, organizacao_id, responsavel_id, observacoes)
      VALUES (v_nome, v_cargo, v_tel, p_org, l.vendedor_id, 'Informado pela Júlia em '||to_char(fn_rota_hoje_brt(),'DD/MM/YYYY'));
      acoes := array_append(acoes, 'pessoa_criada'::text);
    ELSE
      IF v_cargo IS NOT NULL AND nullif(btrim(pe.cargo),'') IS NULL THEN UPDATE pessoas SET cargo = v_cargo WHERE id = pe.id; acoes := array_append(acoes, 'cargo_completado'::text); END IF;
      IF v_tel IS NOT NULL THEN
        IF nullif(btrim(pe.telefone),'') IS NULL THEN UPDATE pessoas SET telefone = v_tel WHERE id = pe.id; acoes := array_append(acoes, 'telefone_completado'::text);
        ELSIF nullif(btrim(pe.celular),'') IS NULL THEN UPDATE pessoas SET celular = v_tel WHERE id = pe.id; acoes := array_append(acoes, 'telefone_adicional'::text);
          avisos := avisos || ('O telefone de '||pe.nome||' era outro; guardei o novo como adicional.');
        ELSE
          INSERT INTO pessoas(nome, cargo, telefone, organizacao_id, responsavel_id, observacoes)
          VALUES (pe.nome, coalesce(v_cargo, pe.cargo), v_tel, p_org, l.vendedor_id, 'Contato adicional informado pela Júlia (telefone diferente do cadastrado)');
          acoes := array_append(acoes, 'telefone_adicional'::text);
          avisos := avisos || ('O telefone de '||pe.nome||' era outro; guardei o novo como contato adicional.');
        END IF;
      END IF;
    END IF;
  ELSIF v_tel IS NOT NULL THEN
    RAISE EXCEPTION 'Informe o nome do contato junto com o telefone.';
  END IF;

  v_cidade := nullif(btrim(p_dados->>'cidade'),'');
  v_uf := upper(nullif(btrim(p_dados->>'uf'),''));
  IF v_uf IS NOT NULL THEN SELECT id INTO v_estado FROM estados WHERE sigla = v_uf;
    IF v_estado IS NULL THEN RAISE EXCEPTION 'UF inválida.'; END IF; END IF;
  IF v_cidade IS NOT NULL THEN
    IF nullif(btrim(o.cidade),'') IS NULL THEN UPDATE organizacoes SET cidade = v_cidade WHERE id = p_org; acoes := array_append(acoes, 'cidade_completada'::text);
    ELSIF lower(unaccent_simple(btrim(o.cidade))) <> lower(unaccent_simple(v_cidade)) THEN
      avisos := avisos || ('A cidade cadastrada é '||o.cidade||'; não alterei. Corrija pelo CRM se for o caso.'); END IF;
  END IF;
  IF v_estado IS NOT NULL THEN
    IF o.estado_id IS NULL THEN UPDATE organizacoes SET estado_id = v_estado, estado = v_uf WHERE id = p_org; acoes := array_append(acoes, 'uf_completada'::text);
    ELSIF o.estado_id <> v_estado THEN avisos := array_append(avisos, 'A UF cadastrada é outra; não alterei.'::text); END IF;
  END IF;

  -- "vou descobrir" e "dá pra passar lá": atividades (entram na cobrança). Nunca altera a viagem.
  IF nullif(p_dados->>'descobrir_ate','') IS NOT NULL THEN
    v_data := fn_data_segura(p_dados->>'descobrir_ate');
    IF v_data IS NULL OR v_data < fn_rota_hoje_brt() THEN RAISE EXCEPTION 'Data para descobrir inválida ou no passado.'; END IF;
    v_titulo := 'Pegar contato da '||coalesce(o.nome_fantasia, o.nome);
    IF NOT EXISTS (SELECT 1 FROM atividades WHERE organizacao_id = p_org AND titulo = v_titulo AND NOT concluida) THEN
      INSERT INTO atividades(tipo_id, tipo, titulo, organizacao_id, responsavel_id, data_atividade, data_inicio, concluida, evento_automatico, descricao)
      VALUES ('18a81316-9ca6-4e3f-980c-c771b821a730', 'Tarefa', v_titulo, p_org, l.vendedor_id,
              (v_data + time '09:00') AT TIME ZONE 'America/Sao_Paulo', (v_data + time '09:00') AT TIME ZONE 'America/Sao_Paulo',
              false, false, 'Combinado com a Júlia: descobrir '||array_to_string(fn_organizacao_faltas(p_org), ', '))
      RETURNING id INTO v_ativ;
    END IF;
    acoes := array_append(acoes, 'descobrir'::text);
  END IF;
  IF coalesce((p_dados->>'sugerir_visita')::boolean, false) THEN
    v_data := coalesce(fn_data_segura(p_dados->>'visita_em'), fn_rota_hoje_brt() + 1);
    IF v_data < fn_rota_hoje_brt() THEN v_data := fn_rota_hoje_brt() + 1; END IF;
    v_titulo := 'Sugestão de visita: '||coalesce(o.nome_fantasia, o.nome);
    IF NOT EXISTS (SELECT 1 FROM atividades WHERE organizacao_id = p_org AND titulo = v_titulo AND NOT concluida) THEN
      INSERT INTO atividades(tipo_id, tipo, titulo, organizacao_id, responsavel_id, data_atividade, data_inicio, concluida, evento_automatico, descricao)
      VALUES ('54328293-d880-4b51-bf3a-167bfb773105', 'Visita', v_titulo, p_org, l.vendedor_id,
              (v_data + time '09:00') AT TIME ZONE 'America/Sao_Paulo', (v_data + time '09:00') AT TIME ZONE 'America/Sao_Paulo',
              false, false, 'Sugerida na ligação com a Júlia. Se quiser, adicione como parada da viagem pelo app.');
    END IF;
    acoes := array_append(acoes, 'sugerir_visita'::text);
  END IF;

  IF cardinality(acoes) = 0 THEN RAISE EXCEPTION 'Nada para salvar: informe contato, cidade/UF, data para descobrir, sugestão de visita ou descarte.'; END IF;

  v_acao := CASE WHEN 'sugerir_visita' = ANY(acoes) THEN 'sugerir_visita' WHEN 'descobrir' = ANY(acoes) AND cardinality(acoes) = 1 THEN 'descobrir' ELSE 'completou' END;
  IF NOT (acoes <@ ARRAY['telefone_ja_existia']) THEN
    INSERT INTO organizacao_levantamentos(organizacao_id, origem, rota_id, autor_id, data_visita, acao, contato_nome, contato_cargo, contato_telefone, atividade_id, resultado)
    VALUES (p_org, v_origem, l.rota_id, l.vendedor_id, fn_rota_hoje_brt(), v_acao, v_nome, v_cargo, v_tel, v_ativ,
            'Júlia: '||array_to_string(acoes, ', '));
  END IF;
  PERFORM fn_atualizar_completude(p_org);
  RETURN jsonb_build_object('salvo', true, 'acoes', acoes, 'avisos', avisos, 'faltas', fn_organizacao_faltas(p_org), 'atividade_id', v_ativ);
END $$;
REVOKE ALL ON FUNCTION public.julia_completar_organizacao(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.julia_completar_organizacao(uuid, uuid, jsonb) TO service_role;

-- Funções internas de gatilho: ninguém chama direto.
REVOKE ALL ON FUNCTION public.fn_atualizar_completude(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_completude_pessoas_trg() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_completude_org_trg() FROM PUBLIC, anon, authenticated;

-- 6) Busca da Júlia ignora descartadas (só o filtro mudou)
CREATE OR REPLACE FUNCTION public.julia_buscar_organizacao(p_ligacao uuid, p_texto text, p_cidade text DEFAULT NULL::text, p_uf text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, nome text, cidade text, uf text, matriz_id uuid, matriz_nome text, similaridade real)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_vend uuid; q text := lower(unaccent_simple(btrim(coalesce(p_texto,''))));
BEGIN
  SELECT l.vendedor_id INTO v_vend FROM ligacoes_viagem l WHERE l.id = p_ligacao AND l.status IN ('discando','em_andamento');
  IF v_vend IS NULL THEN RAISE EXCEPTION 'Ligação inválida ou encerrada.'; END IF;
  IF length(q) < 3 THEN RAISE EXCEPTION 'Diga pelo menos 3 letras do nome da empresa.'; END IF;
  RETURN QUERY
  SELECT o.id, coalesce(o.nome_fantasia, o.nome), o.cidade, e.sigla::text, o.matriz_id, coalesce(m.nome_fantasia, m.nome),
         (word_similarity(q, lower(unaccent_simple(coalesce(o.nome,'')||' '||coalesce(o.nome_fantasia,''))))
           + CASE WHEN p_cidade IS NOT NULL AND lower(unaccent_simple(coalesce(o.cidade,''))) = lower(unaccent_simple(p_cidade)) THEN 0.3 ELSE 0 END
           + CASE WHEN p_uf IS NOT NULL AND e.sigla = upper(p_uf) THEN 0.1 ELSE 0 END)::real
  FROM organizacoes o
  LEFT JOIN estados e ON e.id = o.estado_id
  LEFT JOIN organizacoes m ON m.id = o.matriz_id
  WHERE pode_ver_organizacao(v_vend, o.estado_id, o.responsavel_id)
    AND o.descartada_em IS NULL
    AND (word_similarity(q, lower(unaccent_simple(coalesce(o.nome,'')||' '||coalesce(o.nome_fantasia,'')))) >= 0.4
         OR lower(unaccent_simple(coalesce(o.nome,'')||' '||coalesce(o.nome_fantasia,''))) LIKE '%'||q||'%')
  ORDER BY 7 DESC LIMIT 5;
END $function$;

-- 7) Placar semanal: + organizações completadas e descartadas (colunas novas no fim)
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
    WHERE l.user_id = a.responsavel_id AND l.dia >= s.ini) AS liberacoes_semana,
  (SELECT count(*) FROM organizacoes o WHERE o.responsavel_id = a.responsavel_id AND o.descartada_em IS NULL
    AND (o.completada_em AT TIME ZONE 'America/Sao_Paulo')::date >= s.ini AND o.completada_em > o.created_at + interval '1 minute') AS organizacoes_completadas,
  (SELECT count(*) FROM organizacoes o WHERE o.responsavel_id = a.responsavel_id
    AND (o.descartada_em AT TIME ZONE 'America/Sao_Paulo')::date >= s.ini) AS organizacoes_descartadas
FROM atividades a CROSS JOIN semana s
WHERE a.responsavel_id IS NOT NULL
GROUP BY a.responsavel_id, s.ini;
GRANT SELECT ON public.atividades_placar_semanal TO authenticated;
