ALTER TABLE public.ligacoes_viagem DROP CONSTRAINT ligacoes_viagem_origem_check;
ALTER TABLE public.ligacoes_viagem ADD CONSTRAINT ligacoes_viagem_origem_check CHECK (origem = ANY (ARRAY['inicial','retentativa','retorno','teste','faxina','manual']));
ALTER TABLE public.ligacoes_viagem DROP CONSTRAINT ligacoes_viagem_status_check;
ALTER TABLE public.ligacoes_viagem ADD CONSTRAINT ligacoes_viagem_status_check CHECK (status = ANY (ARRAY['aguardando_escolha','agendada','discando','em_andamento','concluida','interrompida','nao_atendeu','falhou','cancelada']));
ALTER TABLE public.ligacoes_viagem DROP CONSTRAINT ligacoes_viagem_tentativa_check;
ALTER TABLE public.ligacoes_viagem ADD CONSTRAINT ligacoes_viagem_tentativa_check CHECK (tentativa >= 1);
ALTER TABLE public.ligacoes_viagem DROP CONSTRAINT IF EXISTS ligacoes_viagem_vendedor_id_data_ref_origem_key;
DROP INDEX IF EXISTS public.ligacoes_viagem_vendedor_id_data_ref_origem_key;
CREATE UNIQUE INDEX ligacoes_viagem_vendedor_id_data_ref_origem_key ON public.ligacoes_viagem (vendedor_id, data_ref, origem) WHERE origem <> 'manual';
CREATE UNIQUE INDEX ligacoes_viagem_uma_ativa ON public.ligacoes_viagem (vendedor_id) WHERE teste = false AND status IN ('discando','em_andamento');

CREATE OR REPLACE FUNCTION public.julia_reservar_ligacao(p_rota uuid,p_origem text,p_quando timestamptz,p_admin uuid DEFAULT NULL,p_teste boolean DEFAULT false)
RETURNS public.ligacoes_viagem LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.rotas; l public.ligacoes_viagem; n integer; d date:=(now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
 SELECT * INTO r FROM public.rotas WHERE id=p_rota FOR UPDATE;
 IF NOT FOUND OR r.status<>'aprovada' OR d NOT BETWEEN r.data_inicio AND r.data_fim THEN RAISE EXCEPTION 'Selecione uma viagem aprovada em andamento.'; END IF;
 IF NOT (public.has_role(r.vendedor_id,'comercial') OR public.has_role(r.vendedor_id,'rtv') OR (r.vendedor_id='660c2932-4404-48ca-ad2d-c76862bb9d74' AND public.has_role(r.vendedor_id,'admin'))) THEN RAISE EXCEPTION 'Vendedor fora da whitelist.'; END IF;
 IF p_teste AND (p_admin IS DISTINCT FROM '660c2932-4404-48ca-ad2d-c76862bb9d74'::uuid OR NOT public.has_role(p_admin,'admin')) THEN RAISE EXCEPTION 'Teste permitido somente ao Damian administrador.'; END IF;
 IF p_admin IS NOT NULL AND NOT public.has_role(p_admin,'admin') THEN RAISE EXCEPTION 'Somente admin.'; END IF;
 IF p_origem='manual' AND (p_admin IS NULL OR p_teste) THEN RAISE EXCEPTION 'Religar manual é só para admin.'; END IF;
 IF p_origem NOT IN ('inicial','retentativa','retorno','teste','manual') OR p_teste<>(p_origem='teste') THEN RAISE EXCEPTION 'Origem inválida.'; END IF;
 IF p_origem IN ('retorno','retentativa') AND NOT EXISTS(SELECT 1 FROM public.ligacoes_viagem WHERE vendedor_id=r.vendedor_id AND data_ref=d AND origem='inicial' AND teste=false) THEN RAISE EXCEPTION 'Retorno exige tentativa inicial.'; END IF;
 IF (p_quando AT TIME ZONE 'America/Sao_Paulo')::date<>d OR (p_quando AT TIME ZONE 'America/Sao_Paulo')::time>'22:00' THEN RAISE EXCEPTION 'Agende hoje até 22h.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(r.vendedor_id::text||d::text,0));
 IF p_origem='manual' THEN
  IF EXISTS(SELECT 1 FROM public.ligacoes_viagem WHERE vendedor_id=r.vendedor_id AND data_ref=d AND teste=false AND status IN ('discando','em_andamento')) THEN
   RAISE EXCEPTION 'Já existe uma ligação em andamento com este vendedor. Aguarde o encerramento.'; END IF;
  UPDATE public.ligacoes_viagem SET status='cancelada',erro='substituida por religar manual',updated_at=now()
   WHERE vendedor_id=r.vendedor_id AND data_ref=d AND teste=false AND status IN ('agendada','aguardando_escolha');
  INSERT INTO public.ligacoes_viagem(rota_id,vendedor_id,data_ref,tentativa,origem,agendada_para,solicitado_por,teste)
   VALUES(r.id,r.vendedor_id,d,(SELECT coalesce(max(tentativa),0)+1 FROM public.ligacoes_viagem WHERE vendedor_id=r.vendedor_id AND data_ref=d AND teste=false),'manual',p_quando,p_admin,false) RETURNING * INTO l;
  RETURN l;
 END IF;
 SELECT * INTO l FROM public.ligacoes_viagem WHERE vendedor_id=r.vendedor_id AND data_ref=d AND origem=p_origem FOR UPDATE;
 IF FOUND THEN
  IF p_teste AND l.teste AND l.status IN ('falhou','concluida','nao_atendeu') THEN
   UPDATE public.ligacoes_viagem SET rota_id=r.id,status='agendada',agendada_para=p_quando,solicitado_por=p_admin,
    escolha=NULL,telefone=NULL,conversation_id=NULL,call_sid=NULL,resumo=NULL,transcricao=NULL,duracao_s=NULL,erro=NULL,updated_at=now()
    WHERE id=l.id RETURNING * INTO l;
  ELSIF p_teste AND l.status IN ('discando','em_andamento') THEN
   RAISE EXCEPTION 'Já existe uma ligação de teste em andamento. Aguarde o encerramento.';
  END IF;
  RETURN l;
 END IF;
 SELECT count(*) INTO n FROM public.ligacoes_viagem WHERE vendedor_id=r.vendedor_id AND data_ref=d AND teste=false AND origem<>'manual';
 IF NOT p_teste AND n>=3 THEN RAISE EXCEPTION 'Máximo de 3 tentativas por dia.'; END IF;
 INSERT INTO public.ligacoes_viagem(rota_id,vendedor_id,data_ref,tentativa,origem,agendada_para,solicitado_por,teste)
  VALUES(r.id,r.vendedor_id,d,CASE WHEN p_teste THEN 1 ELSE (SELECT coalesce(max(tentativa),0)+1 FROM public.ligacoes_viagem WHERE vendedor_id=r.vendedor_id AND data_ref=d AND teste=false) END,p_origem,p_quando,p_admin,p_teste) RETURNING * INTO l;
 RETURN l;
END $$;
REVOKE ALL ON FUNCTION public.julia_reservar_ligacao(uuid,text,timestamptz,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.julia_reservar_ligacao(uuid,text,timestamptz,uuid,boolean) TO service_role;

UPDATE public.ligacoes_viagem SET status='interrompida', erro='user_turn_timeout aos 95 s, sem gravação', updated_at=now()
 WHERE id='17023be8-e5d3-4c87-b3c2-8d2fe8d1249b' AND status='concluida';