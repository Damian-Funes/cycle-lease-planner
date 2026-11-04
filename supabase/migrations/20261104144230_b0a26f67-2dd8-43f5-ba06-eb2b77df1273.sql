ALTER TABLE public.veiculos
  ADD COLUMN IF NOT EXISTS base_nome text,
  ADD COLUMN IF NOT EXISTS base_lat numeric,
  ADD COLUMN IF NOT EXISTS base_lng numeric;

UPDATE public.veiculos SET base_nome='Formosa - GO', base_lat=-15.5372, base_lng=-47.3344
 WHERE vendedor_id='14138b1c-5b33-4a66-b0f0-fc06e58da561' AND base_lat IS NULL;

UPDATE public.veiculos SET base_nome='Maringá - PR', base_lat=-23.4253, base_lng=-51.9386
 WHERE vendedor_id IN ('0488a4f9-5a4a-4cac-a564-beec5fb21757','2555cff8-3ac8-4525-bf38-6198dc85c887')
   AND base_lat IS NULL;