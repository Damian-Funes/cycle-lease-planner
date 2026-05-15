-- Fase 5: Lockdown das tabelas legadas clientes/contatos
-- Substituir RLS permissiva por acesso somente leitura para admin (preserva dados para auditoria/Fase 6)

-- clientes
DROP POLICY IF EXISTS "Permissive access on clientes" ON public.clientes;

CREATE POLICY "Admin lê clientes (legado)"
ON public.clientes
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- contatos
DROP POLICY IF EXISTS "Permissive access on contatos" ON public.contatos;

CREATE POLICY "Admin lê contatos (legado)"
ON public.contatos
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Sem políticas de INSERT/UPDATE/DELETE = bloqueio total de escrita (RLS continua habilitada)