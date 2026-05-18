
-- 1. Tighten config_montagem write policy to admin-only
DROP POLICY IF EXISTS "config_montagem_write" ON public.config_montagem;
CREATE POLICY "config_montagem_admin_write"
  ON public.config_montagem
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 2. Restrict assets bucket uploads to admin only
DROP POLICY IF EXISTS "Authenticated users can upload assets" ON storage.objects;
CREATE POLICY "Admins can upload assets"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'assets' AND public.has_role(auth.uid(), 'admin'::app_role));

-- 3. Remove broad SELECT policy on deal-files
DROP POLICY IF EXISTS "Authenticated can view deal-files" ON storage.objects;

-- 4. Fix function search_path
ALTER FUNCTION public.recalc_montagem_total() SET search_path = public;
