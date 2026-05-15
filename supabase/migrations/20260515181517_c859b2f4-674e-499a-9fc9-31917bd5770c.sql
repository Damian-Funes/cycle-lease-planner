-- Tabela de tokens OAuth Google por usuário
CREATE TABLE public.google_integration_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  google_email TEXT,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_type TEXT DEFAULT 'Bearer',
  scope TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.google_integration_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuário vê próprio token Google"
  ON public.google_integration_tokens FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Usuário insere próprio token Google"
  ON public.google_integration_tokens FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Usuário atualiza próprio token Google"
  ON public.google_integration_tokens FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Usuário deleta próprio token Google"
  ON public.google_integration_tokens FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER trg_google_tokens_updated_at
  BEFORE UPDATE ON public.google_integration_tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Colunas de integração na tabela atividades
ALTER TABLE public.atividades
  ADD COLUMN IF NOT EXISTS criar_meet BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS google_event_id TEXT,
  ADD COLUMN IF NOT EXISTS google_calendar_id TEXT,
  ADD COLUMN IF NOT EXISTS google_meet_link TEXT,
  ADD COLUMN IF NOT EXISTS sincronizado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS erro_sincronizacao TEXT;

CREATE INDEX IF NOT EXISTS idx_atividades_google_event_id
  ON public.atividades(google_event_id) WHERE google_event_id IS NOT NULL;