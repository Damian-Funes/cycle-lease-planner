DROP POLICY IF EXISTS viagens_select ON storage.objects;
CREATE POLICY viagens_select ON storage.objects FOR SELECT TO authenticated
  USING (CASE WHEN bucket_id = 'viagens' THEN
    public.fn_uuid_seguro((storage.foldername(name))[1]) IS NOT NULL
    AND COALESCE(public.fn_pode_ver_rota(auth.uid(), public.fn_uuid_seguro((storage.foldername(name))[1])), false)
    ELSE false END);