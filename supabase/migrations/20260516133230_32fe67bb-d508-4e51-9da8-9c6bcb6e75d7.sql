-- Permitir que usuários aprovados vejam perfis de outros usuários aprovados
-- Necessário para popular dropdowns de "Responsável" e exibir nomes em listas
CREATE POLICY "Approved users can view approved profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  public.is_approved(auth.uid())
  AND status = 'approved'
);