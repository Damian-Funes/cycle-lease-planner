ALTER TABLE public.ligacoes_viagem DROP CONSTRAINT IF EXISTS ligacoes_viagem_rota_entrada_check;
ALTER TABLE public.ligacoes_viagem DROP CONSTRAINT IF EXISTS ligacoes_viagem_rota_obrigatoria;
ALTER TABLE public.ligacoes_viagem ADD CONSTRAINT ligacoes_viagem_rota_obrigatoria
  CHECK (rota_id IS NOT NULL OR origem IN ('faxina','entrada'));