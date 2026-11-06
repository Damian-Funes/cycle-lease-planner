-- PROPOSTA (não aplicada). Contatos sem duplicar + data_inicio na "Visita realizada" + limpeza da Cocari.
-- Regra espelhada em supabase/functions/_shared/contatosOrg.ts (casarContato).

-- 1) Casamento único de pessoa na organização
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

-- 2) Decisores: reaproveita por primeiro nome; ambíguo não cria; nunca sobrescreve cargo existente
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

-- 3) fn_registrar_levantamento_parada: trocar o bloco do contato e preencher data_inicio.
--    (Função completa reescrita na aplicação; só os trechos alterados abaixo.)
--    a) contato:
--       SELECT * INTO c FROM fn_casar_pessoa_org(p.organizacao_id, v_nome);
--       IF c.ambigua THEN v_pessoa := NULL;                       -- não cria; aviso já sai na ferramenta
--       ELSIF c.pessoa_id IS NULL THEN INSERT INTO pessoas (...) RETURNING id INTO v_pessoa;
--       ELSE v_pessoa := c.pessoa_id;
--            UPDATE pessoas SET cargo = CASE WHEN NULLIF(btrim(cargo),'') IS NULL AND v_cargo IS NOT NULL THEN v_cargo ELSE cargo END,
--                               e_decisor = COALESCE(e_decisor,false) OR v_decisor WHERE id = v_pessoa;
--       END IF;
--       -- cargo diferente fica só no histórico: organizacao_levantamentos.contato_cargo (já gravado).
--    b) INSERT da "Visita realizada": acrescentar data_inicio = COALESCE(p.informada_em, now()).

-- 4) Correção de dados (Cocari, parada 3a74c911)
BEGIN;
-- mesclar "Marcelo (Gerente da unidade)" f34da782 em "Marcelo Guerra" adcbbe87
UPDATE atividades               SET pessoa_id='adcbbe87-6244-4be7-8d75-82717621a15c' WHERE pessoa_id='f34da782-c409-48e9-b5bd-8b5a5facde18';
UPDATE organizacao_levantamentos SET pessoa_id='adcbbe87-6244-4be7-8d75-82717621a15c' WHERE pessoa_id='f34da782-c409-48e9-b5bd-8b5a5facde18'; -- contato_cargo 'Gerente da unidade' continua no histórico
UPDATE oportunidade_pessoas     SET pessoa_id='adcbbe87-6244-4be7-8d75-82717621a15c' WHERE pessoa_id='f34da782-c409-48e9-b5bd-8b5a5facde18'
  AND NOT EXISTS (SELECT 1 FROM oportunidade_pessoas o2 WHERE o2.pessoa_id='adcbbe87-6244-4be7-8d75-82717621a15c' AND o2.oportunidade_id=oportunidade_pessoas.oportunidade_id);
UPDATE pessoa_notas  SET pessoa_id='adcbbe87-6244-4be7-8d75-82717621a15c' WHERE pessoa_id='f34da782-c409-48e9-b5bd-8b5a5facde18';
UPDATE pessoa_perfis SET pessoa_id='adcbbe87-6244-4be7-8d75-82717621a15c' WHERE pessoa_id='f34da782-c409-48e9-b5bd-8b5a5facde18';
UPDATE layouts       SET pessoa_id='adcbbe87-6244-4be7-8d75-82717621a15c' WHERE pessoa_id='f34da782-c409-48e9-b5bd-8b5a5facde18';
UPDATE conversas_whatsapp SET pessoa_id='adcbbe87-6244-4be7-8d75-82717621a15c' WHERE pessoa_id='f34da782-c409-48e9-b5bd-8b5a5facde18';
UPDATE ligacoes_bot  SET pessoa_id='adcbbe87-6244-4be7-8d75-82717621a15c' WHERE pessoa_id='f34da782-c409-48e9-b5bd-8b5a5facde18';
DELETE FROM oportunidade_pessoas WHERE pessoa_id='f34da782-c409-48e9-b5bd-8b5a5facde18';
DELETE FROM pessoas WHERE id='f34da782-c409-48e9-b5bd-8b5a5facde18';
-- data_inicio da "Visita realizada"
UPDATE atividades SET data_inicio = data_atividade WHERE id='c6214a72-60cd-4054-8efe-eb5f37e597d2' AND data_inicio IS NULL;
-- opcional: corrigir outras "Visita realizada" antigas sem data_inicio
UPDATE atividades SET data_inicio = data_atividade WHERE titulo='Visita realizada' AND evento_automatico AND data_inicio IS NULL;
COMMIT;
