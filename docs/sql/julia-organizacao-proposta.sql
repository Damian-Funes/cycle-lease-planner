-- Júlia vincula empresa na ligação + Matriz/Filial + notificações "o que faltou" (idempotente).

-- 1. Matriz/filial (um nível)
ALTER TABLE public.organizacoes ADD COLUMN IF NOT EXISTS matriz_id uuid REFERENCES public.organizacoes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_organizacoes_matriz ON public.organizacoes(matriz_id) WHERE matriz_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_organizacoes_nome_trgm ON public.organizacoes
  USING gin (lower(public.unaccent_simple(coalesce(nome,'')||' '||coalesce(nome_fantasia,''))) public.gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.fn_organizacoes_matriz_validar() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.matriz_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.matriz_id = NEW.id THEN RAISE EXCEPTION 'Uma organização não pode ser filial de si mesma.'; END IF;
  IF EXISTS (SELECT 1 FROM organizacoes WHERE id = NEW.matriz_id AND matriz_id IS NOT NULL) THEN
    RAISE EXCEPTION 'A matriz escolhida já é filial de outra organização.'; END IF;
  IF EXISTS (SELECT 1 FROM organizacoes WHERE matriz_id = NEW.id) THEN
    RAISE EXCEPTION 'Esta organização tem filiais e não pode virar filial.'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_organizacoes_matriz ON public.organizacoes;
CREATE TRIGGER trg_organizacoes_matriz BEFORE INSERT OR UPDATE OF matriz_id ON public.organizacoes
FOR EACH ROW EXECUTE FUNCTION public.fn_organizacoes_matriz_validar();

-- Matriz só por admin/gerente (fora do servidor)
CREATE OR REPLACE FUNCTION public.fn_organizacoes_matriz_permissao() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NEW.matriz_id IS DISTINCT FROM (CASE WHEN TG_OP='UPDATE' THEN OLD.matriz_id END)
     AND NOT has_any_role(auth.uid(), ARRAY['admin','gerente_comercial']::app_role[]) THEN
    RAISE EXCEPTION 'Somente admin ou gerente definem a matriz.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_organizacoes_matriz_permissao ON public.organizacoes;
CREATE TRIGGER trg_organizacoes_matriz_permissao BEFORE INSERT OR UPDATE OF matriz_id ON public.organizacoes
FOR EACH ROW EXECUTE FUNCTION public.fn_organizacoes_matriz_permissao();
REVOKE ALL ON FUNCTION public.fn_organizacoes_matriz_permissao() FROM PUBLIC, anon, authenticated;

-- 2. Vincular empresa a parada sem organização NÃO é replanejamento (cópia da produção; só a expressão muda)
CREATE OR REPLACE FUNCTION public.fn_paradas_protecao()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r public.rotas; planejamento boolean; admin boolean:=coalesce(public.has_role(auth.uid(),'admin'),false); hoje date:=(now() AT TIME ZONE 'America/Sao_Paulo')::date; prestou boolean:=false;
BEGIN
 IF TG_OP='UPDATE' AND NEW.rota_id IS DISTINCT FROM OLD.rota_id THEN RAISE EXCEPTION 'Não é permitido transferir paradas entre rotas.'; END IF;
 SELECT * INTO r FROM public.rotas WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.rota_id ELSE NEW.rota_id END FOR UPDATE;
 IF NOT FOUND THEN IF TG_OP='DELETE' THEN RETURN OLD; END IF; RAISE EXCEPTION 'Rota não encontrada.'; END IF;
 IF NOT admin AND r.status IN ('concluida','cancelada') THEN RAISE EXCEPTION 'Paradas de uma rota encerrada não podem ser alteradas.'; END IF;
 IF TG_OP='INSERT' AND NEW.tipo='pernoite' THEN RAISE EXCEPTION 'Pernoites são registrados durante a viagem, não no planejamento.'; END IF;
 planejamento:=TG_OP IN ('INSERT','DELETE');
 IF TG_OP='UPDATE' THEN planejamento:=ROW(NEW.oportunidade_id,NEW.cidade,NEW.estado,NEW.ordem,NEW.objetivo,NEW.tipo,NEW.latitude,NEW.longitude,NEW.atividade_id) IS DISTINCT FROM ROW(OLD.oportunidade_id,OLD.cidade,OLD.estado,OLD.ordem,OLD.objetivo,OLD.tipo,OLD.latitude,OLD.longitude,OLD.atividade_id) OR (OLD.organizacao_id IS NOT NULL AND NEW.organizacao_id IS DISTINCT FROM OLD.organizacao_id); END IF;
 IF planejamento AND NOT admin AND r.status='aprovada' AND coalesce(r.data_fim,r.data_rota)<hoje THEN RAISE EXCEPTION 'O plano de uma viagem passada não pode ser alterado. Preste contas.'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF (TG_OP='INSERT' AND (NEW.visitada IS NOT NULL OR NEW.resultado IS NOT NULL OR NEW.motivo_nao_visita IS NOT NULL)) OR (TG_OP='UPDATE' AND ROW(NEW.visitada,NEW.resultado,NEW.motivo_nao_visita) IS DISTINCT FROM ROW(OLD.visitada,OLD.resultado,OLD.motivo_nao_visita)) THEN
   IF NOT admin AND (r.status<>'aprovada' OR coalesce(r.data_inicio,r.data_rota)>hoje) THEN RAISE EXCEPTION 'Preste contas somente na data de uma viagem aprovada.'; END IF;
   prestou:=true;
   NEW.informada_em:=CASE WHEN NEW.visitada IS NULL THEN NULL ELSE now() END;
 ELSIF TG_OP='UPDATE' THEN NEW.informada_em:=OLD.informada_em; ELSE NEW.informada_em:=NULL; END IF;
 IF prestou THEN
   NEW.dia := CASE WHEN NEW.visitada IS NULL THEN NULL
                   ELSE least(greatest(hoje, coalesce(r.data_inicio,r.data_rota)), coalesce(r.data_fim,r.data_rota)) END;
 ELSIF TG_OP='UPDATE' AND NOT admin THEN NEW.dia := OLD.dia;
 ELSIF TG_OP='INSERT' THEN NEW.dia := NULL;
 END IF;
 IF NEW.dia IS NOT NULL AND (NEW.dia < coalesce(r.data_inicio,r.data_rota) OR NEW.dia > coalesce(r.data_fim,r.data_rota)) THEN RAISE EXCEPTION 'O dia da parada precisa estar dentro do período da viagem.'; END IF;
 RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_paradas_reaprovacao()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE rid uuid; planejamento boolean;
BEGIN
 rid:=CASE WHEN TG_OP='DELETE' THEN OLD.rota_id ELSE NEW.rota_id END;
 planejamento:=TG_OP IN ('INSERT','DELETE');
 IF TG_OP='UPDATE' THEN planejamento:=ROW(NEW.oportunidade_id,NEW.cidade,NEW.estado,NEW.ordem,NEW.objetivo,NEW.tipo,NEW.latitude,NEW.longitude,NEW.atividade_id) IS DISTINCT FROM ROW(OLD.oportunidade_id,OLD.cidade,OLD.estado,OLD.ordem,OLD.objetivo,OLD.tipo,OLD.latitude,OLD.longitude,OLD.atividade_id) OR (OLD.organizacao_id IS NOT NULL AND NEW.organizacao_id IS DISTINCT FROM OLD.organizacao_id); END IF;
 IF planejamento THEN UPDATE public.rotas SET status='aguardando_aprovacao' WHERE id=rid AND status='aprovada' AND coalesce(data_fim,data_rota)>=(now() AT TIME ZONE 'America/Sao_Paulo')::date; END IF;
 RETURN NULL;
END $function$;

-- 3. Levantamento: decisores citados viram pessoas (nome + cargo claros)
CREATE OR REPLACE FUNCTION public.fn_registrar_decisores(_org uuid, _texto text, _resp uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m text[]; v_nome text; v_cargo text; v_id uuid;
BEGIN
  IF _org IS NULL OR _texto IS NULL THEN RETURN; END IF;
  FOR m IN SELECT regexp_matches(_texto, '([[:upper:]][[:alpha:]]+(?: [[:upper:]][[:alpha:]]+)?)\s*\(([^()]{2,80})\)', 'g') LOOP
    v_nome := btrim(m[1]); v_cargo := btrim(m[2]);
    v_cargo := upper(left(v_cargo,1)) || substr(v_cargo,2);
    SELECT id INTO v_id FROM pessoas WHERE organizacao_id = _org
      AND lower(unaccent_simple(btrim(nome))) = lower(unaccent_simple(v_nome)) ORDER BY created_at LIMIT 1;
    IF v_id IS NULL THEN
      INSERT INTO pessoas (nome, cargo, organizacao_id, responsavel_id, e_decisor) VALUES (v_nome, v_cargo, _org, _resp, true);
    ELSE
      UPDATE pessoas SET e_decisor = true,
        cargo = CASE WHEN NULLIF(btrim(cargo),'') IS NULL THEN v_cargo ELSE cargo END WHERE id = v_id;
    END IF;
    v_id := NULL;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.fn_registrar_decisores(uuid,text,uuid) FROM PUBLIC, anon, authenticated;

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

-- Levantamento também ao vincular empresa a uma parada já visitada
CREATE OR REPLACE FUNCTION public.fn_paradas_levantamento() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.visitada IS TRUE AND NEW.organizacao_id IS NOT NULL THEN
    BEGIN
      IF TG_OP = 'INSERT' OR OLD.visitada IS DISTINCT FROM TRUE OR OLD.organizacao_id IS NULL THEN
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
CREATE TRIGGER trg_paradas_levantamento AFTER INSERT OR UPDATE OF visitada, relato, organizacao_id ON public.rota_paradas
FOR EACH ROW EXECUTE FUNCTION public.fn_paradas_levantamento();
REVOKE ALL ON FUNCTION public.fn_paradas_levantamento() FROM PUBLIC, anon, authenticated;

-- 4. Busca (service-only; visibilidade do vendedor da ligação)
CREATE OR REPLACE FUNCTION public.julia_buscar_organizacao(p_ligacao uuid, p_texto text, p_cidade text DEFAULT NULL, p_uf text DEFAULT NULL)
RETURNS TABLE(id uuid, nome text, cidade text, uf text, matriz_id uuid, matriz_nome text, similaridade real)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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
    AND (word_similarity(q, lower(unaccent_simple(coalesce(o.nome,'')||' '||coalesce(o.nome_fantasia,'')))) >= 0.4
         OR lower(unaccent_simple(coalesce(o.nome,'')||' '||coalesce(o.nome_fantasia,''))) LIKE '%'||q||'%')
  ORDER BY 7 DESC LIMIT 5;
END $$;
REVOKE ALL ON FUNCTION public.julia_buscar_organizacao(uuid,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.julia_buscar_organizacao(uuid,text,text,text) TO service_role;

-- 5. Vincular / criar (service-only, transacional)
CREATE OR REPLACE FUNCTION public.julia_vincular_organizacao(p_ligacao uuid, p_parada uuid, p_organizacao uuid DEFAULT NULL, p_criar jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l ligacoes_viagem; p rota_paradas; r rotas; v_org uuid; v_estado uuid; v_seg text; v_nome text; v_matriz uuid; v_criada boolean := false;
BEGIN
  SELECT * INTO l FROM ligacoes_viagem WHERE id = p_ligacao AND status IN ('discando','em_andamento');
  IF l.id IS NULL THEN RAISE EXCEPTION 'Ligação inválida ou encerrada.'; END IF;
  SELECT * INTO p FROM rota_paradas WHERE id = p_parada AND rota_id = l.rota_id FOR UPDATE;
  IF p.id IS NULL THEN RAISE EXCEPTION 'Parada não pertence a esta viagem.'; END IF;
  SELECT * INTO r FROM rotas WHERE id = p.rota_id;
  IF r.status <> 'aprovada' THEN RAISE EXCEPTION 'A viagem não está aprovada.'; END IF;
  IF p.tipo = 'pernoite' THEN RAISE EXCEPTION 'Pernoite não tem empresa.'; END IF;

  IF p_organizacao IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM organizacoes o WHERE o.id = p_organizacao
                   AND pode_ver_organizacao(r.vendedor_id, o.estado_id, o.responsavel_id)) THEN
      RAISE EXCEPTION 'Empresa não encontrada para este vendedor.'; END IF;
    v_org := p_organizacao;
    IF p.organizacao_id = v_org THEN
      RETURN jsonb_build_object('organizacao_id', v_org, 'ja_vinculada', true, 'criada', false,
        'nome', (SELECT coalesce(nome_fantasia, nome) FROM organizacoes WHERE id = v_org));
    END IF;
  ELSIF p_criar IS NOT NULL THEN
    v_nome := NULLIF(btrim(p_criar->>'nome'), '');
    IF v_nome IS NULL OR length(v_nome) > 200 THEN RAISE EXCEPTION 'Informe o nome da empresa.'; END IF;
    SELECT id INTO v_estado FROM estados WHERE sigla = upper(p_criar->>'uf');
    IF v_estado IS NULL THEN RAISE EXCEPTION 'Informe a UF da empresa.'; END IF;
    v_matriz := fn_uuid_seguro(p_criar->>'matriz_id');
    IF v_matriz IS NOT NULL AND NOT EXISTS (SELECT 1 FROM organizacoes o WHERE o.id = v_matriz
         AND pode_ver_organizacao(r.vendedor_id, o.estado_id, o.responsavel_id)) THEN
      RAISE EXCEPTION 'Matriz não encontrada para este vendedor.'; END IF;
    v_seg := CASE WHEN p_criar->>'segmento' IN ('COOPERATIVAS','MULTINACIONAIS','SEMENTEIRA PRIVADA','PRODUTOR RURAL','REVENDA')
                  THEN p_criar->>'segmento'
                  ELSE (SELECT segmento FROM organizacoes WHERE id = v_matriz) END;
    IF p.organizacao_id IS NOT NULL THEN RAISE EXCEPTION 'Esta parada já tem outra empresa; corrija pelo CRM.'; END IF;
    -- Mesma unidade criada antes nesta parada/ligação: reutiliza
    SELECT id INTO v_org FROM organizacoes WHERE lower(unaccent_simple(nome)) = lower(unaccent_simple(v_nome))
      AND estado_id = v_estado AND coalesce(matriz_id::text,'') = coalesce(v_matriz::text,'') LIMIT 1;
    IF v_org IS NULL THEN
      INSERT INTO organizacoes (nome, cidade, estado, estado_id, segmento, status, responsavel_id, tags, matriz_id)
      VALUES (v_nome, NULLIF(btrim(p_criar->>'cidade'),''), upper(p_criar->>'uf'), v_estado, v_seg, 'lead',
              r.vendedor_id, ARRAY['julia','incompleto'], v_matriz)
      RETURNING id INTO v_org;
      v_criada := true;
    END IF;
  ELSE
    RAISE EXCEPTION 'Informe a empresa existente ou os dados para criar.';
  END IF;

  IF p.organizacao_id IS NOT NULL THEN RAISE EXCEPTION 'Esta parada já tem outra empresa; corrija pelo CRM.'; END IF;
  UPDATE rota_paradas SET organizacao_id = v_org WHERE id = p.id;
  RETURN jsonb_build_object('organizacao_id', v_org, 'ja_vinculada', false, 'criada', v_criada,
    'nome', (SELECT coalesce(nome_fantasia, nome) FROM organizacoes WHERE id = v_org),
    'levantamento_id', (SELECT id FROM organizacao_levantamentos WHERE parada_id = p.id AND origem = 'visita_rota'));
END $$;
REVOKE ALL ON FUNCTION public.julia_vincular_organizacao(uuid,uuid,uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.julia_vincular_organizacao(uuid,uuid,uuid,jsonb) TO service_role;

-- 6. Notificações: vínculo com viagem e resolução automática
ALTER TABLE public.notificacoes ADD COLUMN IF NOT EXISTS rota_id uuid REFERENCES public.rotas(id) ON DELETE CASCADE;
ALTER TABLE public.notificacoes ADD COLUMN IF NOT EXISTS resolvida_em timestamptz;
CREATE INDEX IF NOT EXISTS notificacoes_rota_abertas_idx ON public.notificacoes(rota_id, user_id) WHERE resolvida_em IS NULL;
GRANT ALL ON public.notificacoes TO service_role;
CREATE OR REPLACE FUNCTION public.fn_notificacoes_usuario_so_lida() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF coalesce(auth.role(),'') = 'authenticated' AND ROW(NEW.user_id, NEW.chave, NEW.rota_id, NEW.resolvida_em, NEW.titulo, NEW.texto, NEW.link)
     IS DISTINCT FROM ROW(OLD.user_id, OLD.chave, OLD.rota_id, OLD.resolvida_em, OLD.titulo, OLD.texto, OLD.link) THEN
    RAISE EXCEPTION 'Só é possível marcar a notificação como lida.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_notificacoes_so_lida ON public.notificacoes;
CREATE TRIGGER trg_notificacoes_so_lida BEFORE UPDATE ON public.notificacoes
FOR EACH ROW EXECUTE FUNCTION public.fn_notificacoes_usuario_so_lida();

-- 7. Correção pontual: São Francisco – Patos de Minas (idempotente)
DO $$
DECLARE v_org uuid; v_mg uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM organizacoes WHERE id = 'f0f044ab-53c2-4b13-b0f9-5e526b2f36eb') THEN RETURN; END IF;
  SELECT id INTO v_mg FROM estados WHERE sigla = 'MG';
  SELECT id INTO v_org FROM organizacoes WHERE matriz_id = 'f0f044ab-53c2-4b13-b0f9-5e526b2f36eb'
    AND lower(unaccent_simple(coalesce(cidade,''))) = 'patos de minas' LIMIT 1;
  IF v_org IS NULL THEN
    INSERT INTO organizacoes (nome, cidade, estado, estado_id, segmento, status, responsavel_id, tags, matriz_id)
    VALUES ('Sementes São Francisco – Patos de Minas', 'Patos de Minas', 'MG', v_mg,
            (SELECT segmento FROM organizacoes WHERE id = 'f0f044ab-53c2-4b13-b0f9-5e526b2f36eb'),
            'lead', '14138b1c-5b33-4a66-b0f0-fc06e58da561', ARRAY['julia','incompleto'],
            'f0f044ab-53c2-4b13-b0f9-5e526b2f36eb')
    RETURNING id INTO v_org;
  END IF;
  UPDATE rota_paradas SET organizacao_id = v_org
   WHERE id = '36ed1829-6c24-459c-94ce-67706bdd0379' AND organizacao_id IS NULL;
END $$;
