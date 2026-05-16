
-- =====================================================================
-- PR1: Apertar RLS das tabelas core + Views sem valores para Marketing
-- =====================================================================

-- 1) Helper: pode_ver_oportunidade
CREATE OR REPLACE FUNCTION public.pode_ver_oportunidade(_user_id uuid, _opp_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.oportunidades o
    LEFT JOIN public.organizacoes org ON org.id = o.organizacao_id
    WHERE o.id = _opp_id
      AND (
        public.has_role(_user_id, 'admin')
        OR o.responsavel_id = _user_id
        OR (org.id IS NOT NULL AND public.pode_ver_organizacao(_user_id, org.estado_id, org.responsavel_id))
      )
  )
$$;

-- =====================================================================
-- 2) DROP policies antigas permissivas
-- =====================================================================
DROP POLICY IF EXISTS "Permissive access on atividades" ON public.atividades;
DROP POLICY IF EXISTS "Permissive access on oportunidades" ON public.oportunidades;
DROP POLICY IF EXISTS "Permissive access on oportunidade_pessoas" ON public.oportunidade_pessoas;
DROP POLICY IF EXISTS "Permissive read on historico_oportunidade" ON public.historico_oportunidade;
DROP POLICY IF EXISTS "Permissive insert on historico_oportunidade" ON public.historico_oportunidade;
DROP POLICY IF EXISTS "Permissive access on pipelines" ON public.pipelines;
DROP POLICY IF EXISTS "Permissive access on etapas_pipeline" ON public.etapas_pipeline;
DROP POLICY IF EXISTS "Permissive access on tipos_atividade" ON public.tipos_atividade;
DROP POLICY IF EXISTS "Ver propostas" ON public.propostas;
DROP POLICY IF EXISTS "Ver orcamentos" ON public.orcamentos;
DROP POLICY IF EXISTS "Ver orcamentos_reforma" ON public.orcamentos_reforma;

-- =====================================================================
-- 3) ATIVIDADES
-- =====================================================================
CREATE POLICY "atividades_select" ON public.atividades FOR SELECT TO authenticated
USING (
  is_approved(auth.uid()) AND (
    has_role(auth.uid(),'admin')
    OR has_role(auth.uid(),'marketing')
    OR responsavel_id = auth.uid()
    OR (organizacao_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.organizacoes o
      WHERE o.id = atividades.organizacao_id
        AND pode_ver_organizacao(auth.uid(), o.estado_id, o.responsavel_id)
    ))
  )
);

CREATE POLICY "atividades_insert" ON public.atividades FOR INSERT TO authenticated
WITH CHECK (is_approved(auth.uid()));

CREATE POLICY "atividades_update" ON public.atividades FOR UPDATE TO authenticated
USING (has_role(auth.uid(),'admin') OR responsavel_id = auth.uid());

CREATE POLICY "atividades_delete" ON public.atividades FOR DELETE TO authenticated
USING (has_role(auth.uid(),'admin'));

-- =====================================================================
-- 4) OPORTUNIDADES (marketing bloqueado)
-- =====================================================================
CREATE POLICY "oportunidades_select" ON public.oportunidades FOR SELECT TO authenticated
USING (
  is_approved(auth.uid())
  AND NOT has_role(auth.uid(),'marketing')
  AND (
    has_role(auth.uid(),'admin')
    OR responsavel_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.organizacoes o
      WHERE o.id = oportunidades.organizacao_id
        AND pode_ver_organizacao(auth.uid(), o.estado_id, o.responsavel_id)
    )
  )
);

CREATE POLICY "oportunidades_insert" ON public.oportunidades FOR INSERT TO authenticated
WITH CHECK (is_approved(auth.uid()) AND NOT has_role(auth.uid(),'marketing'));

CREATE POLICY "oportunidades_update" ON public.oportunidades FOR UPDATE TO authenticated
USING (has_role(auth.uid(),'admin') OR responsavel_id = auth.uid());

CREATE POLICY "oportunidades_delete" ON public.oportunidades FOR DELETE TO authenticated
USING (has_role(auth.uid(),'admin'));

-- =====================================================================
-- 5) OPORTUNIDADE_PESSOAS
-- =====================================================================
CREATE POLICY "opp_pessoas_select" ON public.oportunidade_pessoas FOR SELECT TO authenticated
USING (
  has_role(auth.uid(),'admin')
  OR has_role(auth.uid(),'marketing')
  OR pode_ver_oportunidade(auth.uid(), oportunidade_id)
);

CREATE POLICY "opp_pessoas_insert" ON public.oportunidade_pessoas FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(),'admin') OR pode_ver_oportunidade(auth.uid(), oportunidade_id));

CREATE POLICY "opp_pessoas_update" ON public.oportunidade_pessoas FOR UPDATE TO authenticated
USING (has_role(auth.uid(),'admin') OR pode_ver_oportunidade(auth.uid(), oportunidade_id));

CREATE POLICY "opp_pessoas_delete" ON public.oportunidade_pessoas FOR DELETE TO authenticated
USING (has_role(auth.uid(),'admin') OR pode_ver_oportunidade(auth.uid(), oportunidade_id));

-- =====================================================================
-- 6) HISTORICO_OPORTUNIDADE (imutável, INSERT só via trigger DEFINER)
-- =====================================================================
CREATE POLICY "hist_opp_select" ON public.historico_oportunidade FOR SELECT TO authenticated
USING (
  has_role(auth.uid(),'admin')
  OR (has_role(auth.uid(),'marketing') AND tipo_mudanca <> 'valor')
  OR pode_ver_oportunidade(auth.uid(), oportunidade_id)
);
-- sem policy de INSERT/UPDATE/DELETE => bloqueado para client; triggers SECURITY DEFINER inserem normalmente.

-- =====================================================================
-- 7) PIPELINES / ETAPAS / TIPOS_ATIVIDADE
-- =====================================================================
CREATE POLICY "pipelines_read" ON public.pipelines FOR SELECT TO authenticated USING (true);
CREATE POLICY "pipelines_admin" ON public.pipelines FOR ALL TO authenticated
USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE POLICY "etapas_read" ON public.etapas_pipeline FOR SELECT TO authenticated USING (true);
CREATE POLICY "etapas_admin" ON public.etapas_pipeline FOR ALL TO authenticated
USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE POLICY "tipos_read" ON public.tipos_atividade FOR SELECT TO authenticated USING (true);
CREATE POLICY "tipos_admin" ON public.tipos_atividade FOR ALL TO authenticated
USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

-- =====================================================================
-- 8) PROPOSTAS / ORCAMENTOS / ORCAMENTOS_REFORMA (marketing fora)
-- =====================================================================
CREATE POLICY "Ver propostas" ON public.propostas FOR SELECT TO authenticated
USING (is_approved(auth.uid()) AND (
  has_any_role(auth.uid(), ARRAY['admin','viewer','financeiro','engenharia','operacao']::app_role[])
  OR (has_role(auth.uid(),'comercial') AND (
    responsavel_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.organizacoes o
               WHERE o.id = propostas.organizacao_id
                 AND user_cobre_estado(auth.uid(), o.estado_id))
  ))
));

CREATE POLICY "Ver orcamentos" ON public.orcamentos FOR SELECT TO authenticated
USING (is_approved(auth.uid()) AND (
  has_any_role(auth.uid(), ARRAY['admin','viewer','financeiro','engenharia','operacao']::app_role[])
  OR (has_role(auth.uid(),'comercial') AND (
    responsavel_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.organizacoes o
               WHERE o.id = orcamentos.organizacao_id
                 AND user_cobre_estado(auth.uid(), o.estado_id))
  ))
));

CREATE POLICY "Ver orcamentos_reforma" ON public.orcamentos_reforma FOR SELECT TO authenticated
USING (is_approved(auth.uid()) AND (
  has_any_role(auth.uid(), ARRAY['admin','viewer','financeiro','engenharia','operacao']::app_role[])
  OR (has_role(auth.uid(),'comercial') AND (
    responsavel_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.organizacoes o
               WHERE o.id = orcamentos_reforma.organizacao_id
                 AND user_cobre_estado(auth.uid(), o.estado_id))
  ))
));

-- =====================================================================
-- 9) VIEWS SEM VALORES (acessadas só por admin/marketing)
-- =====================================================================
DROP VIEW IF EXISTS public.oportunidades_sem_valores;
CREATE VIEW public.oportunidades_sem_valores AS
SELECT id, created_at, updated_at, titulo, organizacao_id, pipeline_id, etapa_id,
       probabilidade, data_fechamento_prevista, data_fechamento_real,
       status, motivo_perda, concorrente_vencedor, observacoes, ordem_coluna,
       ultima_atividade_em, proxima_atividade_em, responsavel_id, notas
FROM public.oportunidades
WHERE has_role(auth.uid(),'marketing') OR has_role(auth.uid(),'admin');

DROP VIEW IF EXISTS public.propostas_sem_valores;
CREATE VIEW public.propostas_sem_valores AS
SELECT id, created_at, updated_at, numero_proposta, nome_cliente, status,
       organizacao_id, oportunidade_id, pessoa_contato_id, responsavel_id,
       contato_nome, cliente_cnpj, cliente_email, cliente_telefone, cliente_endereco,
       validade_dias, local_entrega, observacoes, dados_congelados,
       peso_saco, vol_min_f2_pct, volume_minimo_calculado
FROM public.propostas
WHERE has_role(auth.uid(),'marketing') OR has_role(auth.uid(),'admin');

DROP VIEW IF EXISTS public.orcamentos_sem_valores;
CREATE VIEW public.orcamentos_sem_valores AS
SELECT id, created_at, updated_at, numero_orcamento, nome_cliente, status,
       organizacao_id, oportunidade_id, responsavel_id,
       contato_nome, cliente_cnpj, cliente_email, cliente_telefone, cliente_endereco,
       validade_dias, local_entrega, prazo_entrega, condicoes_pagamento,
       observacoes, dados_congelados
FROM public.orcamentos
WHERE has_role(auth.uid(),'marketing') OR has_role(auth.uid(),'admin');

DROP VIEW IF EXISTS public.orcamentos_reforma_sem_valores;
CREATE VIEW public.orcamentos_reforma_sem_valores AS
SELECT id, created_at, updated_at, numero_orcamento, nome_cliente, status,
       organizacao_id, oportunidade_id, responsavel_id,
       contato_nome, cliente_cnpj, cliente_email, cliente_telefone, cliente_endereco,
       validade_dias, local_entrega, prazo_entrega, condicoes_pagamento,
       observacoes, dados_congelados
FROM public.orcamentos_reforma
WHERE has_role(auth.uid(),'marketing') OR has_role(auth.uid(),'admin');

GRANT SELECT ON public.oportunidades_sem_valores TO authenticated;
GRANT SELECT ON public.propostas_sem_valores TO authenticated;
GRANT SELECT ON public.orcamentos_sem_valores TO authenticated;
GRANT SELECT ON public.orcamentos_reforma_sem_valores TO authenticated;
