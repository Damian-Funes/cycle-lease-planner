DROP POLICY IF EXISTS "Editar orcamentos" ON public.orcamentos;
DROP POLICY IF EXISTS "Criar orcamentos" ON public.orcamentos;

CREATE POLICY "Criar orcamentos" ON public.orcamentos
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_approved(auth.uid())
  AND (
    public.has_any_role(auth.uid(), ARRAY['admin'::public.app_role, 'gerente_comercial'::public.app_role])
    OR (
      public.has_role(auth.uid(), 'comercial'::public.app_role)
      AND (
        responsavel_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.organizacoes o
          WHERE o.id = orcamentos.organizacao_id
            AND public.user_cobre_estado(auth.uid(), o.estado_id)
            AND COALESCE(o.segmento, '') <> 'MULTINACIONAIS'
        )
      )
    )
  )
);

CREATE POLICY "Editar orcamentos" ON public.orcamentos
FOR UPDATE
TO authenticated
USING (
  public.is_approved(auth.uid())
  AND (
    public.has_any_role(auth.uid(), ARRAY['admin'::public.app_role, 'gerente_comercial'::public.app_role])
    OR (
      public.has_role(auth.uid(), 'comercial'::public.app_role)
      AND (
        responsavel_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.organizacoes o
          WHERE o.id = orcamentos.organizacao_id
            AND public.user_cobre_estado(auth.uid(), o.estado_id)
            AND COALESCE(o.segmento, '') <> 'MULTINACIONAIS'
        )
      )
    )
  )
)
WITH CHECK (
  public.is_approved(auth.uid())
  AND (
    public.has_any_role(auth.uid(), ARRAY['admin'::public.app_role, 'gerente_comercial'::public.app_role])
    OR (
      public.has_role(auth.uid(), 'comercial'::public.app_role)
      AND (
        responsavel_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.organizacoes o
          WHERE o.id = orcamentos.organizacao_id
            AND public.user_cobre_estado(auth.uid(), o.estado_id)
            AND COALESCE(o.segmento, '') <> 'MULTINACIONAIS'
        )
      )
    )
  )
);

DROP TRIGGER IF EXISTS trg_orcamentos_set_responsavel_creator ON public.orcamentos;
CREATE TRIGGER trg_orcamentos_set_responsavel_creator
BEFORE INSERT ON public.orcamentos
FOR EACH ROW
EXECUTE FUNCTION public.fn_set_responsavel_creator();