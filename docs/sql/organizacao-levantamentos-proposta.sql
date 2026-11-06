-- Visitas alimentam a Organização: histórico imutável de levantamentos (idempotente).

CREATE OR REPLACE FUNCTION public.unaccent_simple(t text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT translate(t, 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
                      'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC') $$;

CREATE OR REPLACE FUNCTION public.fn_num_seguro(_t text) RETURNS numeric
LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
BEGIN RETURN CASE WHEN _t::numeric >= 0 THEN _t::numeric END; EXCEPTION WHEN OTHERS THEN RETURN NULL; END $$;

CREATE OR REPLACE FUNCTION public.fn_data_segura(_t text) RETURNS date
LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
BEGIN RETURN CASE WHEN _t ~ '^\d{4}-\d{2}-\d{2}$' THEN _t::date END; EXCEPTION WHEN OTHERS THEN RETURN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.organizacao_levantamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  origem text NOT NULL DEFAULT 'visita_rota' CHECK (origem IN ('visita_rota','manual','whatsapp')),
  rota_id uuid REFERENCES public.rotas(id) ON DELETE SET NULL,
  parada_id uuid REFERENCES public.rota_paradas(id) ON DELETE SET NULL,
  oportunidade_id uuid,
  autor_id uuid,
  data_visita date NOT NULL,
  resultado text,
  contato_nome text, contato_cargo text, decisores text,
  sacos_safra numeric CHECK (sacos_safra IS NULL OR sacos_safra >= 0),
  equipamento_atual text, problema_principal text,
  interesse text CHECK (interesse IS NULL OR interesse IN ('alto','medio','baixo')),
  motivo_interesse text, objecoes text[], concorrente text,
  proximo_passo text, proximo_passo_data date,
  atividade_id uuid,
  atividade_visita_id uuid,
  pessoa_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS organizacao_levantamentos_parada_key
  ON public.organizacao_levantamentos(parada_id) WHERE parada_id IS NOT NULL AND origem = 'visita_rota';
CREATE INDEX IF NOT EXISTS organizacao_levantamentos_org_idx
  ON public.organizacao_levantamentos(organizacao_id, data_visita DESC, created_at DESC);

GRANT SELECT, UPDATE, DELETE ON public.organizacao_levantamentos TO authenticated;
GRANT ALL ON public.organizacao_levantamentos TO service_role;
ALTER TABLE public.organizacao_levantamentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lev_select ON public.organizacao_levantamentos;
CREATE POLICY lev_select ON public.organizacao_levantamentos FOR SELECT TO authenticated
USING (public.is_approved(auth.uid()) AND EXISTS (
  SELECT 1 FROM public.organizacoes o
  WHERE o.id = organizacao_id AND public.pode_ver_organizacao(auth.uid(), o.estado_id, o.responsavel_id)));
DROP POLICY IF EXISTS lev_update_admin ON public.organizacao_levantamentos;
CREATE POLICY lev_update_admin ON public.organizacao_levantamentos FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS lev_delete_admin ON public.organizacao_levantamentos;
CREATE POLICY lev_delete_admin ON public.organizacao_levantamentos FOR DELETE TO authenticated
USING (public.has_role(auth.uid(),'admin'));

DROP TRIGGER IF EXISTS trg_lev_updated ON public.organizacao_levantamentos;
CREATE TRIGGER trg_lev_updated BEFORE UPDATE ON public.organizacao_levantamentos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE VIEW public.organizacao_situacao_atual WITH (security_invoker = true) AS
SELECT o.id AS organizacao_id,
  (SELECT jsonb_build_object('valor', l.sacos_safra, 'data', l.data_visita, 'autor_id', l.autor_id) FROM public.organizacao_levantamentos l WHERE l.organizacao_id=o.id AND l.sacos_safra IS NOT NULL ORDER BY l.data_visita DESC, l.created_at DESC LIMIT 1) AS sacos_safra,
  (SELECT jsonb_build_object('valor', l.equipamento_atual, 'data', l.data_visita, 'autor_id', l.autor_id) FROM public.organizacao_levantamentos l WHERE l.organizacao_id=o.id AND l.equipamento_atual IS NOT NULL ORDER BY l.data_visita DESC, l.created_at DESC LIMIT 1) AS equipamento_atual,
  (SELECT jsonb_build_object('valor', l.decisores, 'data', l.data_visita, 'autor_id', l.autor_id) FROM public.organizacao_levantamentos l WHERE l.organizacao_id=o.id AND l.decisores IS NOT NULL ORDER BY l.data_visita DESC, l.created_at DESC LIMIT 1) AS decisores,
  (SELECT jsonb_build_object('valor', l.interesse, 'motivo', l.motivo_interesse, 'data', l.data_visita, 'autor_id', l.autor_id) FROM public.organizacao_levantamentos l WHERE l.organizacao_id=o.id AND l.interesse IS NOT NULL ORDER BY l.data_visita DESC, l.created_at DESC LIMIT 1) AS interesse,
  (SELECT jsonb_build_object('valor', l.concorrente, 'data', l.data_visita, 'autor_id', l.autor_id) FROM public.organizacao_levantamentos l WHERE l.organizacao_id=o.id AND l.concorrente IS NOT NULL ORDER BY l.data_visita DESC, l.created_at DESC LIMIT 1) AS concorrente,
  (SELECT jsonb_build_object('valor', l.problema_principal, 'data', l.data_visita, 'autor_id', l.autor_id) FROM public.organizacao_levantamentos l WHERE l.organizacao_id=o.id AND l.problema_principal IS NOT NULL ORDER BY l.data_visita DESC, l.created_at DESC LIMIT 1) AS problema_principal,
  (SELECT jsonb_build_object('data', l.data_visita, 'autor_id', l.autor_id, 'rota_id', l.rota_id) FROM public.organizacao_levantamentos l WHERE l.organizacao_id=o.id ORDER BY l.data_visita DESC, l.created_at DESC LIMIT 1) AS ultima_visita
FROM public.organizacoes o
WHERE EXISTS (SELECT 1 FROM public.organizacao_levantamentos l WHERE l.organizacao_id = o.id);
GRANT SELECT ON public.organizacao_situacao_atual TO authenticated;

-- Registra levantamento de uma parada. _origem 'visita_rota' é idempotente; 'manual' sempre insere nova linha.
CREATE OR REPLACE FUNCTION public.fn_registrar_levantamento_parada(_parada uuid, _origem text DEFAULT 'visita_rota', _autor uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p public.rota_paradas; r public.rotas; rel jsonb; v_id uuid; v_pessoa uuid;
  v_ativ uuid; v_data date; v_nome text; v_cargo text; v_dec text; v_resumo text; v_decisor boolean;
BEGIN
  SELECT * INTO p FROM rota_paradas WHERE id = _parada;
  IF p.id IS NULL OR p.visitada IS NOT TRUE OR p.organizacao_id IS NULL THEN RETURN NULL; END IF;
  IF _origem = 'visita_rota' THEN
    SELECT id INTO v_id FROM organizacao_levantamentos WHERE parada_id = _parada AND origem = 'visita_rota';
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;

  SELECT * INTO r FROM rotas WHERE id = p.rota_id;
  rel := CASE WHEN jsonb_typeof(p.relato) = 'object' THEN p.relato ELSE '{}'::jsonb END;
  v_data := COALESCE(p.dia, (COALESCE(p.informada_em, now()) AT TIME ZONE 'America/Sao_Paulo')::date);
  v_nome := NULLIF(btrim(rel->>'contato_nome'), '');
  v_cargo := NULLIF(btrim(rel->>'contato_cargo'), '');
  v_dec := NULLIF(btrim(rel->>'decisores'), '');

  IF v_nome IS NOT NULL THEN
    v_decisor := lower(unaccent_simple(COALESCE(v_cargo,''))) ~ '(diretor|proprietari|socio|dono)'
      OR (v_dec IS NOT NULL AND position(lower(unaccent_simple(v_nome)) IN lower(unaccent_simple(v_dec))) > 0);
    SELECT id INTO v_pessoa FROM pessoas
     WHERE organizacao_id = p.organizacao_id
       AND lower(unaccent_simple(btrim(nome))) = lower(unaccent_simple(v_nome))
     ORDER BY created_at LIMIT 1;
    IF v_pessoa IS NULL THEN
      INSERT INTO pessoas (nome, cargo, organizacao_id, responsavel_id, e_decisor)
      VALUES (v_nome, v_cargo, p.organizacao_id, r.vendedor_id, v_decisor) RETURNING id INTO v_pessoa;
    ELSE
      UPDATE pessoas SET
        cargo = CASE WHEN NULLIF(btrim(cargo),'') IS NULL AND v_cargo IS NOT NULL THEN v_cargo ELSE cargo END,
        e_decisor = COALESCE(e_decisor, false) OR v_decisor
      WHERE id = v_pessoa;
    END IF;
  END IF;

  IF _origem = 'visita_rota' THEN
    IF p.atividade_id IS NOT NULL AND EXISTS (SELECT 1 FROM atividades WHERE id = p.atividade_id) THEN
      UPDATE atividades SET concluida = true,
        data_conclusao = COALESCE(data_conclusao, p.informada_em, now()),
        resultado = COALESCE(NULLIF(btrim(resultado),''), p.resultado)
      WHERE id = p.atividade_id AND (concluida IS NOT TRUE OR NULLIF(btrim(resultado),'') IS NULL);
      v_ativ := p.atividade_id;
    ELSE
      v_resumo := concat_ws(E'\n', p.resultado,
        CASE WHEN v_nome IS NOT NULL THEN 'Contato: '||v_nome||COALESCE(' ('||v_cargo||')','') END,
        CASE WHEN rel ? 'sacos_safra' THEN 'Sacos/safra: '||(rel->>'sacos_safra') END,
        CASE WHEN rel ? 'equipamento_atual' THEN 'Equipamento: '||(rel->>'equipamento_atual') END,
        CASE WHEN rel ? 'interesse' THEN 'Interesse: '||(rel->>'interesse') END,
        CASE WHEN rel ? 'concorrente' THEN 'Concorrente: '||(rel->>'concorrente') END,
        CASE WHEN rel ? 'proximo_passo' THEN 'Próximo passo: '||(rel->>'proximo_passo') END);
      INSERT INTO atividades (tipo, tipo_id, titulo, descricao, resultado, concluida, data_conclusao,
        data_atividade, organizacao_id, oportunidade_id, pessoa_id, responsavel_id, evento_automatico)
      VALUES ('visita', (SELECT id FROM tipos_atividade WHERE nome='Visita' LIMIT 1),
        'Visita realizada', v_resumo, p.resultado, true, COALESCE(p.informada_em, now()),
        COALESCE(p.informada_em, now()), p.organizacao_id, p.oportunidade_id, v_pessoa, r.vendedor_id, true)
      RETURNING id INTO v_ativ;
    END IF;
  END IF;

  INSERT INTO organizacao_levantamentos (organizacao_id, origem, rota_id, parada_id, oportunidade_id,
    autor_id, data_visita, resultado, contato_nome, contato_cargo, decisores, sacos_safra,
    equipamento_atual, problema_principal, interesse, motivo_interesse, objecoes, concorrente,
    proximo_passo, proximo_passo_data, atividade_id, atividade_visita_id, pessoa_id)
  VALUES (p.organizacao_id, _origem, p.rota_id, p.id, p.oportunidade_id,
    CASE WHEN _origem = 'visita_rota' THEN r.vendedor_id ELSE COALESCE(_autor, auth.uid()) END,
    CASE WHEN _origem = 'visita_rota' THEN v_data ELSE (now() AT TIME ZONE 'America/Sao_Paulo')::date END,
    p.resultado, v_nome, v_cargo, v_dec, fn_num_seguro(rel->>'sacos_safra'),
    NULLIF(btrim(rel->>'equipamento_atual'),''), NULLIF(btrim(rel->>'problema_principal'),''),
    CASE WHEN rel->>'interesse' IN ('alto','medio','baixo') THEN rel->>'interesse' END,
    NULLIF(btrim(rel->>'motivo_interesse'),''),
    CASE WHEN jsonb_typeof(rel->'objecoes')='array' THEN ARRAY(SELECT jsonb_array_elements_text(rel->'objecoes')) END,
    NULLIF(btrim(rel->>'concorrente'),''), NULLIF(btrim(rel->>'proximo_passo'),''),
    fn_data_segura(rel->>'proximo_passo_data'), fn_uuid_seguro(rel->>'atividade_id'), v_ativ, v_pessoa)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.fn_registrar_levantamento_parada(uuid, text, uuid) FROM PUBLIC, anon, authenticated;

-- Gatilho: nunca trava a prestação.
CREATE OR REPLACE FUNCTION public.fn_paradas_levantamento() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.visitada IS TRUE AND NEW.organizacao_id IS NOT NULL THEN
    BEGIN
      IF TG_OP = 'INSERT' OR OLD.visitada IS DISTINCT FROM TRUE THEN
        PERFORM fn_registrar_levantamento_parada(NEW.id, 'visita_rota', NULL);
      ELSIF NEW.relato IS DISTINCT FROM OLD.relato
        AND EXISTS (SELECT 1 FROM organizacao_levantamentos WHERE parada_id = NEW.id AND origem = 'visita_rota') THEN
        PERFORM fn_registrar_levantamento_parada(NEW.id, 'manual', auth.uid());
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'levantamento da parada % falhou: %', NEW.id, SQLERRM;
    END;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_paradas_levantamento ON public.rota_paradas;
CREATE TRIGGER trg_paradas_levantamento AFTER INSERT OR UPDATE OF visitada, relato ON public.rota_paradas
FOR EACH ROW EXECUTE FUNCTION public.fn_paradas_levantamento();

-- Backfill (idempotente)
SELECT public.fn_registrar_levantamento_parada(id, 'visita_rota', NULL)
FROM public.rota_paradas WHERE visitada IS TRUE AND organizacao_id IS NOT NULL;
