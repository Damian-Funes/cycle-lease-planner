
CREATE OR REPLACE FUNCTION public.pode_ver_planta(_user uuid, _path text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.layouts l
      LEFT JOIN public.organizacoes o ON o.id = l.organizacao_id
     WHERE l.piso_imagem_url = _path
       AND (
         l.organizacao_id IS NULL
         OR public.pode_ver_organizacao(_user, o.estado_id, o.responsavel_id)
       )
  );
$$;

CREATE OR REPLACE FUNCTION public.pode_inserir_planta(_user uuid, _name text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _layout_id uuid;
  _org_id uuid;
  _est uuid;
  _resp uuid;
BEGIN
  BEGIN
    _layout_id := substring(_name from 1 for 36)::uuid;
  EXCEPTION WHEN others THEN
    RETURN false;
  END;
  SELECT l.organizacao_id, o.estado_id, o.responsavel_id
    INTO _org_id, _est, _resp
    FROM public.layouts l
    LEFT JOIN public.organizacoes o ON o.id = l.organizacao_id
   WHERE l.id = _layout_id;
  IF NOT FOUND THEN RETURN false; END IF;
  IF _org_id IS NULL THEN RETURN true; END IF;
  RETURN public.pode_ver_organizacao(_user, _est, _resp);
END;
$$;

DROP POLICY IF EXISTS "Approved users can delete plantas-cliente" ON storage.objects;
DROP POLICY IF EXISTS "Approved users can update plantas-cliente" ON storage.objects;
DROP POLICY IF EXISTS "Approved users can upload plantas-cliente" ON storage.objects;
DROP POLICY IF EXISTS "approved can delete plantas-cliente" ON storage.objects;
DROP POLICY IF EXISTS "approved can read plantas-cliente" ON storage.objects;
DROP POLICY IF EXISTS "approved can update plantas-cliente" ON storage.objects;
DROP POLICY IF EXISTS "approved can upload plantas-cliente" ON storage.objects;

CREATE POLICY "plantas-cliente read owned" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'plantas-cliente' AND is_approved(auth.uid()) AND public.pode_ver_planta(auth.uid(), name));

CREATE POLICY "plantas-cliente insert owned" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'plantas-cliente' AND is_approved(auth.uid()) AND public.pode_inserir_planta(auth.uid(), name));

CREATE POLICY "plantas-cliente update owned" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'plantas-cliente' AND is_approved(auth.uid()) AND public.pode_ver_planta(auth.uid(), name))
  WITH CHECK (bucket_id = 'plantas-cliente' AND is_approved(auth.uid()) AND public.pode_ver_planta(auth.uid(), name));

CREATE POLICY "plantas-cliente delete owned" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'plantas-cliente' AND is_approved(auth.uid()) AND public.pode_ver_planta(auth.uid(), name));
