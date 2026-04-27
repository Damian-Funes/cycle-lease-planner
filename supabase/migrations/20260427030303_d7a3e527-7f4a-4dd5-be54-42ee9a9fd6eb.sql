-- 1. Adiciona coluna imagem_url em equipamentos
ALTER TABLE public.equipamentos
ADD COLUMN IF NOT EXISTS imagem_url text;

-- 2. Cria bucket público para imagens de equipamentos
INSERT INTO storage.buckets (id, name, public)
VALUES ('equipamentos-imagens', 'equipamentos-imagens', true)
ON CONFLICT (id) DO NOTHING;

-- 3. Políticas de storage
-- Leitura pública
CREATE POLICY "Public can view equipamento images"
ON storage.objects FOR SELECT
USING (bucket_id = 'equipamentos-imagens');

-- Apenas admins podem inserir
CREATE POLICY "Admins can upload equipamento images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'equipamentos-imagens'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

-- Apenas admins podem atualizar
CREATE POLICY "Admins can update equipamento images"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'equipamentos-imagens'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

-- Apenas admins podem deletar
CREATE POLICY "Admins can delete equipamento images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'equipamentos-imagens'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);