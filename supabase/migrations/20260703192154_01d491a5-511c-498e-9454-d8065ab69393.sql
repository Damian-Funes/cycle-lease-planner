
DROP POLICY IF EXISTS "Editar orcamentos" ON public.orcamentos;
CREATE POLICY "Editar orcamentos" ON public.orcamentos
FOR UPDATE
USING (
  has_any_role(auth.uid(), ARRAY['admin'::app_role, 'gerente_comercial'::app_role])
  OR (
    has_role(auth.uid(), 'comercial'::app_role)
    AND (
      responsavel_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.organizacoes o
        WHERE o.id = orcamentos.organizacao_id
          AND user_cobre_estado(auth.uid(), o.estado_id)
          AND COALESCE(o.segmento, '') <> 'MULTINACIONAIS'
      )
    )
  )
);
