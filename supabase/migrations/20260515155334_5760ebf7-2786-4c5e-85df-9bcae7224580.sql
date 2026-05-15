
CREATE TABLE IF NOT EXISTS public.migracao_clientes_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid,
  organizacao_id uuid,
  cliente_data jsonb,
  migrado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.migracao_clientes_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin vê migracao_clientes_log" ON public.migracao_clientes_log;
CREATE POLICY "Admin vê migracao_clientes_log"
  ON public.migracao_clientes_log
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

DO $$
DECLARE
  v_match_cnpj int := 0;
  v_match_nome int := 0;
  v_criados    int := 0;
  v_prop_upd   int := 0;
  v_ativ_upd   int := 0;
  v_pessoas_ins int := 0;
BEGIN
  CREATE TEMP TABLE mapa_cliente_org (cliente_id uuid PRIMARY KEY, organizacao_id uuid, origem text) ON COMMIT DROP;

  INSERT INTO mapa_cliente_org (cliente_id, organizacao_id, origem)
  SELECT DISTINCT ON (c.id) c.id, o.id, 'cnpj'
  FROM public.clientes c
  INNER JOIN public.organizacoes o ON o.cnpj = c.cnpj
  WHERE c.cnpj IS NOT NULL AND c.cnpj <> '';
  GET DIAGNOSTICS v_match_cnpj = ROW_COUNT;

  INSERT INTO mapa_cliente_org (cliente_id, organizacao_id, origem)
  SELECT DISTINCT ON (c.id) c.id, o.id, 'nome'
  FROM public.clientes c
  INNER JOIN public.organizacoes o ON UPPER(TRIM(o.nome)) = UPPER(TRIM(c.razao_social))
  WHERE c.id NOT IN (SELECT cliente_id FROM mapa_cliente_org)
  ON CONFLICT (cliente_id) DO NOTHING;
  GET DIAGNOSTICS v_match_nome = ROW_COUNT;

  WITH novos AS (
    INSERT INTO public.organizacoes (nome, nome_fantasia, cnpj, segmento, porte, regiao, status, observacoes, created_at)
    SELECT c.razao_social, c.nome_fantasia, c.cnpj, c.segmento, c.porte, c.regiao,
           CASE c.status WHEN 'lead' THEN 'lead' WHEN 'prospect' THEN 'prospect' WHEN 'ativo' THEN 'ativo' WHEN 'inativo' THEN 'inativo' ELSE 'lead' END,
           c.observacoes, c.created_at
    FROM public.clientes c
    WHERE c.id NOT IN (SELECT cliente_id FROM mapa_cliente_org)
    RETURNING id, cnpj, nome, created_at
  )
  INSERT INTO mapa_cliente_org (cliente_id, organizacao_id, origem)
  SELECT c.id, n.id, 'novo'
  FROM public.clientes c
  INNER JOIN novos n ON (
    (n.cnpj IS NOT NULL AND n.cnpj = c.cnpj)
    OR (n.cnpj IS NULL AND c.cnpj IS NULL AND UPPER(TRIM(n.nome)) = UPPER(TRIM(c.razao_social)) AND n.created_at = c.created_at)
  )
  WHERE c.id NOT IN (SELECT cliente_id FROM mapa_cliente_org)
  ON CONFLICT (cliente_id) DO NOTHING;
  GET DIAGNOSTICS v_criados = ROW_COUNT;

  UPDATE public.propostas SET organizacao_id = m.organizacao_id
  FROM mapa_cliente_org m
  WHERE propostas.cliente_id = m.cliente_id AND propostas.organizacao_id IS NULL;
  GET DIAGNOSTICS v_prop_upd = ROW_COUNT;

  UPDATE public.atividades SET organizacao_id = m.organizacao_id
  FROM mapa_cliente_org m
  WHERE atividades.cliente_id = m.cliente_id AND atividades.organizacao_id IS NULL;
  GET DIAGNOSTICS v_ativ_upd = ROW_COUNT;

  INSERT INTO public.pessoas (nome, organizacao_id, cargo, email, telefone, e_decisor, observacoes, created_at)
  SELECT ct.nome, m.organizacao_id, ct.cargo, ct.email, ct.telefone, ct.e_decisor, ct.observacoes, ct.created_at
  FROM public.contatos ct
  INNER JOIN mapa_cliente_org m ON m.cliente_id = ct.cliente_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.pessoas p
    WHERE p.organizacao_id = m.organizacao_id
      AND (
        (p.email IS NOT NULL AND p.email <> '' AND ct.email IS NOT NULL AND ct.email <> '' AND LOWER(p.email) = LOWER(ct.email))
        OR (UPPER(TRIM(p.nome)) = UPPER(TRIM(ct.nome)))
      )
  );
  GET DIAGNOSTICS v_pessoas_ins = ROW_COUNT;

  INSERT INTO public.migracao_clientes_log (cliente_id, organizacao_id, cliente_data)
  SELECT m.cliente_id, m.organizacao_id, to_jsonb(c.*)
  FROM mapa_cliente_org m
  INNER JOIN public.clientes c ON c.id = m.cliente_id
  WHERE NOT EXISTS (SELECT 1 FROM public.migracao_clientes_log l WHERE l.cliente_id = m.cliente_id);

  RAISE NOTICE 'Fase 3 OK: cnpj=%, nome=%, criados=%, prop=%, ativ=%, pessoas=%',
    v_match_cnpj, v_match_nome, v_criados, v_prop_upd, v_ativ_upd, v_pessoas_ins;
END $$;
