-- PROPOSTA (não aplicada). Ligação recebida: o vendedor liga para a Júlia.
-- Usada por supabase/functions/julia-viagem-entrada (service role apenas).

ALTER TABLE public.ligacoes_viagem DROP CONSTRAINT IF EXISTS ligacoes_viagem_origem_check;
ALTER TABLE public.ligacoes_viagem ADD CONSTRAINT ligacoes_viagem_origem_check
  CHECK (origem = ANY (ARRAY['inicial','retentativa','retorno','teste','faxina','manual','entrada']));

CREATE OR REPLACE FUNCTION public.julia_reservar_entrada(p_rota uuid, p_telefone text, p_call_sid text, p_teste boolean, p_solicitante uuid)
RETURNS public.ligacoes_viagem LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r public.rotas; l public.ligacoes_viagem; d date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  SELECT * INTO r FROM rotas WHERE id = p_rota FOR UPDATE;
  IF NOT FOUND OR r.status <> 'aprovada' OR d NOT BETWEEN r.data_inicio AND r.data_fim THEN RAISE EXCEPTION 'Sem viagem aprovada hoje.'; END IF;
  IF p_teste AND (p_solicitante IS DISTINCT FROM '660c2932-4404-48ca-ad2d-c76862bb9d74'::uuid OR NOT has_role(p_solicitante,'admin')) THEN RAISE EXCEPTION 'Teste só para o Damian admin.'; END IF;
  IF NOT p_teste AND p_solicitante IS DISTINCT FROM r.vendedor_id THEN RAISE EXCEPTION 'Quem ligou não é o vendedor da viagem.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(r.vendedor_id::text || d::text, 0));
  IF EXISTS (SELECT 1 FROM ligacoes_viagem WHERE vendedor_id = r.vendedor_id AND data_ref = d AND teste = p_teste AND status IN ('discando','em_andamento')) THEN
    RAISE EXCEPTION 'Já existe uma ligação em andamento.'; END IF;
  -- Ele já ligou: retornos/agendadas ainda não discadas saem.
  IF NOT p_teste THEN
    UPDATE ligacoes_viagem SET status = 'cancelada', erro = 'Vendedor ligou', updated_at = now()
     WHERE vendedor_id = r.vendedor_id AND data_ref = d AND teste = false AND status IN ('agendada','aguardando_escolha');
  END IF;
  INSERT INTO ligacoes_viagem (rota_id, vendedor_id, data_ref, tentativa, origem, agendada_para, solicitado_por, teste, status, telefone, call_sid)
  VALUES (r.id, r.vendedor_id, d,
    (SELECT coalesce(max(tentativa),0) + 1 FROM ligacoes_viagem WHERE vendedor_id = r.vendedor_id AND data_ref = d AND teste = p_teste),
    'entrada', now(), p_solicitante, p_teste, 'em_andamento', p_telefone, nullif(p_call_sid,''))
  RETURNING * INTO l;
  RETURN l;
END $$;
REVOKE ALL ON FUNCTION public.julia_reservar_entrada(uuid,text,text,boolean,uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.julia_reservar_entrada(uuid,text,text,boolean,uuid) TO service_role;

-- O vendedor pode ligar várias vezes no dia: o índice único por origem passa a excluir 'entrada'.
-- "Uma ativa por vendedor" (ligacoes_viagem_uma_ativa) continua valendo.
DROP INDEX IF EXISTS public.ligacoes_viagem_vendedor_id_data_ref_origem_key;
CREATE UNIQUE INDEX ligacoes_viagem_vendedor_id_data_ref_origem_key ON public.ligacoes_viagem (vendedor_id, data_ref, origem)
  WHERE origem NOT IN ('manual','entrada');
