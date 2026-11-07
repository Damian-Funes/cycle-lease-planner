-- PROPOSTA (aplicar só após aprovação): contatos da Júlia sem duplicar pessoas.
-- 1) Nome aproximado: exato > primeiro nome igual (único) > primeiro nome com 1 letra de diferença (5+ letras, único).
--    Ambíguo nunca cria. Ex.: "Marcello" → Marcelo Guerra; "Marcos" NÃO casa com Marcelo.
-- 2) Trava de confirmação: nas gravações da Júlia (registrar_visita / registrar_contato_cliente), nome que não casa
--    com ninguém só vira pessoa nova com contato_novo_confirmado=true. Sem isso, grava visita/contato/próximo passo,
--    deixa o nome só no texto/histórico e devolve o casamento em contatos_resolvidos para a Júlia perguntar.
-- 3) julia_completar_contato: depois da confirmação, liga a um contato existente ou cria o novo, e preenche a pessoa
--    nos levantamentos/atividades gravados NESTA ligação.
-- Fora da Júlia (app), nada muda: o levantamento continua criando o contato como hoje.
-- Espelho em supabase/functions/_shared/contatosOrg.ts (casarContato / edicaoAte1 / respostaContatos).

CREATE OR REPLACE FUNCTION public.fn_nome_normalizado(t text)
RETURNS text LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT regexp_replace(btrim(regexp_replace(lower(unaccent_simple(coalesce(t,''))), '[^a-z ]', ' ', 'g')), '\s+', ' ', 'g')
$$;

-- Distância de edição ≤ 1 (função própria; não precisa instalar fuzzystrmatch).
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

-- Casamento com o tipo: exata | primeiro_nome | aproximado | ambigua | nova.
CREATE OR REPLACE FUNCTION public.fn_casar_pessoa_org_detalhe(_org uuid, _nome text, OUT pessoa_id uuid, OUT ambigua boolean, OUT tipo text)
RETURNS record LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE alvo text := fn_nome_normalizado(_nome); p1 text; p2 text; n int;
BEGIN
  ambigua := false; tipo := 'nova';
  IF _org IS NULL OR alvo = '' THEN RETURN; END IF;
  SELECT id INTO pessoa_id FROM pessoas WHERE organizacao_id = _org AND fn_nome_normalizado(nome) = alvo ORDER BY created_at LIMIT 1;
  IF pessoa_id IS NOT NULL THEN tipo := 'exata'; RETURN; END IF;
  p1 := split_part(alvo, ' ', 1); p2 := nullif(split_part(alvo, ' ', 2), '');
  -- Primeiro nome igual (sobrenomes ditos dos dois lados e diferentes = outra pessoa).
  WITH c AS (SELECT id, created_at, regexp_split_to_array(fn_nome_normalizado(nome), ' ') t
             FROM pessoas WHERE organizacao_id = _org AND length(btrim(nome)) >= 3)
  SELECT count(*), (array_agg(id ORDER BY created_at))[1] INTO n, pessoa_id FROM c
   WHERE t[1] = p1 AND NOT (p2 IS NOT NULL AND t[2] IS NOT NULL AND t[2] <> p2);
  IF n > 1 THEN pessoa_id := NULL; ambigua := true; tipo := 'ambigua'; RETURN; END IF;
  IF n = 1 THEN tipo := 'primeiro_nome'; RETURN; END IF;
  -- Aproximado: 5+ letras, 1 letra de diferença, só se único.
  IF length(p1) < 5 THEN RETURN; END IF;
  WITH c AS (SELECT id, created_at, regexp_split_to_array(fn_nome_normalizado(nome), ' ') t
             FROM pessoas WHERE organizacao_id = _org AND length(btrim(nome)) >= 3)
  SELECT count(*), (array_agg(id ORDER BY created_at))[1] INTO n, pessoa_id FROM c
   WHERE length(t[1]) >= 5 AND fn_edicao_ate_1(t[1], p1) AND NOT (p2 IS NOT NULL AND t[2] IS NOT NULL AND t[2] <> p2);
  IF n > 1 THEN pessoa_id := NULL; ambigua := true; tipo := 'ambigua'; RETURN; END IF;
  IF n = 1 THEN tipo := 'aproximado'; END IF;
END $$;

-- Mesma assinatura de antes (quem já chama continua igual).
CREATE OR REPLACE FUNCTION public.fn_casar_pessoa_org(_org uuid, _nome text, OUT pessoa_id uuid, OUT ambigua boolean)
RETURNS record LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT d.pessoa_id, d.ambigua FROM fn_casar_pessoa_org_detalhe(_org, _nome) d
$$;

-- Resolve um nome falado: reaproveita, cria (só se _criar) ou deixa pendente. Devolve o que aconteceu.
-- tipo: exata | primeiro_nome | aproximado | ambigua | pendente | criada
CREATE OR REPLACE FUNCTION public.fn_resolver_contato_org(_org uuid, _nome text, _cargo text, _decisor boolean, _resp uuid, _criar boolean, _papel text DEFAULT 'contato')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c record; v_id uuid; v_tipo text; v_nome text := nullif(btrim(_nome), ''); v_cargo text := nullif(btrim(_cargo), '');
BEGIN
  IF _org IS NULL OR v_nome IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO c FROM fn_casar_pessoa_org_detalhe(_org, v_nome);
  IF c.ambigua THEN v_tipo := 'ambigua';
  ELSIF c.pessoa_id IS NOT NULL THEN
    v_id := c.pessoa_id; v_tipo := c.tipo;
    UPDATE pessoas SET
      cargo = CASE WHEN nullif(btrim(cargo), '') IS NULL AND v_cargo IS NOT NULL THEN v_cargo ELSE cargo END,
      e_decisor = coalesce(e_decisor, false) OR coalesce(_decisor, false)
    WHERE id = v_id;
  ELSIF coalesce(_criar, true) THEN
    INSERT INTO pessoas (nome, cargo, organizacao_id, responsavel_id, e_decisor)
    VALUES (v_nome, v_cargo, _org, _resp, coalesce(_decisor, false)) RETURNING id INTO v_id;
    v_tipo := 'criada';
  ELSE v_tipo := 'pendente';
  END IF;
  RETURN jsonb_build_object('nome_falado', v_nome, 'cargo_falado', v_cargo, 'papel', coalesce(_papel, 'contato'),
    'tipo', v_tipo, 'pessoa_id', v_id, 'pessoa_nome', (SELECT nome FROM pessoas WHERE id = v_id));
END $$;

-- Decisores "Nome (cargo)" com o resultado de cada um.
CREATE OR REPLACE FUNCTION public.fn_registrar_decisores_detalhe(_org uuid, _texto text, _resp uuid, _criar boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m text[]; v_cargo text; res jsonb := '[]'::jsonb;
BEGIN
  IF _org IS NULL OR _texto IS NULL THEN RETURN res; END IF;
  FOR m IN SELECT regexp_matches(_texto, '([[:upper:]][[:alpha:]]+(?: [[:upper:]][[:alpha:]]+)?)\s*\(([^()]{2,80})\)', 'g') LOOP
    v_cargo := btrim(m[2]); v_cargo := upper(left(v_cargo, 1)) || substr(v_cargo, 2);
    res := res || jsonb_build_array(fn_resolver_contato_org(_org, btrim(m[1]), v_cargo, true, _resp, _criar, 'decisor'));
  END LOOP;
  RETURN res;
END $$;

-- Mesmo comportamento de antes para quem chama sem a Júlia (cria quando não casa).
CREATE OR REPLACE FUNCTION public.fn_registrar_decisores(_org uuid, _texto text, _resp uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM fn_registrar_decisores_detalhe(_org, _texto, _resp, true);
END $$;

-- Levantamento da parada: na gravação da Júlia (julia.contato_novo_confirmado definido), nome sem casamento só vira
-- pessoa com confirmação; o resultado volta em julia.contatos. Fora da Júlia, igual a antes.
CREATE OR REPLACE FUNCTION public.fn_registrar_levantamento_parada(_parada uuid, _origem text DEFAULT 'visita_rota'::text, _autor uuid DEFAULT NULL::uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p public.rota_paradas; r public.rotas; rel jsonb; v_id uuid; v_pessoa uuid; v_res jsonb;
  v_ativ uuid; v_data date; v_nome text; v_cargo text; v_dec text; v_resumo text; v_decisor boolean;
  v_flag text := current_setting('julia.contato_novo_confirmado', true);
  v_criar boolean := coalesce(current_setting('julia.contato_novo_confirmado', true), '') <> 'false';
  v_contatos jsonb := '[]'::jsonb;
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
    v_res := fn_resolver_contato_org(p.organizacao_id, v_nome, v_cargo, v_decisor, r.vendedor_id, v_criar, 'contato');
    v_pessoa := (v_res->>'pessoa_id')::uuid;
    v_contatos := v_contatos || jsonb_build_array(v_res);
  END IF;
  v_contatos := v_contatos || fn_registrar_decisores_detalhe(p.organizacao_id, v_dec, r.vendedor_id, v_criar);
  IF v_flag IN ('true', 'false') THEN PERFORM set_config('julia.contatos', v_contatos::text, true); END IF;

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
END $$;

-- Visita pela Júlia: passa a confirmação ao levantamento e devolve contatos_resolvidos.
CREATE OR REPLACE FUNCTION public.julia_registrar_voz(p_ligacao uuid, p_rota uuid, p_acao text, p_dados jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
DECLARE l public.ligacoes_viagem; r public.rotas; p public.rota_paradas; g uuid; texto text; anterior text:=current_setting('request.jwt.claim.sub',true); n date; v_relato jsonb; atividade uuid; tipo_tarefa uuid; quando timestamptz; v_contatos jsonb;
BEGIN
 SELECT * INTO l FROM public.ligacoes_viagem WHERE id=p_ligacao AND rota_id=p_rota FOR UPDATE;
 IF NOT FOUND OR l.status NOT IN ('discando','em_andamento') OR l.data_ref<>(now() AT TIME ZONE 'America/Sao_Paulo')::date THEN RAISE EXCEPTION 'Ligação não está ativa nesta viagem e data.'; END IF;
 SELECT * INTO r FROM public.rotas WHERE id=p_rota FOR UPDATE;
 IF r.vendedor_id<>l.vendedor_id OR r.status<>'aprovada' OR NOT public.fn_pode_escrever_diario(l.vendedor_id,r.id) THEN RAISE EXCEPTION 'Viagem não permite registro.'; END IF;
 PERFORM set_config('request.jwt.claim.sub',l.vendedor_id::text,true);
 IF p_acao='registrar_visita' THEN
  SELECT * INTO p FROM public.rota_paradas WHERE id=(p_dados->>'parada_id')::uuid AND rota_id=r.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Parada não pertence à viagem.'; END IF;
  IF p.visitada IS NOT NULL THEN RAISE EXCEPTION 'Parada já informada; corrija pelo CRM.'; END IF;
  texto:=nullif(btrim(CASE WHEN (p_dados->>'visitada')::boolean THEN p_dados->>'resultado' ELSE p_dados->>'motivo' END),'');
  IF texto IS NULL OR length(texto)>4500 THEN RAISE EXCEPTION 'Informe resultado ou motivo válido.'; END IF;
  SELECT coalesce(jsonb_object_agg(key,value),'{}'::jsonb) INTO v_relato FROM jsonb_each(p_dados) WHERE key IN ('contato_nome','contato_cargo','decisores','sacos_safra','equipamento_atual','problema_principal','interesse','motivo_interesse','objecoes','concorrente','proximo_passo','proximo_passo_data');
  PERFORM public.julia_validar_relato(v_relato);
  IF NOT (p_dados->>'visitada')::boolean AND v_relato<>'{}'::jsonb THEN RAISE EXCEPTION 'Relato detalhado somente para visita realizada.'; END IF;
  IF (p_dados->>'visitada')::boolean AND v_relato ? 'proximo_passo' AND v_relato ? 'proximo_passo_data' AND p.organizacao_id IS NOT NULL THEN
   SELECT id INTO tipo_tarefa FROM public.tipos_atividade WHERE ativo AND lower(nome)='tarefa' ORDER BY ordem,id LIMIT 1;
   IF tipo_tarefa IS NULL THEN RAISE EXCEPTION 'Tipo Tarefa não está disponível na agenda.'; END IF;
   quando:=((v_relato->>'proximo_passo_data')::date+time '09:00') AT TIME ZONE 'America/Sao_Paulo';
   INSERT INTO public.atividades(tipo,tipo_id,titulo,descricao,conteudo,data_atividade,data_inicio,responsavel_id,organizacao_id,oportunidade_id,concluida,evento_automatico)
    VALUES('tarefa',tipo_tarefa,'Próximo passo: '||(v_relato->>'proximo_passo'),'Combinado na visita — '||texto,'Combinado na visita — '||texto,quando,quando,l.vendedor_id,p.organizacao_id,p.oportunidade_id,false,false) RETURNING id INTO atividade;
   v_relato:=v_relato||jsonb_build_object('atividade_id',atividade);
  END IF;
  -- Contato novo só com confirmação explícita; o gatilho de levantamento lê isto e devolve o casamento em julia.contatos.
  PERFORM set_config('julia.contato_novo_confirmado', CASE WHEN p_dados->>'contato_novo_confirmado' = 'true' THEN 'true' ELSE 'false' END, true);
  PERFORM set_config('julia.contatos', '', true);
  UPDATE public.rota_paradas SET visitada=(p_dados->>'visitada')::boolean,resultado=CASE WHEN (p_dados->>'visitada')::boolean THEN texto END,motivo_nao_visita=CASE WHEN NOT (p_dados->>'visitada')::boolean THEN texto END,relato=nullif(v_relato,'{}'::jsonb) WHERE id=p.id;
  IF (p_dados->>'visitada')::boolean AND p.atividade_id IS NOT NULL THEN
   UPDATE public.atividades SET concluida=true,data_conclusao=now(),resultado=texto WHERE id=p.atividade_id;
  END IF;
  v_contatos := nullif(current_setting('julia.contatos', true), '')::jsonb;
  PERFORM set_config('julia.contato_novo_confirmado', '', true);
  PERFORM set_config('julia.contatos', '', true);
  INSERT INTO public.rota_diario(rota_id,parada_id,organizacao_id,autor_id,texto) VALUES(r.id,p.id,p.organizacao_id,l.vendedor_id,'Júlia — '||texto);
 ELSIF p_acao='registrar_pernoite' THEN
  n:=l.data_ref;
  IF n>=r.data_fim THEN RAISE EXCEPTION 'Último dia: não há pernoite a registrar.'; END IF;
  IF p_dados->>'tipo'='hotel' THEN
   INSERT INTO public.rota_gastos(rota_id,categoria,valor,data,descricao,autor_id) VALUES(r.id,'hotel',(p_dados->>'valor')::numeric,n,'Hotel '||(p_dados->>'hotel_nome'),l.vendedor_id) RETURNING id INTO g;
  END IF;
  INSERT INTO public.rota_pernoites(rota_id,noite,tipo,cidade,estado,hotel_nome,gasto_id,observacao,autor_id)
   VALUES(r.id,n,p_dados->>'tipo',p_dados->>'cidade',p_dados->>'uf',p_dados->>'hotel_nome',g,p_dados->>'observacao',l.vendedor_id);
 ELSE RAISE EXCEPTION 'Ferramenta desconhecida.';
 END IF;
 PERFORM set_config('request.jwt.claim.sub',coalesce(anterior,''),true);
 RETURN jsonb_build_object('ok',true,'gasto_id',g,'atividade_id',atividade,'contatos_resolvidos',coalesce(v_contatos,'[]'::jsonb));
END $fn$;

-- Contato com cliente (modo livre): pessoa nova só com contato_novo_confirmado=true.
CREATE OR REPLACE FUNCTION public.julia_registrar_contato(p_ligacao uuid, p_org uuid, p_dados jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l public.ligacoes_viagem; o public.organizacoes; v_pessoa uuid; v_ativ uuid; v_prox uuid; v_r jsonb;
  v_canal text := coalesce(p_dados->>'canal','outro'); v_tipo text; v_tipo_id uuid;
  v_nome text := nullif(btrim(p_dados->>'contato_nome'),''); v_cargo text := nullif(btrim(p_dados->>'contato_cargo'),'');
  v_dec text := nullif(btrim(p_dados->>'decisores'),''); v_res text := nullif(btrim(p_dados->>'resultado'),'');
  v_pp text := nullif(btrim(p_dados->>'proximo_passo'),''); v_ppd date := fn_data_segura(p_dados->>'proximo_passo_data');
  v_criar boolean := coalesce(p_dados->>'contato_novo_confirmado','') = 'true';
  v_resumo text; quando timestamptz; v_amb boolean := false; v_opp uuid; v_contatos jsonb := '[]'::jsonb;
BEGIN
  l := julia_ligacao_ativa(p_ligacao);
  SELECT * INTO o FROM organizacoes WHERE id = p_org;
  IF o.id IS NULL OR o.descartada_em IS NOT NULL OR NOT pode_ver_organizacao(l.vendedor_id, o.estado_id, o.responsavel_id) THEN
    RAISE EXCEPTION 'Organização não encontrada para este vendedor.'; END IF;
  IF v_res IS NULL OR length(v_res) < 10 THEN RAISE EXCEPTION 'Descreva o resultado do contato (mínimo 10 caracteres).'; END IF;
  IF v_canal NOT IN ('telefone','whatsapp','visita','email','outro') THEN RAISE EXCEPTION 'Canal inválido.'; END IF;
  v_tipo := CASE v_canal WHEN 'telefone' THEN 'Ligação' WHEN 'whatsapp' THEN 'WhatsApp' WHEN 'visita' THEN 'Visita' WHEN 'email' THEN 'Email' ELSE 'Nota' END;
  SELECT id INTO v_tipo_id FROM tipos_atividade WHERE nome = v_tipo LIMIT 1;
  SELECT id INTO v_opp FROM oportunidades WHERE organizacao_id = p_org AND status = 'aberta' AND responsavel_id = l.vendedor_id ORDER BY created_at DESC LIMIT 1;
  IF v_nome IS NOT NULL THEN
    v_r := fn_resolver_contato_org(p_org, v_nome, v_cargo, false, l.vendedor_id, v_criar, 'contato');
    v_pessoa := (v_r->>'pessoa_id')::uuid; v_amb := v_r->>'tipo' = 'ambigua';
    v_contatos := v_contatos || jsonb_build_array(v_r);
  END IF;
  v_contatos := v_contatos || fn_registrar_decisores_detalhe(p_org, v_dec, l.vendedor_id, v_criar);
  v_resumo := concat_ws(E'\n', v_res,
    CASE WHEN v_nome IS NOT NULL THEN 'Contato: '||v_nome||coalesce(' ('||v_cargo||')','') END,
    CASE WHEN p_dados ? 'sacos_safra' THEN 'Sacos/safra: '||(p_dados->>'sacos_safra') END,
    CASE WHEN p_dados ? 'equipamento_atual' THEN 'Equipamento: '||(p_dados->>'equipamento_atual') END,
    CASE WHEN p_dados ? 'interesse' THEN 'Interesse: '||(p_dados->>'interesse') END,
    CASE WHEN p_dados ? 'concorrente' THEN 'Concorrente: '||(p_dados->>'concorrente') END,
    CASE WHEN v_pp IS NOT NULL THEN 'Próximo passo: '||v_pp END);
  INSERT INTO atividades (tipo, tipo_id, titulo, descricao, resultado, concluida, situacao, data_conclusao, data_atividade, data_inicio,
    organizacao_id, oportunidade_id, pessoa_id, responsavel_id, evento_automatico)
  VALUES (lower(v_tipo), v_tipo_id, v_tipo||' com cliente (via Júlia)', v_resumo, v_res||' (via Júlia)', true, 'concluida', now(), now(), now(),
    p_org, v_opp, v_pessoa, l.vendedor_id, true) RETURNING id INTO v_ativ;
  IF v_ppd IS NOT NULL AND v_ppd >= fn_rota_hoje_brt() THEN
    v_pp := coalesce(v_pp, '(sem descrição)');
    quando := (v_ppd + time '09:00') AT TIME ZONE 'America/Sao_Paulo';
    INSERT INTO atividades (tipo, tipo_id, titulo, descricao, data_atividade, data_inicio, responsavel_id, organizacao_id, oportunidade_id, pessoa_id, concluida, evento_automatico)
    VALUES ('tarefa', (SELECT id FROM tipos_atividade WHERE nome='Tarefa' LIMIT 1), 'Próximo passo: '||v_pp, 'Combinado em contato ('||v_canal||') — via Júlia',
      quando, quando, l.vendedor_id, p_org, v_opp, v_pessoa, false, false) RETURNING id INTO v_prox;
  END IF;
  INSERT INTO organizacao_levantamentos (organizacao_id, origem, autor_id, data_visita, resultado, contato_nome, contato_cargo, decisores,
    sacos_safra, equipamento_atual, problema_principal, interesse, motivo_interesse, objecoes, concorrente, proximo_passo, proximo_passo_data,
    atividade_id, atividade_visita_id, pessoa_id, oportunidade_id)
  VALUES (p_org, 'julia', l.vendedor_id, fn_rota_hoje_brt(), v_res, v_nome, v_cargo, v_dec, fn_num_seguro(p_dados->>'sacos_safra'),
    nullif(btrim(p_dados->>'equipamento_atual'),''), nullif(btrim(p_dados->>'problema_principal'),''),
    CASE WHEN p_dados->>'interesse' IN ('alto','medio','baixo') THEN p_dados->>'interesse' END, nullif(btrim(p_dados->>'motivo_interesse'),''),
    CASE WHEN jsonb_typeof(p_dados->'objecoes')='array' THEN ARRAY(SELECT jsonb_array_elements_text(p_dados->'objecoes')) END,
    nullif(btrim(p_dados->>'concorrente'),''), v_pp, v_ppd, v_prox, v_ativ, v_pessoa, v_opp);
  RETURN jsonb_build_object('atividade_id', v_ativ, 'proximo_passo_atividade_id', v_prox, 'pessoa_id', v_pessoa,
    'empresa', coalesce(o.nome_fantasia, o.nome), 'contato_ambiguo', v_amb, 'contatos_resolvidos', v_contatos);
END $$;

-- Depois da confirmação em voz: liga ao contato existente OU cria o novo (contato_novo_confirmado=true),
-- e preenche a pessoa nos levantamentos/atividades gravados NESTA ligação para essa empresa e esse nome.
-- papel='decisor' só marca/cria o decisor (não troca a pessoa da visita).
CREATE OR REPLACE FUNCTION public.julia_completar_contato(p_ligacao uuid, p_org uuid, p_dados jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l public.ligacoes_viagem; o public.organizacoes; c record; pe public.pessoas; v_pessoa uuid; v_criada boolean := false;
  v_falado text := nullif(btrim(p_dados->>'nome_falado'),'');
  v_exist text := nullif(btrim(p_dados->>'contato_existente'),'');
  v_novo boolean := coalesce(p_dados->>'contato_novo_confirmado','') = 'true';
  v_nome text; v_cargo text := nullif(btrim(p_dados->>'contato_cargo'),'');
  v_tel text := nullif(btrim(p_dados->>'contato_telefone'),'');
  v_dig text; v_papel text := coalesce(nullif(btrim(p_dados->>'papel'),''), 'contato');
  v_decisor boolean; ids uuid[]; v_lev int := 0; v_ativ int := 0; avisos text[] := '{}';
BEGIN
  l := julia_ligacao_ativa(p_ligacao);
  SELECT * INTO o FROM organizacoes WHERE id = p_org;
  IF o.id IS NULL OR o.descartada_em IS NOT NULL OR NOT pode_ver_organizacao(l.vendedor_id, o.estado_id, o.responsavel_id) THEN
    RAISE EXCEPTION 'Organização não encontrada para este vendedor.'; END IF;
  IF v_falado IS NULL THEN RAISE EXCEPTION 'Informe o nome falado (nome_falado).'; END IF;
  IF v_papel NOT IN ('contato','decisor') THEN RAISE EXCEPTION 'Papel inválido: use contato ou decisor.'; END IF;
  v_decisor := v_papel = 'decisor' OR coalesce(p_dados->>'decisor','') = 'true';
  IF v_exist IS NOT NULL AND v_novo THEN
    RAISE EXCEPTION 'Escolha um: contato já cadastrado (contato_existente) ou pessoa nova (contato_novo_confirmado), não os dois.'; END IF;
  IF v_exist IS NULL AND NOT v_novo THEN
    RAISE EXCEPTION 'Diga qual contato já cadastrado foi (contato_existente) ou confirme que é pessoa nova (contato_novo_confirmado=true).'; END IF;
  IF v_tel IS NOT NULL AND NOT fn_tel_valido(v_tel) THEN RAISE EXCEPTION 'Telefone incompleto: diga com DDD.'; END IF;
  v_dig := nullif(regexp_replace(coalesce(v_tel,''), '\D', '', 'g'), '');

  IF v_exist IS NOT NULL THEN
    SELECT * INTO c FROM fn_casar_pessoa_org_detalhe(p_org, v_exist);
    IF c.ambigua THEN RAISE EXCEPTION 'Mais de um contato com esse nome; diga o nome completo como está cadastrado.'; END IF;
    IF c.pessoa_id IS NULL THEN RAISE EXCEPTION 'Não achei esse contato na empresa; diga o nome como está cadastrado ou confirme que é pessoa nova.'; END IF;
    v_pessoa := c.pessoa_id;
  ELSE
    v_nome := coalesce(nullif(btrim(p_dados->>'contato_nome'),''), v_falado);
    IF length(fn_nome_normalizado(v_nome)) < 3 THEN RAISE EXCEPTION 'Informe o nome do contato (pelo menos 3 letras).'; END IF;
    SELECT * INTO c FROM fn_casar_pessoa_org_detalhe(p_org, v_nome);
    IF c.tipo = 'exata' THEN
      v_pessoa := c.pessoa_id; avisos := array_append(avisos, 'Esse nome já estava cadastrado; usei o contato existente.');
    ELSE
      INSERT INTO pessoas (nome, cargo, telefone, organizacao_id, responsavel_id, e_decisor, observacoes)
      VALUES (v_nome, v_cargo, v_tel, p_org, l.vendedor_id, v_decisor,
              'Informado pela Júlia em '||to_char(fn_rota_hoje_brt(),'DD/MM/YYYY')) RETURNING id INTO v_pessoa;
      v_criada := true;
    END IF;
  END IF;

  IF NOT v_criada THEN
    SELECT * INTO pe FROM pessoas WHERE id = v_pessoa;
    UPDATE pessoas SET
      cargo = CASE WHEN nullif(btrim(cargo),'') IS NULL AND v_cargo IS NOT NULL THEN v_cargo ELSE cargo END,
      e_decisor = coalesce(e_decisor, false) OR v_decisor
    WHERE id = v_pessoa;
    IF v_dig IS NOT NULL AND v_dig NOT IN (regexp_replace(coalesce(pe.telefone,''),'\D','','g'), regexp_replace(coalesce(pe.celular,''),'\D','','g')) THEN
      IF nullif(btrim(pe.celular),'') IS NULL THEN UPDATE pessoas SET celular = v_tel WHERE id = v_pessoa;
      ELSIF nullif(btrim(pe.telefone),'') IS NULL THEN UPDATE pessoas SET telefone = v_tel WHERE id = v_pessoa;
      ELSE avisos := array_append(avisos, 'O contato já tem dois telefones; não troquei. Corrija pelo CRM se for o caso.');
      END IF;
    END IF;
  END IF;

  IF v_papel = 'contato' THEN
    -- Registros desta ligação (mesmo vendedor, empresa, desde o início da ligação) com esse nome falado.
    SELECT array_agg(id) INTO ids FROM organizacao_levantamentos
     WHERE organizacao_id = p_org AND autor_id = l.vendedor_id AND created_at >= l.created_at
       AND contato_nome IS NOT NULL AND fn_nome_normalizado(contato_nome) = fn_nome_normalizado(v_falado);
    IF ids IS NULL THEN  -- nome dito diferente: só se houver um único registro sem pessoa nesta ligação
      SELECT CASE WHEN count(*) = 1 THEN array_agg(id) END INTO ids FROM organizacao_levantamentos
       WHERE organizacao_id = p_org AND autor_id = l.vendedor_id AND created_at >= l.created_at
         AND contato_nome IS NOT NULL AND pessoa_id IS NULL;
    END IF;
    IF ids IS NOT NULL THEN
      UPDATE atividades a SET pessoa_id = v_pessoa FROM organizacao_levantamentos lv
       WHERE lv.id = ANY(ids) AND a.id IN (lv.atividade_id, lv.atividade_visita_id)
         AND (a.pessoa_id IS NULL OR a.pessoa_id = lv.pessoa_id) AND a.pessoa_id IS DISTINCT FROM v_pessoa;
      GET DIAGNOSTICS v_ativ = ROW_COUNT;
      UPDATE organizacao_levantamentos SET pessoa_id = v_pessoa WHERE id = ANY(ids) AND pessoa_id IS DISTINCT FROM v_pessoa;
      GET DIAGNOSTICS v_lev = ROW_COUNT;
    ELSE
      avisos := array_append(avisos, 'Não achei visita ou contato desta ligação com esse nome; o contato ficou só no cadastro da empresa.');
    END IF;
  END IF;

  RETURN jsonb_build_object('pessoa_id', v_pessoa, 'pessoa_nome', (SELECT nome FROM pessoas WHERE id = v_pessoa),
    'criada', v_criada, 'papel', v_papel, 'empresa', coalesce(o.nome_fantasia, o.nome),
    'levantamentos_vinculados', v_lev, 'atividades_vinculadas', v_ativ, 'avisos', avisos);
END $$;

-- Só o servidor (funções da Júlia) chama estas funções.
REVOKE ALL ON FUNCTION public.fn_casar_pessoa_org_detalhe(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_casar_pessoa_org(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_resolver_contato_org(uuid, text, text, boolean, uuid, boolean, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_registrar_decisores_detalhe(uuid, text, uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_registrar_decisores(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_registrar_levantamento_parada(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.julia_registrar_voz(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.julia_registrar_contato(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.julia_completar_contato(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_casar_pessoa_org_detalhe(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_casar_pessoa_org(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_resolver_contato_org(uuid, text, text, boolean, uuid, boolean, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_registrar_decisores_detalhe(uuid, text, uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_registrar_decisores(uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_registrar_levantamento_parada(uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.julia_registrar_voz(uuid, uuid, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.julia_registrar_contato(uuid, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.julia_completar_contato(uuid, uuid, jsonb) TO service_role;

-- Conferência pós-aplicação (Cocari a209f1d7…):
-- SELECT n, d.* FROM organizacoes o, unnest(ARRAY['Marcello','Isaías','Gilberto','Marcos','Marcelo']) n,
--   LATERAL fn_casar_pessoa_org_detalhe(o.id, n) d WHERE o.id::text LIKE 'a209f1d7%';
-- Esperado: Marcello→Marcelo Guerra (aproximado); Isaías→Isaias Rodigues (primeiro_nome); Gilberto (exata); Marcos (nova); Marcelo (primeiro_nome).
