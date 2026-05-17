
-- 1. user_cobre_estado: não conceder acesso quando estado é nulo
CREATE OR REPLACE FUNCTION public.user_cobre_estado(_user_id uuid, _estado_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT _estado_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.usuario_estados WHERE user_id = _user_id AND estado_id = _estado_id
  )
$function$;

-- 2. layout_conexoes: exigir is_approved (consistente com layouts e layout_equipamentos)
DROP POLICY IF EXISTS "Authenticated can select layout_conexoes" ON public.layout_conexoes;
DROP POLICY IF EXISTS "Authenticated can insert layout_conexoes" ON public.layout_conexoes;
DROP POLICY IF EXISTS "Authenticated can update layout_conexoes" ON public.layout_conexoes;
DROP POLICY IF EXISTS "Authenticated can delete layout_conexoes" ON public.layout_conexoes;
DROP POLICY IF EXISTS "select layout_conexoes" ON public.layout_conexoes;
DROP POLICY IF EXISTS "insert layout_conexoes" ON public.layout_conexoes;
DROP POLICY IF EXISTS "update layout_conexoes" ON public.layout_conexoes;
DROP POLICY IF EXISTS "delete layout_conexoes" ON public.layout_conexoes;

CREATE POLICY "approved can select layout_conexoes"
ON public.layout_conexoes FOR SELECT TO authenticated
USING (public.is_approved(auth.uid()));

CREATE POLICY "approved can insert layout_conexoes"
ON public.layout_conexoes FOR INSERT TO authenticated
WITH CHECK (public.is_approved(auth.uid()));

CREATE POLICY "approved can update layout_conexoes"
ON public.layout_conexoes FOR UPDATE TO authenticated
USING (public.is_approved(auth.uid()))
WITH CHECK (public.is_approved(auth.uid()));

CREATE POLICY "approved can delete layout_conexoes"
ON public.layout_conexoes FOR DELETE TO authenticated
USING (public.is_approved(auth.uid()));

-- 3. plantas-cliente: tornar privado
UPDATE storage.buckets SET public = false WHERE id = 'plantas-cliente';

DROP POLICY IF EXISTS "Public can view plantas-cliente" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can upload plantas-cliente" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can update plantas-cliente" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can delete plantas-cliente" ON storage.objects;

CREATE POLICY "approved can read plantas-cliente"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'plantas-cliente' AND public.is_approved(auth.uid()));

CREATE POLICY "approved can upload plantas-cliente"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'plantas-cliente' AND public.is_approved(auth.uid()));

CREATE POLICY "approved can update plantas-cliente"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'plantas-cliente' AND public.is_approved(auth.uid()));

CREATE POLICY "approved can delete plantas-cliente"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'plantas-cliente' AND public.is_approved(auth.uid()));

-- 4. deal-files: verificar acesso à oportunidade pelo path (primeiro segmento = oportunidade_id)
DROP POLICY IF EXISTS "Authenticated can read deal-files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can insert deal-files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can update deal-files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can delete deal-files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can upload deal-files" ON storage.objects;

CREATE POLICY "ver deal-files da oportunidade"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'deal-files'
  AND public.pode_ver_oportunidade(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "upload deal-files da oportunidade"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'deal-files'
  AND public.pode_ver_oportunidade(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "atualizar deal-files da oportunidade"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'deal-files'
  AND public.pode_ver_oportunidade(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "remover deal-files da oportunidade"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'deal-files'
  AND public.pode_ver_oportunidade(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

-- 5. Constraints de tamanho em propostas
ALTER TABLE public.propostas
  DROP CONSTRAINT IF EXISTS nome_cliente_length,
  DROP CONSTRAINT IF EXISTS observacoes_length;

ALTER TABLE public.propostas
  ADD CONSTRAINT nome_cliente_length
    CHECK (nome_cliente IS NULL OR char_length(nome_cliente) <= 200),
  ADD CONSTRAINT observacoes_length
    CHECK (observacoes IS NULL OR char_length(observacoes) <= 2000);
