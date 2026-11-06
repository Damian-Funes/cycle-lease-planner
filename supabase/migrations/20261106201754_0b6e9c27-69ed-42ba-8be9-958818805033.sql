CREATE OR REPLACE FUNCTION public.fn_casar_pessoa_org(_org uuid, _nome text, OUT pessoa_id uuid, OUT ambigua boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE alvo text := btrim(regexp_replace(lower(unaccent_simple(coalesce(_nome,''))), '[^a-z ]', ' ', 'g'));
        p1 text; p2 text; n int;
BEGIN
  ambigua := false; alvo := regexp_replace(alvo, '\s+', ' ', 'g');
  IF _org IS NULL OR alvo = '' THEN RETURN; END IF;
  SELECT id INTO pessoa_id FROM pessoas WHERE organizacao_id=_org
    AND regexp_replace(btrim(regexp_replace(lower(unaccent_simple(nome)),'[^a-z ]',' ','g')),'\s+',' ','g') = alvo
    ORDER BY created_at LIMIT 1;
  IF pessoa_id IS NOT NULL THEN RETURN; END IF;
  p1 := split_part(alvo,' ',1); p2 := nullif(split_part(alvo,' ',2),'');
  WITH c AS (
    SELECT id, created_at, regexp_split_to_array(regexp_replace(btrim(regexp_replace(lower(unaccent_simple(nome)),'[^a-z ]',' ','g')),'\s+',' ','g'),' ') t
    FROM pessoas WHERE organizacao_id=_org AND length(btrim(nome))>=3)
  SELECT count(*), (array_agg(id ORDER BY created_at))[1] INTO n, pessoa_id FROM c
   WHERE t[1]=p1 AND NOT (p2 IS NOT NULL AND t[2] IS NOT NULL AND t[2]<>p2);
  IF n > 1 THEN pessoa_id := NULL; ambigua := true; END IF;
END $$;
REVOKE ALL ON FUNCTION public.fn_casar_pessoa_org(uuid,text) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_registrar_decisores(_org uuid, _texto text, _resp uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE m text[]; v_nome text; v_cargo text; c record;
BEGIN
  IF _org IS NULL OR _texto IS NULL THEN RETURN; END IF;
  FOR m IN SELECT regexp_matches(_texto, '([[:upper:]][[:alpha:]]+(?: [[:upper:]][[:alpha:]]+)?)\s*\(([^()]{2,80})\)', 'g') LOOP
    v_nome := btrim(m[1]); v_cargo := btrim(m[2]); v_cargo := upper(left(v_cargo,1)) || substr(v_cargo,2);
    SELECT * INTO c FROM fn_casar_pessoa_org(_org, v_nome);
    IF c.ambigua THEN CONTINUE; END IF;
    IF c.pessoa_id IS NULL THEN
      INSERT INTO pessoas (nome, cargo, organizacao_id, responsavel_id, e_decisor) VALUES (v_nome, v_cargo, _org, _resp, true);
    ELSE
      UPDATE pessoas SET e_decisor = true,
        cargo = CASE WHEN NULLIF(btrim(cargo),'') IS NULL THEN v_cargo ELSE cargo END WHERE id = c.pessoa_id;
    END IF;
  END LOOP;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_registrar_levantamento_parada(_parada uuid, _origem text DEFAULT 'visita_rota'::text, _autor uuid DEFAULT NULL::uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  p public.rota_paradas; r public.rotas; rel jsonb; v_id uuid; v_pessoa uuid; c record;
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
    SELECT * INTO c FROM fn_casar_pessoa_org(p.organizacao_id, v_nome);
    IF c.ambigua THEN
      v_pessoa := NULL;
    ELSIF c.pessoa_id IS NULL THEN
      INSERT INTO pessoas (nome, cargo, organizacao_id, responsavel_id, e_decisor)
      VALUES (v_nome, v_cargo, p.organizacao_id, r.vendedor_id, v_decisor) RETURNING id INTO v_pessoa;
    ELSE
      v_pessoa := c.pessoa_id;
      UPDATE pessoas SET
        cargo = CASE WHEN NULLIF(btrim(cargo),'') IS NULL AND v_cargo IS NOT NULL THEN v_cargo ELSE cargo END,
        e_decisor = COALESCE(e_decisor, false) OR v_decisor
      WHERE id = v_pessoa;
    END IF;
  END IF;
  PERFORM fn_registrar_decisores(p.organizacao_id, v_dec, r.vendedor_id);

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
        data_atividade, data_inicio, organizacao_id, oportunidade_id, pessoa_id, responsavel_id, evento_automatico)
      VALUES ('visita', (SELECT id FROM tipos_atividade WHERE nome='Visita' LIMIT 1),
        'Visita realizada', v_resumo, p.resultado, true, COALESCE(p.informada_em, now()),
        COALESCE(p.informada_em, now()), COALESCE(p.informada_em, now()),
        p.organizacao_id, p.oportunidade_id, v_pessoa, r.vendedor_id, true)
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
END $function$;

UPDATE atividades               SET pessoa_id='adcbbe87-6244-4be7-8d75-82717621a15c' WHERE pessoa_id='f34da782-c409-48e9-b5bd-8b5a5facde18';
UPDATE organizacao_levantamentos SET pessoa_id='adcbbe87-6244-4be7-8d75-82717621a15c' WHERE pessoa_id='f34da782-c409-48e9-b5bd-8b5a5facde18';
UPDATE oportunidade_pessoas     SET pessoa_id='adcbbe87-6244-4be7-8d75-82717621a15c' WHERE pessoa_id='f34da782-c409-48e9-b5bd-8b5a5facde18'
  AND NOT EXISTS (SELECT 1 FROM oportunidade_pessoas o2 WHERE o2.pessoa_id='adcbbe87-6244-4be7-8d75-82717621a15c' AND o2.oportunidade_id=oportunidade_pessoas.oportunidade_id);
UPDATE pessoa_notas  SET pessoa_id='adcbbe87-6244-4be7-8d75-82717621a15c' WHERE pessoa_id='f34da782-c409-48e9-b5bd-8b5a5facde18';
UPDATE pessoa_perfis SET pessoa_id='adcbbe87-6244-4be7-8d75-82717621a15c' WHERE pessoa_id='f34da782-c409-48e9-b5bd-8b5a5facde18';
UPDATE layouts       SET pessoa_id='adcbbe87-6244-4be7-8d75-82717621a15c' WHERE pessoa_id='f34da782-c409-48e9-b5bd-8b5a5facde18';
UPDATE conversas_whatsapp SET pessoa_id='adcbbe87-6244-4be7-8d75-82717621a15c' WHERE pessoa_id='f34da782-c409-48e9-b5bd-8b5a5facde18';
UPDATE ligacoes_bot  SET pessoa_id='adcbbe87-6244-4be7-8d75-82717621a15c' WHERE pessoa_id='f34da782-c409-48e9-b5bd-8b5a5facde18';
DELETE FROM oportunidade_pessoas WHERE pessoa_id='f34da782-c409-48e9-b5bd-8b5a5facde18';
DELETE FROM pessoas WHERE id='f34da782-c409-48e9-b5bd-8b5a5facde18';
UPDATE atividades SET data_inicio = data_atividade WHERE titulo='Visita realizada' AND evento_automatico AND data_inicio IS NULL;