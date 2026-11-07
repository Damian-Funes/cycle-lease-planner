-- PROPOSTA (aplicar só após aprovação): nome aproximado no casamento de contatos da Júlia.
-- Ordem: exato > primeiro nome igual (único) > primeiro nome aproximado (único). Ambíguo não cria.
-- Aproximado = 1 letra de diferença (inserção, remoção ou troca), só para primeiros nomes com 5+ letras.
-- Ex.: "Marcello" → Marcelo Guerra; "Marcos" NÃO casa com Marcelo.
-- Espelho em supabase/functions/_shared/contatosOrg.ts (casarContato / edicaoAte1).
-- Função própria (sem instalar a extensão fuzzystrmatch): pura, IMMUTABLE e sem dependências.

CREATE OR REPLACE FUNCTION public.fn_edicao_ate_1(a text, b text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE l text; c text; i int := 1;
BEGIN
  IF a IS NULL OR b IS NULL THEN RETURN false; END IF;
  IF a = b THEN RETURN true; END IF;
  IF abs(length(a) - length(b)) > 1 THEN RETURN false; END IF;
  IF length(a) >= length(b) THEN l := a; c := b; ELSE l := b; c := a; END IF;
  WHILE i <= length(c) AND substr(l, i, 1) = substr(c, i, 1) LOOP i := i + 1; END LOOP;
  IF length(l) = length(c) THEN RETURN substr(l, i + 1) = substr(c, i + 1); END IF;
  RETURN substr(l, i + 1) = substr(c, i);
END $$;

CREATE OR REPLACE FUNCTION public.fn_casar_pessoa_org(_org uuid, _nome text, OUT pessoa_id uuid, OUT ambigua boolean)
RETURNS record LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE alvo text := btrim(regexp_replace(lower(unaccent_simple(coalesce(_nome,''))), '[^a-z ]', ' ', 'g'));
        p1 text; p2 text; n int;
BEGIN
  ambigua := false; alvo := regexp_replace(alvo, '\s+', ' ', 'g');
  IF _org IS NULL OR alvo = '' THEN RETURN; END IF;
  -- 1) Nome completo igual.
  SELECT id INTO pessoa_id FROM pessoas WHERE organizacao_id=_org
    AND regexp_replace(btrim(regexp_replace(lower(unaccent_simple(nome)),'[^a-z ]',' ','g')),'\s+',' ','g') = alvo
    ORDER BY created_at LIMIT 1;
  IF pessoa_id IS NOT NULL THEN RETURN; END IF;
  p1 := split_part(alvo,' ',1); p2 := nullif(split_part(alvo,' ',2),'');
  -- 2) Primeiro nome igual (sobrenomes ditos dos dois lados e diferentes = outra pessoa).
  WITH c AS (
    SELECT id, created_at, regexp_split_to_array(regexp_replace(btrim(regexp_replace(lower(unaccent_simple(nome)),'[^a-z ]',' ','g')),'\s+',' ','g'),' ') t
    FROM pessoas WHERE organizacao_id=_org AND length(btrim(nome))>=3)
  SELECT count(*), (array_agg(id ORDER BY created_at))[1] INTO n, pessoa_id FROM c
   WHERE t[1]=p1 AND NOT (p2 IS NOT NULL AND t[2] IS NOT NULL AND t[2]<>p2);
  IF n > 1 THEN pessoa_id := NULL; ambigua := true; RETURN; END IF;
  IF n = 1 THEN RETURN; END IF;
  -- 3) Primeiro nome aproximado (5+ letras, 1 letra de diferença), só se único.
  IF length(p1) < 5 THEN RETURN; END IF;
  WITH c AS (
    SELECT id, created_at, regexp_split_to_array(regexp_replace(btrim(regexp_replace(lower(unaccent_simple(nome)),'[^a-z ]',' ','g')),'\s+',' ','g'),' ') t
    FROM pessoas WHERE organizacao_id=_org AND length(btrim(nome))>=3)
  SELECT count(*), (array_agg(id ORDER BY created_at))[1] INTO n, pessoa_id FROM c
   WHERE length(t[1]) >= 5 AND fn_edicao_ate_1(t[1], p1)
     AND NOT (p2 IS NOT NULL AND t[2] IS NOT NULL AND t[2]<>p2);
  IF n > 1 THEN pessoa_id := NULL; ambigua := true; END IF;
END $$;

-- Mantém a função de casamento fora do alcance direto do app (só RPCs da Júlia/serviço a usam).
REVOKE ALL ON FUNCTION public.fn_casar_pessoa_org(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_casar_pessoa_org(uuid, text) TO service_role;

-- Conferência pós-aplicação (Cocari a209f1d7…):
-- SELECT n, (fn_casar_pessoa_org(o.id, n)).* FROM organizacoes o,
--   unnest(ARRAY['Marcello','Isaías','Gilberto','Marcos','Marcelo']) n WHERE o.id::text LIKE 'a209f1d7%';
-- Esperado: Marcello/Marcelo → Marcelo Guerra; Isaías → Isaias Rodigues; Gilberto → Gilberto; Marcos → vazio.
