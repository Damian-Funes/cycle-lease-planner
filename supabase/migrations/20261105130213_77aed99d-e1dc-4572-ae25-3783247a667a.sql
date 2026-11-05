CREATE TABLE IF NOT EXISTS public.rota_pernoites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rota_id uuid NOT NULL REFERENCES public.rotas(id) ON DELETE CASCADE,
  noite date NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('hotel','sem_custo','voltou_base')),
  cidade text,
  estado text,
  latitude numeric,
  longitude numeric,
  hotel_nome text,
  gasto_id uuid REFERENCES public.rota_gastos(id),
  observacao text,
  autor_id uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rota_id, noite)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rota_pernoites TO authenticated;
GRANT ALL ON public.rota_pernoites TO service_role;
ALTER TABLE public.rota_pernoites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pernoites_ver ON public.rota_pernoites;
CREATE POLICY pernoites_ver ON public.rota_pernoites FOR SELECT TO authenticated
  USING (public.fn_pode_ver_rota(auth.uid(), rota_id));
DROP POLICY IF EXISTS pernoites_inserir ON public.rota_pernoites;
CREATE POLICY pernoites_inserir ON public.rota_pernoites FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR (autor_id = auth.uid() AND public.fn_pode_lancar_gasto(auth.uid(), rota_id)));
DROP POLICY IF EXISTS pernoites_alterar ON public.rota_pernoites;
CREATE POLICY pernoites_alterar ON public.rota_pernoites FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR (autor_id = auth.uid() AND public.fn_pode_lancar_gasto(auth.uid(), rota_id)))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR (autor_id = auth.uid() AND public.fn_pode_lancar_gasto(auth.uid(), rota_id)));
DROP POLICY IF EXISTS pernoites_apagar ON public.rota_pernoites;
CREATE POLICY pernoites_apagar ON public.rota_pernoites FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR (autor_id = auth.uid() AND public.fn_pode_lancar_gasto(auth.uid(), rota_id)));

CREATE OR REPLACE FUNCTION public.fn_pernoites_validar() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r public.rotas;
BEGIN
  IF TG_OP = 'UPDATE' THEN NEW.rota_id := OLD.rota_id; NEW.autor_id := OLD.autor_id; END IF;
  SELECT * INTO r FROM public.rotas WHERE id = NEW.rota_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Viagem não encontrada.'; END IF;
  IF NEW.noite < r.data_inicio OR NEW.noite >= r.data_fim THEN RAISE EXCEPTION 'A noite precisa estar dentro do período da viagem.'; END IF;
  NEW.estado := upper(nullif(btrim(NEW.estado),''));
  IF NEW.tipo IN ('hotel','sem_custo') AND (nullif(btrim(NEW.cidade),'') IS NULL OR coalesce(NEW.estado,'') !~ '^[A-Z]{2}$') THEN
    RAISE EXCEPTION 'Informe cidade e UF de onde dormiu.'; END IF;
  IF NEW.tipo = 'hotel' THEN
    IF nullif(btrim(NEW.hotel_nome),'') IS NULL THEN RAISE EXCEPTION 'Informe o nome do hotel.'; END IF;
    IF NEW.gasto_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.rota_gastos g WHERE g.id = NEW.gasto_id AND g.rota_id = NEW.rota_id AND g.categoria = 'hotel' AND g.arquivo_path IS NOT NULL) THEN
      RAISE EXCEPTION 'Pernoite em hotel precisa do gasto de hotel com a foto da nota.'; END IF;
  ELSIF nullif(btrim(NEW.observacao),'') IS NULL THEN
    RAISE EXCEPTION 'Explique por que não houve hotel nesta noite.';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_pernoites_validar ON public.rota_pernoites;
CREATE TRIGGER trg_pernoites_validar BEFORE INSERT OR UPDATE ON public.rota_pernoites
  FOR EACH ROW EXECUTE FUNCTION public.fn_pernoites_validar();

CREATE OR REPLACE FUNCTION public.fn_paradas_protecao() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE r public.rotas; planejamento boolean; admin boolean:=coalesce(public.has_role(auth.uid(),'admin'),false); hoje date:=(now() AT TIME ZONE 'America/Sao_Paulo')::date; prestou boolean:=false;
BEGIN
 IF TG_OP='UPDATE' AND NEW.rota_id IS DISTINCT FROM OLD.rota_id THEN RAISE EXCEPTION 'Não é permitido transferir paradas entre rotas.'; END IF;
 SELECT * INTO r FROM public.rotas WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.rota_id ELSE NEW.rota_id END FOR UPDATE;
 IF NOT FOUND THEN IF TG_OP='DELETE' THEN RETURN OLD; END IF; RAISE EXCEPTION 'Rota não encontrada.'; END IF;
 IF NOT admin AND r.status IN ('concluida','cancelada') THEN RAISE EXCEPTION 'Paradas de uma rota encerrada não podem ser alteradas.'; END IF;
 IF TG_OP='INSERT' AND NEW.tipo='pernoite' THEN RAISE EXCEPTION 'Pernoites são registrados durante a viagem, não no planejamento.'; END IF;
 planejamento:=TG_OP IN ('INSERT','DELETE');
 IF TG_OP='UPDATE' THEN planejamento:=ROW(NEW.organizacao_id,NEW.oportunidade_id,NEW.cidade,NEW.estado,NEW.ordem,NEW.objetivo,NEW.tipo,NEW.latitude,NEW.longitude,NEW.atividade_id) IS DISTINCT FROM ROW(OLD.organizacao_id,OLD.oportunidade_id,OLD.cidade,OLD.estado,OLD.ordem,OLD.objetivo,OLD.tipo,OLD.latitude,OLD.longitude,OLD.atividade_id); END IF;
 IF planejamento AND NOT admin AND r.status='aprovada' AND coalesce(r.data_fim,r.data_rota)<hoje THEN RAISE EXCEPTION 'O plano de uma viagem passada não pode ser alterado. Preste contas.'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF (TG_OP='INSERT' AND (NEW.visitada IS NOT NULL OR NEW.resultado IS NOT NULL OR NEW.motivo_nao_visita IS NOT NULL)) OR (TG_OP='UPDATE' AND ROW(NEW.visitada,NEW.resultado,NEW.motivo_nao_visita) IS DISTINCT FROM ROW(OLD.visitada,OLD.resultado,OLD.motivo_nao_visita)) THEN
   IF NOT admin AND (r.status<>'aprovada' OR coalesce(r.data_inicio,r.data_rota)>hoje) THEN RAISE EXCEPTION 'Preste contas somente na data de uma viagem aprovada.'; END IF;
   prestou:=true;
   NEW.informada_em:=CASE WHEN NEW.visitada IS NULL THEN NULL ELSE now() END;
 ELSIF TG_OP='UPDATE' THEN NEW.informada_em:=OLD.informada_em; ELSE NEW.informada_em:=NULL; END IF;
 IF prestou THEN
   NEW.dia := CASE WHEN NEW.visitada IS NULL THEN NULL
                   ELSE least(greatest(hoje, coalesce(r.data_inicio,r.data_rota)), coalesce(r.data_fim,r.data_rota)) END;
 ELSIF TG_OP='UPDATE' AND NOT admin THEN NEW.dia := OLD.dia;
 ELSIF TG_OP='INSERT' THEN NEW.dia := NULL;
 END IF;
 IF NEW.dia IS NOT NULL AND (NEW.dia < coalesce(r.data_inicio,r.data_rota) OR NEW.dia > coalesce(r.data_fim,r.data_rota)) THEN RAISE EXCEPTION 'O dia da parada precisa estar dentro do período da viagem.'; END IF;
 RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_paradas_reaprovacao() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE rid uuid; planejamento boolean;
BEGIN
 rid:=CASE WHEN TG_OP='DELETE' THEN OLD.rota_id ELSE NEW.rota_id END;
 planejamento:=TG_OP IN ('INSERT','DELETE');
 IF TG_OP='UPDATE' THEN planejamento:=ROW(NEW.organizacao_id,NEW.oportunidade_id,NEW.cidade,NEW.estado,NEW.ordem,NEW.objetivo,NEW.tipo,NEW.latitude,NEW.longitude,NEW.atividade_id) IS DISTINCT FROM ROW(OLD.organizacao_id,OLD.oportunidade_id,OLD.cidade,OLD.estado,OLD.ordem,OLD.objetivo,OLD.tipo,OLD.latitude,OLD.longitude,OLD.atividade_id); END IF;
 IF planejamento THEN UPDATE public.rotas SET status='aguardando_aprovacao' WHERE id=rid AND status='aprovada' AND coalesce(data_fim,data_rota)>=(now() AT TIME ZONE 'America/Sao_Paulo')::date; END IF;
 RETURN NULL;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_rotas_autorizacao() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE admin boolean:=coalesce(public.has_role(auth.uid(),'admin'),false); pendente date; hoje date:=(now() AT TIME ZONE 'America/Sao_Paulo')::date; periodo_mudou boolean; sem_noite date;
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
 periodo_mudou := NEW.data_inicio IS DISTINCT FROM OLD.data_inicio OR NEW.data_fim IS DISTINCT FROM OLD.data_fim OR NEW.veiculo_id IS DISTINCT FROM OLD.veiculo_id;
 IF OLD.status='aprovada' AND periodo_mudou THEN
  IF coalesce(OLD.data_fim,OLD.data_rota)<hoje THEN RAISE EXCEPTION 'Preste contas antes de alterar uma viagem passada.'; END IF;
  NEW.status:='aguardando_aprovacao';
 END IF;
 IF NOT admin AND OLD.status='aguardando_aprovacao' AND periodo_mudou AND NEW.status<>'rascunho' THEN RAISE EXCEPTION 'Volte para rascunho antes de editar a data.'; END IF;
 IF NEW.status IS DISTINCT FROM OLD.status THEN
  IF NEW.status IN ('aprovada','reprovada') THEN
   IF NOT admin THEN RAISE EXCEPTION 'Somente admin pode aprovar ou reprovar uma rota.'; END IF;
   IF OLD.status<>'aguardando_aprovacao' THEN RAISE EXCEPTION 'A rota precisa estar aguardando aprovação.'; END IF;
   IF NEW.status='aprovada' THEN
    IF NEW.data_fim<hoje THEN RAISE EXCEPTION 'Não é possível aprovar uma viagem com data passada.'; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.rota_paradas WHERE rota_id=NEW.id AND tipo<>'pernoite') OR EXISTS(SELECT 1 FROM public.rota_paradas WHERE rota_id=NEW.id AND tipo<>'pernoite' AND (nullif(btrim(objetivo),'') IS NULL OR (tipo='visita' AND organizacao_id IS NULL))) THEN RAISE EXCEPTION 'Complete o plano antes de aprovar.'; END IF;
    NEW.aprovada_em:=now(); NEW.aprovada_por:=auth.uid(); NEW.motivo_reprovacao:=NULL;
   ELSIF nullif(btrim(NEW.motivo_reprovacao),'') IS NULL THEN RAISE EXCEPTION 'Informe o motivo da reprovação.';
   END IF;
  ELSIF NEW.status='aguardando_aprovacao' THEN
   IF OLD.status NOT IN ('rascunho','reprovada','aprovada') THEN RAISE EXCEPTION 'Esta rota não pode ser enviada para aprovação.'; END IF;
   IF NEW.data_fim<hoje THEN RAISE EXCEPTION 'A data da rota deve ser hoje ou uma data futura.'; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.rota_paradas WHERE rota_id=NEW.id AND tipo<>'pernoite') THEN RAISE EXCEPTION 'Adicione ao menos uma parada.'; END IF;
   IF EXISTS(SELECT 1 FROM public.rota_paradas WHERE rota_id=NEW.id AND tipo<>'pernoite' AND nullif(btrim(objetivo),'') IS NULL) THEN RAISE EXCEPTION 'Preencha o objetivo de todas as paradas.'; END IF;
   IF EXISTS(SELECT 1 FROM public.rota_paradas WHERE rota_id=NEW.id AND tipo='visita' AND organizacao_id IS NULL) THEN RAISE EXCEPTION 'Toda visita deve ter uma organização.'; END IF;
   SELECT min(coalesce(data_fim,data_rota)) INTO pendente FROM public.rotas WHERE vendedor_id=NEW.vendedor_id AND id<>NEW.id AND status='aprovada' AND coalesce(data_fim,data_rota)<hoje;
   IF pendente IS NOT NULL THEN RAISE EXCEPTION 'Preste contas da rota de % antes de pedir nova viagem.',to_char(pendente,'DD/MM'); END IF;
   NEW.enviada_em:=now(); NEW.aprovada_em:=NULL; NEW.aprovada_por:=NULL; NEW.motivo_reprovacao:=NULL;
  ELSIF NEW.status='concluida' THEN
   IF OLD.status<>'aprovada' OR NEW.data_inicio>hoje THEN RAISE EXCEPTION 'Só é possível prestar contas de uma rota aprovada cuja data chegou.'; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.rota_paradas WHERE rota_id=NEW.id AND tipo<>'pernoite') OR EXISTS(SELECT 1 FROM public.rota_paradas WHERE rota_id=NEW.id AND tipo<>'pernoite' AND (visitada IS NULL OR (visitada AND nullif(btrim(resultado),'') IS NULL) OR (NOT visitada AND nullif(btrim(motivo_nao_visita),'') IS NULL))) THEN RAISE EXCEPTION 'Informe todas as paradas: resultado da visita ou motivo de não visita.'; END IF;
   SELECT min(n::date) INTO sem_noite FROM generate_series(NEW.data_inicio, NEW.data_fim - 1, interval '1 day') n
     WHERE NOT EXISTS (SELECT 1 FROM public.rota_pernoites p WHERE p.rota_id=NEW.id AND p.noite=n::date);
   IF sem_noite IS NOT NULL THEN RAISE EXCEPTION 'Registre onde dormiu na noite de %.', to_char(sem_noite,'DD/MM'); END IF;
   NEW.prestacao_concluida_em:=now();
  ELSIF NEW.status='rascunho' THEN
   IF OLD.status NOT IN ('aguardando_aprovacao','reprovada') THEN RAISE EXCEPTION 'Uma viagem aprovada não pode voltar para rascunho. Preste contas.'; END IF;
  ELSIF NEW.status='cancelada' THEN
   IF OLD.status='concluida' OR (OLD.status='aprovada' AND NOT admin) THEN RAISE EXCEPTION 'Somente admin pode cancelar uma viagem aprovada.'; END IF;
  END IF;
 END IF;
 NEW.updated_at:=now(); RETURN NEW;
END $function$;

ALTER TABLE public.rota_paradas DISABLE TRIGGER USER;
UPDATE public.rota_paradas SET dia = NULL WHERE visitada IS NULL AND dia IS NOT NULL;
UPDATE public.rota_paradas p SET dia = (p.informada_em AT TIME ZONE 'America/Sao_Paulo')::date
  WHERE p.visitada IS NOT NULL AND p.informada_em IS NOT NULL
    AND p.dia IS DISTINCT FROM (p.informada_em AT TIME ZONE 'America/Sao_Paulo')::date;
ALTER TABLE public.rota_paradas ENABLE TRIGGER USER;