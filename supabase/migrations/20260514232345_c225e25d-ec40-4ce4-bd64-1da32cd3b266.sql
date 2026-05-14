INSERT INTO storage.buckets (id, name, public) VALUES ('deal-files', 'deal-files', false) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated can view deal-files"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'deal-files');

CREATE POLICY "Authenticated can upload deal-files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'deal-files');

CREATE POLICY "Authenticated can update deal-files"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'deal-files');

CREATE POLICY "Authenticated can delete deal-files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'deal-files');

ALTER TABLE public.oportunidades ADD COLUMN IF NOT EXISTS notas text;