ALTER TABLE public.rotas ADD COLUMN IF NOT EXISTS enviada_em timestamptz, ADD COLUMN IF NOT EXISTS aprovada_em timestamptz, ADD COLUMN IF NOT EXISTS aprovada_por uuid, ADD COLUMN IF NOT EXISTS motivo_reprovacao text, ADD COLUMN IF NOT EXISTS prestacao_concluida_em timestamptz;
ALTER TABLE public.rota_paradas ADD COLUMN IF NOT EXISTS objetivo text, ADD COLUMN IF NOT EXISTS resultado text, ADD COLUMN IF NOT EXISTS visitada boolean, ADD COLUMN IF NOT EXISTS motivo_nao_visita text, ADD COLUMN IF NOT EXISTS informada_em timestamptz;
DROP TRIGGER IF EXISTS rotas_autorizacao ON public.rotas;
DROP TRIGGER IF EXISTS paradas_protecao ON public.rota_paradas;
DROP TRIGGER IF EXISTS paradas_reaprovacao ON public.rota_paradas;
DO $$ DECLARE c record; BEGIN FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='public.rotas'::regclass AND contype='c' AND pg_get_constraintdef(oid) ~ '\mstatus\M' LOOP EXECUTE format('ALTER TABLE public.rotas DROP CONSTRAINT %I',c.conname); END LOOP; END $$;
UPDATE public.rotas SET status='rascunho' WHERE status='planejada';
ALTER TABLE public.rotas ALTER COLUMN status SET DEFAULT 'rascunho';
GRANT SELECT,INSERT,UPDATE,DELETE ON public.rotas,public.rota_paradas TO authenticated;
GRANT ALL ON public.rotas,public.rota_paradas TO service_role;
ALTER TABLE public.rotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rota_paradas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rotas_select ON public.rotas;
DROP POLICY IF EXISTS rotas_insert ON public.rotas;
DROP POLICY IF EXISTS rotas_update ON public.rotas;
DROP POLICY IF EXISTS rotas_delete ON public.rotas;
CREATE POLICY rotas_select ON public.rotas FOR SELECT TO authenticated USING (vendedor_id=auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY rotas_insert ON public.rotas FOR INSERT TO authenticated WITH CHECK (vendedor_id=auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY rotas_update ON public.rotas FOR UPDATE TO authenticated USING (vendedor_id=auth.uid() OR public.has_role(auth.uid(),'admin')) WITH CHECK (vendedor_id=auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY rotas_delete ON public.rotas FOR DELETE TO authenticated USING (vendedor_id=auth.uid() OR public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS paradas_select ON public.rota_paradas;
DROP POLICY IF EXISTS paradas_insert ON public.rota_paradas;
DROP POLICY IF EXISTS paradas_update ON public.rota_paradas;
DROP POLICY IF EXISTS paradas_delete ON public.rota_paradas;
CREATE POLICY paradas_select ON public.rota_paradas FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.rotas r WHERE r.id=rota_id AND (r.vendedor_id=auth.uid() OR public.has_role(auth.uid(),'admin'))));
CREATE POLICY paradas_insert ON public.rota_paradas FOR INSERT TO authenticated WITH CHECK (EXISTS(SELECT 1 FROM public.rotas r WHERE r.id=rota_id AND (r.vendedor_id=auth.uid() OR public.has_role(auth.uid(),'admin'))));
CREATE POLICY paradas_update ON public.rota_paradas FOR UPDATE TO authenticated USING (EXISTS(SELECT 1 FROM public.rotas r WHERE r.id=rota_id AND (r.vendedor_id=auth.uid() OR public.has_role(auth.uid(),'admin')))) WITH CHECK (EXISTS(SELECT 1 FROM public.rotas r WHERE r.id=rota_id AND (r.vendedor_id=auth.uid() OR public.has_role(auth.uid(),'admin'))));
CREATE POLICY paradas_delete ON public.rota_paradas FOR DELETE TO authenticated USING (EXISTS(SELECT 1 FROM public.rotas r WHERE r.id=rota_id AND (r.vendedor_id=auth.uid() OR public.has_role(auth.uid(),'admin'))));
CREATE OR REPLACE FUNCTION public.fn_rotas_autorizacao() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE admin boolean:=coalesce(public.has_role(auth.uid(),'admin'),false); pendente date;
BEGIN
 IF TG_OP='DELETE' THEN
  IF NOT admin AND OLD.status NOT IN ('rascunho','reprovada','cancelada') THEN RAISE EXCEPTION 'Esta rota não pode ser apagada. Preste contas da viagem.'; END IF;
  RETURN OLD;
 END IF;
 IF NEW.status NOT IN ('rascunho','aguardando_aprovacao','aprovada','reprovada','concluida','cancelada') THEN RAISE EXCEPTION 'Status de rota inválido.'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'rascunho' THEN RAISE EXCEPTION 'Novas rotas devem nascer como rascunho.'; END IF;
  NEW.enviada_em:=NULL; NEW.aprovada_em:=NULL; NEW.aprovada_por:=NULL; NEW.motivo_reprovacao:=NULL; NEW.prestacao_concluida_em:=NULL;
  RETURN NEW;
 END IF;
 IF NEW.vendedor_id IS DISTINCT FROM OLD.vendedor_id THEN RAISE EXCEPTION 'O vendedor da rota não pode ser alterado.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.vendedor_id::text,731));
 IF NOT admin AND OLD.status IN ('concluida','cancelada') THEN RAISE EXCEPTION 'Esta rota está encerrada e não pode ser alterada.'; END IF;
 NEW.enviada_em:=OLD.enviada_em; NEW.aprovada_em:=OLD.aprovada_em; NEW.aprovada_por:=OLD.aprovada_por; NEW.prestacao_concluida_em:=OLD.prestacao_concluida_em;
 IF NOT admin THEN NEW.motivo_reprovacao:=OLD.motivo_reprovacao; END IF;
 IF OLD.status='aprovada' AND NEW.data_rota IS DISTINCT FROM OLD.data_rota THEN
  IF OLD.data_rota<current_date THEN RAISE EXCEPTION 'Preste contas antes de alterar uma viagem passada.'; END IF;
  NEW.status:='aguardando_aprovacao';
 END IF;
 IF NOT admin AND OLD.status='aguardando_aprovacao' AND NEW.data_rota IS DISTINCT FROM OLD.data_rota AND NEW.status<>'rascunho' THEN RAISE EXCEPTION 'Volte para rascunho antes de editar a data.'; END IF;
 IF NEW.status IS DISTINCT FROM OLD.status THEN
  IF NEW.status IN ('aprovada','reprovada') THEN
   IF NOT admin THEN RAISE EXCEPTION 'Somente admin pode aprovar ou reprovar uma rota.'; END IF;
   IF OLD.status<>'aguardando_aprovacao' THEN RAISE EXCEPTION 'A rota precisa estar aguardando aprovação.'; END IF;
   IF NEW.status='aprovada' THEN
    IF NEW.data_rota<current_date THEN RAISE EXCEPTION 'Não é possível aprovar uma viagem com data passada.'; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.rota_paradas WHERE rota_id=NEW.id) OR EXISTS(SELECT 1 FROM public.rota_paradas WHERE rota_id=NEW.id AND (nullif(btrim(objetivo),'') IS NULL OR (tipo='visita' AND organizacao_id IS NULL))) THEN RAISE EXCEPTION 'Complete o plano antes de aprovar.'; END IF;
    NEW.aprovada_em:=now(); NEW.aprovada_por:=auth.uid(); NEW.motivo_reprovacao:=NULL;
   ELSIF nullif(btrim(NEW.motivo_reprovacao),'') IS NULL THEN RAISE EXCEPTION 'Informe o motivo da reprovação.';
   END IF;
  ELSIF NEW.status='aguardando_aprovacao' THEN
   IF OLD.status NOT IN ('rascunho','reprovada','aprovada') THEN RAISE EXCEPTION 'Esta rota não pode ser enviada para aprovação.'; END IF;
   IF NEW.data_rota<current_date THEN RAISE EXCEPTION 'A data da rota deve ser hoje ou uma data futura.'; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.rota_paradas WHERE rota_id=NEW.id) THEN RAISE EXCEPTION 'Adicione ao menos uma parada.'; END IF;
   IF EXISTS(SELECT 1 FROM public.rota_paradas WHERE rota_id=NEW.id AND nullif(btrim(objetivo),'') IS NULL) THEN RAISE EXCEPTION 'Preencha o objetivo de todas as paradas.'; END IF;
   IF EXISTS(SELECT 1 FROM public.rota_paradas WHERE rota_id=NEW.id AND tipo='visita' AND organizacao_id IS NULL) THEN RAISE EXCEPTION 'Toda visita deve ter uma organização.'; END IF;
   SELECT min(data_rota) INTO pendente FROM public.rotas WHERE vendedor_id=NEW.vendedor_id AND id<>NEW.id AND status='aprovada' AND data_rota<current_date;
   IF pendente IS NOT NULL THEN RAISE EXCEPTION 'Preste contas da rota de % antes de pedir nova viagem.',to_char(pendente,'DD/MM'); END IF;
   NEW.enviada_em:=now(); NEW.aprovada_em:=NULL; NEW.aprovada_por:=NULL; NEW.motivo_reprovacao:=NULL;
  ELSIF NEW.status='concluida' THEN
   IF OLD.status<>'aprovada' OR NEW.data_rota>current_date THEN RAISE EXCEPTION 'Só é possível prestar contas de uma rota aprovada cuja data chegou.'; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.rota_paradas WHERE rota_id=NEW.id) OR EXISTS(SELECT 1 FROM public.rota_paradas WHERE rota_id=NEW.id AND (visitada IS NULL OR (visitada AND nullif(btrim(resultado),'') IS NULL) OR (NOT visitada AND nullif(btrim(motivo_nao_visita),'') IS NULL))) THEN RAISE EXCEPTION 'Informe todas as paradas: resultado da visita ou motivo de não visita.'; END IF;
   NEW.prestacao_concluida_em:=now();
  ELSIF NEW.status='rascunho' THEN
   IF OLD.status NOT IN ('aguardando_aprovacao','reprovada') THEN RAISE EXCEPTION 'Uma viagem aprovada não pode voltar para rascunho. Preste contas.'; END IF;
  ELSIF NEW.status='cancelada' THEN
   IF OLD.status='concluida' OR (OLD.status='aprovada' AND NOT admin) THEN RAISE EXCEPTION 'Somente admin pode cancelar uma viagem aprovada.'; END IF;
  END IF;
 END IF;
 NEW.updated_at:=now(); RETURN NEW;
END $$;
CREATE TRIGGER rotas_autorizacao BEFORE INSERT OR UPDATE OR DELETE ON public.rotas FOR EACH ROW EXECUTE FUNCTION public.fn_rotas_autorizacao();
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
CREATE TRIGGER paradas_protecao BEFORE INSERT OR UPDATE OR DELETE ON public.rota_paradas FOR EACH ROW EXECUTE FUNCTION public.fn_paradas_protecao();
CREATE OR REPLACE FUNCTION public.fn_paradas_reaprovacao() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE rid uuid; planejamento boolean;
BEGIN
 rid:=CASE WHEN TG_OP='DELETE' THEN OLD.rota_id ELSE NEW.rota_id END;
 planejamento:=TG_OP IN ('INSERT','DELETE');
 IF TG_OP='UPDATE' THEN planejamento:=ROW(NEW.organizacao_id,NEW.oportunidade_id,NEW.cidade,NEW.estado,NEW.ordem,NEW.objetivo,NEW.tipo,NEW.latitude,NEW.longitude,NEW.atividade_id) IS DISTINCT FROM ROW(OLD.organizacao_id,OLD.oportunidade_id,OLD.cidade,OLD.estado,OLD.ordem,OLD.objetivo,OLD.tipo,OLD.latitude,OLD.longitude,OLD.atividade_id); END IF;
 IF planejamento THEN UPDATE public.rotas SET status='aguardando_aprovacao' WHERE id=rid AND status='aprovada' AND data_rota>=current_date; END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER paradas_reaprovacao AFTER INSERT OR UPDATE OR DELETE ON public.rota_paradas FOR EACH ROW EXECUTE FUNCTION public.fn_paradas_reaprovacao();
REVOKE ALL ON FUNCTION public.fn_rotas_autorizacao(),public.fn_paradas_protecao(),public.fn_paradas_reaprovacao() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_rotas_autorizacao(),public.fn_paradas_protecao(),public.fn_paradas_reaprovacao() TO service_role;
CREATE INDEX IF NOT EXISTS rotas_vendedor_status_data_idx ON public.rotas(vendedor_id,status,data_rota);
CREATE INDEX IF NOT EXISTS rota_paradas_rota_idx ON public.rota_paradas(rota_id);