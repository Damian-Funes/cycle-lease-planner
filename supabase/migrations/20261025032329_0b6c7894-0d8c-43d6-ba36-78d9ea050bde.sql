CREATE OR REPLACE FUNCTION public.fn_paradas_protecao() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.rotas; planejamento boolean; admin boolean:=coalesce(public.has_role(auth.uid(),'admin'),false);
BEGIN
 IF TG_OP='UPDATE' AND NEW.rota_id IS DISTINCT FROM OLD.rota_id THEN RAISE EXCEPTION 'Não é permitido transferir paradas entre rotas.'; END IF;
 SELECT * INTO r FROM public.rotas WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.rota_id ELSE NEW.rota_id END FOR UPDATE;
 IF NOT FOUND THEN IF TG_OP='DELETE' THEN RETURN OLD; END IF; RAISE EXCEPTION 'Rota não encontrada.'; END IF;
 IF NOT admin AND r.status IN ('concluida','cancelada') THEN RAISE EXCEPTION 'Paradas de uma rota encerrada não podem ser alteradas.'; END IF;
 planejamento:=TG_OP IN ('INSERT','DELETE');
 IF TG_OP='UPDATE' THEN planejamento:=ROW(NEW.organizacao_id,NEW.oportunidade_id,NEW.cidade,NEW.estado,NEW.ordem,NEW.objetivo,NEW.tipo,NEW.latitude,NEW.longitude,NEW.atividade_id) IS DISTINCT FROM ROW(OLD.organizacao_id,OLD.oportunidade_id,OLD.cidade,OLD.estado,OLD.ordem,OLD.objetivo,OLD.tipo,OLD.latitude,OLD.longitude,OLD.atividade_id); END IF;
 IF planejamento AND NOT admin AND r.status='aprovada' AND r.data_rota<current_date THEN RAISE EXCEPTION 'O plano de uma viagem passada não pode ser alterado. Preste contas.'; END IF;
 IF TG_OP<>'DELETE' THEN
  IF (TG_OP='INSERT' AND (NEW.visitada IS NOT NULL OR NEW.resultado IS NOT NULL OR NEW.motivo_nao_visita IS NOT NULL)) OR (TG_OP='UPDATE' AND ROW(NEW.visitada,NEW.resultado,NEW.motivo_nao_visita) IS DISTINCT FROM ROW(OLD.visitada,OLD.resultado,OLD.motivo_nao_visita)) THEN
   IF NOT admin AND (r.status<>'aprovada' OR r.data_rota>current_date) THEN RAISE EXCEPTION 'Preste contas somente na data de uma viagem aprovada.'; END IF;
   NEW.informada_em:=CASE WHEN NEW.visitada IS NULL THEN NULL ELSE now() END;
  ELSIF TG_OP='UPDATE' THEN NEW.informada_em:=OLD.informada_em; ELSE NEW.informada_em:=NULL; END IF;
  RETURN NEW;
 END IF;
 RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION public.fn_paradas_protecao() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_paradas_protecao() TO service_role;