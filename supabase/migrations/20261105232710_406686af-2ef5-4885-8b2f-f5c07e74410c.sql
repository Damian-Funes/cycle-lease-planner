ALTER TABLE public.ligacoes_viagem
 DROP CONSTRAINT IF EXISTS ligacoes_viagem_vendedor_id_data_ref_tentativa_key;
CREATE UNIQUE INDEX IF NOT EXISTS ligacoes_viagem_tentativa_real_key
 ON public.ligacoes_viagem(vendedor_id,data_ref,tentativa) WHERE teste=false;

CREATE OR REPLACE FUNCTION public.julia_reservar_ligacao(p_rota uuid,p_origem text,p_quando timestamptz,p_admin uuid DEFAULT NULL,p_teste boolean DEFAULT false)
RETURNS public.ligacoes_viagem LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.rotas; l public.ligacoes_viagem; n integer; d date:=(now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
 SELECT * INTO r FROM public.rotas WHERE id=p_rota FOR UPDATE;
 IF NOT FOUND OR r.status<>'aprovada' OR d NOT BETWEEN r.data_inicio AND r.data_fim THEN RAISE EXCEPTION 'Selecione uma viagem aprovada em andamento.'; END IF;
 IF NOT (public.has_role(r.vendedor_id,'comercial') OR public.has_role(r.vendedor_id,'rtv') OR (r.vendedor_id='660c2932-4404-48ca-ad2d-c76862bb9d74' AND public.has_role(r.vendedor_id,'admin'))) THEN RAISE EXCEPTION 'Vendedor fora da whitelist.'; END IF;
 IF p_teste AND (p_admin IS DISTINCT FROM '660c2932-4404-48ca-ad2d-c76862bb9d74'::uuid OR NOT public.has_role(p_admin,'admin')) THEN RAISE EXCEPTION 'Teste permitido somente ao Damian administrador.'; END IF;
 IF p_admin IS NOT NULL AND NOT public.has_role(p_admin,'admin') THEN RAISE EXCEPTION 'Somente admin.'; END IF;
 IF p_origem NOT IN ('inicial','retentativa','retorno','teste') OR p_teste<>(p_origem='teste') THEN RAISE EXCEPTION 'Origem inválida.'; END IF;
 IF p_origem IN ('retorno','retentativa') AND NOT EXISTS(SELECT 1 FROM public.ligacoes_viagem WHERE vendedor_id=r.vendedor_id AND data_ref=d AND origem='inicial' AND teste=false) THEN RAISE EXCEPTION 'Retorno exige tentativa inicial.'; END IF;
 IF (p_quando AT TIME ZONE 'America/Sao_Paulo')::date<>d OR (p_quando AT TIME ZONE 'America/Sao_Paulo')::time>'22:00' THEN RAISE EXCEPTION 'Agende hoje até 22h.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(r.vendedor_id::text||d::text,0));
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
 SELECT count(*) INTO n FROM public.ligacoes_viagem WHERE vendedor_id=r.vendedor_id AND data_ref=d AND teste=false;
 IF NOT p_teste AND n>=3 THEN RAISE EXCEPTION 'Máximo de 3 tentativas por dia.'; END IF;
 INSERT INTO public.ligacoes_viagem(rota_id,vendedor_id,data_ref,tentativa,origem,agendada_para,solicitado_por,teste)
  VALUES(r.id,r.vendedor_id,d,CASE WHEN p_teste THEN 1 ELSE n+1 END,p_origem,p_quando,p_admin,p_teste) RETURNING * INTO l;
 RETURN l;
END $$;
REVOKE ALL ON FUNCTION public.julia_reservar_ligacao(uuid,text,timestamptz,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.julia_reservar_ligacao(uuid,text,timestamptz,uuid,boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.julia_finalizar_ligacao(p_conversa text,p_falha boolean,p_resumo text,p_transcricao jsonb,p_duracao integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE l public.ligacoes_viagem; n record; d date:=(now() AT TIME ZONE 'America/Sao_Paulo')::date; prox timestamptz:=now()+interval '30 minutes'; total integer;
BEGIN
 SELECT * INTO l FROM public.ligacoes_viagem WHERE conversation_id=p_conversa FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',true,'ignorada',true); END IF;
 IF l.status NOT IN ('discando','em_andamento') THEN RETURN jsonb_build_object('ok',true,'duplicada',true); END IF;
 UPDATE public.ligacoes_viagem SET status=CASE WHEN p_falha THEN 'nao_atendeu' ELSE 'concluida' END,resumo=left(p_resumo,4500),transcricao=p_transcricao,duracao_s=p_duracao,updated_at=now() WHERE id=l.id;
 IF NOT p_falha THEN
  INSERT INTO public.rota_diario(rota_id,autor_id,texto) VALUES(l.rota_id,l.vendedor_id,'Ligação da Júlia: '||left(p_resumo,4500));
 ELSIF NOT l.teste AND l.data_ref=d AND (prox AT TIME ZONE 'America/Sao_Paulo')::date=d AND (prox AT TIME ZONE 'America/Sao_Paulo')::time<'22:00' THEN
  SELECT count(*) INTO total FROM public.ligacoes_viagem WHERE vendedor_id=l.vendedor_id AND data_ref=d AND teste=false;
  IF total<3 AND NOT EXISTS(SELECT 1 FROM public.ligacoes_viagem WHERE vendedor_id=l.vendedor_id AND data_ref=d AND origem IN ('retentativa','retorno'))
     AND EXISTS(SELECT 1 FROM public.rotas WHERE id=l.rota_id AND status='aprovada' AND d BETWEEN data_inicio AND data_fim) THEN
   PERFORM public.julia_reservar_ligacao(l.rota_id,'retentativa',prox);
  END IF;
 END IF;
 FOR n IN SELECT p.noite,p.gasto_id FROM public.rota_pernoites p JOIN public.rota_gastos g ON g.id=p.gasto_id WHERE p.rota_id=l.rota_id AND p.tipo='hotel' AND nullif(btrim(g.arquivo_path),'') IS NULL
 LOOP
  INSERT INTO public.notificacoes(user_id,tipo,titulo,texto,link,chave)
   VALUES(l.vendedor_id,'julia_viagem','Envie a nota do hotel','Noite de '||to_char(n.noite,'DD/MM'),'/viagens/'||l.rota_id||'/hoje?nota='||n.gasto_id,'nota:'||n.gasto_id)
   ON CONFLICT(user_id,chave) DO NOTHING;
 END LOOP;
 RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.julia_finalizar_ligacao(text,boolean,text,jsonb,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.julia_finalizar_ligacao(text,boolean,text,jsonb,integer) TO service_role;