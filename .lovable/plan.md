# Visitas alimentam a Organização (histórico de levantamentos)

Nada é aplicado sem sua aprovação explícita do SQL. O SQL fica em `docs/sql/organizacao-levantamentos-proposta.sql`, testado num PostgreSQL descartável antes.

## Estado atual verificado
- `rota_paradas` já tem `visitada`, `resultado`, `relato jsonb`, `informada_em`, `dia` (BRT), `oportunidade_id`, `atividade_id`.
- Hoje existem **2** paradas visitadas com organização (o backfill pega as duas). Costa Beber: Arno/Diretor, 500.000 sacos, 3x LSB 150, interesse médio, sem próximo passo.
- Tipo de atividade "Visita" existe em `tipos_atividade`.
- Organizações são visíveis via `pode_ver_organizacao(...)`. Pessoas seguem a organização. Atividades só aparecem para o responsável, o admin ou o gerente.

## O que muda para o usuário
- Na Organização, uma nova aba **"Levantamento técnico"** com:
  - o cartão "Situação atual": sacos/safra, equipamento, decisores, interesse, concorrente, problema e última visita, cada um com "informado por X em DD/MM";
  - abaixo, a linha do tempo de todos os levantamentos, do mais recente para o mais antigo, com link para a viagem.
- Cada visita prestada (pela Júlia ou pela tela) gera automaticamente:
  - uma linha no histórico;
  - uma atividade concluída "Visita" na organização;
  - o contato cadastrado ou completado.
- O Diagnóstico técnico já abre com sacos/safra preenchido quando a organização tem esse dado. O valor continua editável.

## Plano por arquivo
- `docs/sql/organizacao-levantamentos-proposta.sql`: tabela, view, função, gatilho e backfill (completo abaixo).
- `src/lib/levantamentos.ts` (novo): tipos, consulta do histórico e da situação atual, e a função pura `resumoRelato()` (mesma lógica de texto do SQL, usada nos testes).
- `src/lib/levantamentos.test.ts`: testes do resumo e da formatação.
- `src/lib/levantamentosBanco.test.ts`: testes SQL num banco descartável. Casos:
  - inserir na visita;
  - idempotência;
  - não visitada não insere;
  - pessoa criada sem duplicar ("arno" = "Arno");
  - cargo completado e nunca sobrescrito;
  - atividade não duplicada;
  - vendedor não consegue alterar nem apagar;
  - a view devolve o último valor não nulo;
  - RLS por território.
- `src/components/organizacao/LevantamentoTecnico.tsx` (novo): cartão + linha do tempo. Antes de consultar, verifica se a tabela existe (padrão do projeto) e mostra "ainda não disponível" se não existir.
- `src/pages/OrganizacaoDetalhe.tsx`: nova aba "Levantamento técnico" depois de "Diagnóstico técnico".
- `src/pages/Diagnostico.tsx`: ao escolher a organização, busca `sacos_safra` atual e preenche só se o campo estiver vazio. Mostra a dica "da visita de DD/MM por X".
- `AGENTS.md`: regra "levantamentos são histórico imutável alimentado por gatilho; a situação atual é sempre derivada pela view".
- Sem mudança nas funções da Júlia: o gatilho cobre a voz e a tela.

## SQL completo (proposta)
```sql
-- 1. Tabela de histórico
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
  atividade_id uuid,          -- próximo passo (do relato)
  atividade_visita_id uuid,   -- atividade concluída "Visita"
  pessoa_id uuid,             -- contato vinculado
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS organizacao_levantamentos_parada_key
  ON public.organizacao_levantamentos(parada_id) WHERE parada_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS organizacao_levantamentos_org_idx
  ON public.organizacao_levantamentos(organizacao_id, data_visita DESC, created_at DESC);

GRANT SELECT ON public.organizacao_levantamentos TO authenticated;
GRANT UPDATE, DELETE ON public.organizacao_levantamentos TO authenticated; -- só admin via RLS
GRANT ALL ON public.organizacao_levantamentos TO service_role;
ALTER TABLE public.organizacao_levantamentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lev_select ON public.organizacao_levantamentos;
CREATE POLICY lev_select ON public.organizacao_levantamentos FOR SELECT TO authenticated
USING (is_approved(auth.uid()) AND EXISTS (
  SELECT 1 FROM public.organizacoes o
  WHERE o.id = organizacao_id AND pode_ver_organizacao(auth.uid(), o.estado_id, o.responsavel_id)));
DROP POLICY IF EXISTS lev_update_admin ON public.organizacao_levantamentos;
CREATE POLICY lev_update_admin ON public.organizacao_levantamentos FOR UPDATE TO authenticated
USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS lev_delete_admin ON public.organizacao_levantamentos;
CREATE POLICY lev_delete_admin ON public.organizacao_levantamentos FOR DELETE TO authenticated
USING (has_role(auth.uid(),'admin'));
-- Sem política de INSERT: só o gatilho (security definer) ou service_role inserem.

DROP TRIGGER IF EXISTS trg_lev_updated ON public.organizacao_levantamentos;
CREATE TRIGGER trg_lev_updated BEFORE UPDATE ON public.organizacao_levantamentos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Situação atual (último valor não nulo por campo)
CREATE OR REPLACE VIEW public.organizacao_situacao_atual WITH (security_invoker = true) AS
WITH l AS (SELECT * FROM public.organizacao_levantamentos)
SELECT o.id AS organizacao_id,
  (SELECT jsonb_build_object('valor', sacos_safra, 'data', data_visita, 'autor_id', autor_id) FROM l WHERE l.organizacao_id=o.id AND sacos_safra IS NOT NULL ORDER BY data_visita DESC, created_at DESC LIMIT 1) AS sacos_safra,
  (SELECT jsonb_build_object('valor', equipamento_atual, 'data', data_visita, 'autor_id', autor_id) FROM l WHERE l.organizacao_id=o.id AND equipamento_atual IS NOT NULL ORDER BY data_visita DESC, created_at DESC LIMIT 1) AS equipamento_atual,
  (SELECT jsonb_build_object('valor', decisores, 'data', data_visita, 'autor_id', autor_id) FROM l WHERE l.organizacao_id=o.id AND decisores IS NOT NULL ORDER BY data_visita DESC, created_at DESC LIMIT 1) AS decisores,
  (SELECT jsonb_build_object('valor', interesse, 'motivo', motivo_interesse, 'data', data_visita, 'autor_id', autor_id) FROM l WHERE l.organizacao_id=o.id AND interesse IS NOT NULL ORDER BY data_visita DESC, created_at DESC LIMIT 1) AS interesse,
  (SELECT jsonb_build_object('valor', concorrente, 'data', data_visita, 'autor_id', autor_id) FROM l WHERE l.organizacao_id=o.id AND concorrente IS NOT NULL ORDER BY data_visita DESC, created_at DESC LIMIT 1) AS concorrente,
  (SELECT jsonb_build_object('valor', problema_principal, 'data', data_visita, 'autor_id', autor_id) FROM l WHERE l.organizacao_id=o.id AND problema_principal IS NOT NULL ORDER BY data_visita DESC, created_at DESC LIMIT 1) AS problema_principal,
  (SELECT jsonb_build_object('data', data_visita, 'autor_id', autor_id, 'rota_id', rota_id) FROM l WHERE l.organizacao_id=o.id ORDER BY data_visita DESC, created_at DESC LIMIT 1) AS ultima_visita
FROM public.organizacoes o
WHERE EXISTS (SELECT 1 FROM l WHERE l.organizacao_id = o.id);
GRANT SELECT ON public.organizacao_situacao_atual TO authenticated;

-- 3. Função que registra o levantamento de uma parada (idempotente)
CREATE OR REPLACE FUNCTION public.fn_registrar_levantamento_parada(_parada uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p public.rota_paradas; r public.rotas; rel jsonb; v_id uuid; v_pessoa uuid;
  v_ativ uuid; v_data date; v_nome text; v_cargo text; v_resumo text;
BEGIN
  SELECT * INTO p FROM rota_paradas WHERE id = _parada;
  IF p.id IS NULL OR p.visitada IS NOT TRUE OR p.organizacao_id IS NULL THEN RETURN NULL; END IF;
  SELECT id INTO v_id FROM organizacao_levantamentos WHERE parada_id = _parada;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  SELECT * INTO r FROM rotas WHERE id = p.rota_id;
  rel := COALESCE(p.relato, '{}'::jsonb);
  v_data := COALESCE(p.dia, (COALESCE(p.informada_em, now()) AT TIME ZONE 'America/Sao_Paulo')::date);
  v_nome := NULLIF(btrim(rel->>'contato_nome'), '');
  v_cargo := NULLIF(btrim(rel->>'contato_cargo'), '');

  -- Contato: cria se não existe; completa cargo vazio; nunca sobrescreve
  IF v_nome IS NOT NULL THEN
    SELECT id INTO v_pessoa FROM pessoas
     WHERE organizacao_id = p.organizacao_id
       AND lower(unaccent_simple(btrim(nome))) = lower(unaccent_simple(v_nome))
     ORDER BY created_at LIMIT 1;
    IF v_pessoa IS NULL THEN
      INSERT INTO pessoas (nome, cargo, organizacao_id, responsavel_id)
      VALUES (v_nome, v_cargo, p.organizacao_id, r.vendedor_id) RETURNING id INTO v_pessoa;
    ELSIF v_cargo IS NOT NULL THEN
      UPDATE pessoas SET cargo = v_cargo WHERE id = v_pessoa AND NULLIF(btrim(cargo),'') IS NULL;
    END IF;
  END IF;

  -- Atividade concluída "Visita" (uma por parada)
  v_resumo := concat_ws(E'\n',
    p.resultado,
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

  INSERT INTO organizacao_levantamentos (organizacao_id, origem, rota_id, parada_id, oportunidade_id,
    autor_id, data_visita, resultado, contato_nome, contato_cargo, decisores, sacos_safra,
    equipamento_atual, problema_principal, interesse, motivo_interesse, objecoes, concorrente,
    proximo_passo, proximo_passo_data, atividade_id, atividade_visita_id, pessoa_id)
  VALUES (p.organizacao_id, 'visita_rota', p.rota_id, p.id, p.oportunidade_id, r.vendedor_id, v_data,
    p.resultado, v_nome, v_cargo, rel->>'decisores', (rel->>'sacos_safra')::numeric,
    rel->>'equipamento_atual', rel->>'problema_principal', rel->>'interesse', rel->>'motivo_interesse',
    CASE WHEN jsonb_typeof(rel->'objecoes')='array'
         THEN ARRAY(SELECT jsonb_array_elements_text(rel->'objecoes')) END,
    rel->>'concorrente', rel->>'proximo_passo', (rel->>'proximo_passo_data')::date,
    NULLIF(rel->>'atividade_id','')::uuid, v_ativ, v_pessoa)
  ON CONFLICT (parada_id) WHERE parada_id IS NOT NULL DO NOTHING
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.fn_registrar_levantamento_parada(uuid) FROM PUBLIC, anon, authenticated;

-- helper de normalização sem depender da extensão unaccent
CREATE OR REPLACE FUNCTION public.unaccent_simple(t text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT translate(t, 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
                      'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC') $$;
-- (no arquivo final, este helper vem ANTES da função acima)

-- 4. Gatilho em rota_paradas (AFTER, não interfere nas travas existentes)
CREATE OR REPLACE FUNCTION public.fn_paradas_levantamento() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.visitada IS TRUE AND NEW.organizacao_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.visitada IS DISTINCT FROM TRUE) THEN
    PERFORM fn_registrar_levantamento_parada(NEW.id);
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_paradas_levantamento ON public.rota_paradas;
CREATE TRIGGER trg_paradas_levantamento AFTER INSERT OR UPDATE OF visitada ON public.rota_paradas
FOR EACH ROW EXECUTE FUNCTION public.fn_paradas_levantamento();

-- 5. Backfill (idempotente)
SELECT public.fn_registrar_levantamento_parada(id)
FROM public.rota_paradas WHERE visitada IS TRUE AND organizacao_id IS NOT NULL;
```

## Impacto
- Paradas, viagens e a Júlia não mudam de comportamento. O gatilho roda depois da gravação e não dispara reaprovação.
- Se o gatilho falhar (por exemplo, `sacos_safra` com texto inválido), a prestação da visita falha junto. Para evitar isso, a função usa os valores já validados por `julia_validar_relato`. Um teste cobre esse caso.
- Backfill: 2 paradas viram 2 levantamentos, 2 atividades "Visita" e no máximo 2 pessoas (Arno/Diretor na Costa Beber, se ainda não existir).
- Atividades continuam visíveis só para o responsável (o vendedor), o admin e o gerente, pela regra atual. O histórico segue a visibilidade da organização.

## Perguntas
1. **Relato completado pelo admin depois da visita:** gerar uma nova linha `manual` no histórico (proposta: sim, preserva o histórico) ou corrigir a linha existente?
2. **Atividade "Visita":** fica sempre separada da atividade de próximo passo (`atividade_id`, tarefa futura). Na parada já existe uma atividade planejada (`rota_paradas.atividade_id`, a da Costa Beber). Proposta: criar a atividade concluída nova e deixar a planejada como está. Ou prefere **concluir a planejada** em vez de criar outra?
3. **Pessoa criada:** responsável = vendedor da viagem e `e_decisor` desligado. Quer `e_decisor = true` quando o cargo for diretor/proprietário/sócio?
4. **Nome da tabela:** `organizacao_levantamentos` está bom?
