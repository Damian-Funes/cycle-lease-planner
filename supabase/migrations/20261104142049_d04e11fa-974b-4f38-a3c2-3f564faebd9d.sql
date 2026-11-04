-- Viagens: período, pernoite, veículos e custo estimado (etapa 1)
ALTER TABLE public.rotas
  ADD COLUMN IF NOT EXISTS data_inicio date,
  ADD COLUMN IF NOT EXISTS data_fim date,
  ADD COLUMN IF NOT EXISTS veiculo_id uuid,
  ADD COLUMN IF NOT EXISTS alimentacao_dia_estimada numeric,
  ADD COLUMN IF NOT EXISTS custo_combustivel_est numeric,
  ADD COLUMN IF NOT EXISTS custo_pedagio_est numeric,
  ADD COLUMN IF NOT EXISTS custo_hospedagem_est numeric,
  ADD COLUMN IF NOT EXISTS custo_alimentacao_est numeric,
  ADD COLUMN IF NOT EXISTS custo_total_est numeric,
  ADD COLUMN IF NOT EXISTS tempo_total_estimado_s integer,
  ADD COLUMN IF NOT EXISTS pedagio_consultado_em timestamptz,
  ADD COLUMN IF NOT EXISTS pedagio_assinatura text,
  ADD COLUMN IF NOT EXISTS pedagio_detalhe jsonb;

ALTER TABLE public.rota_paradas
  ADD COLUMN IF NOT EXISTS dia date,
  ADD COLUMN IF NOT EXISTS hotel_nome text,
  ADD COLUMN IF NOT EXISTS valor_diaria_est numeric;

-- Backfill sem disparar as travas (rotas antigas = 1 dia)
ALTER TABLE public.rotas DISABLE TRIGGER USER;
ALTER TABLE public.rota_paradas DISABLE TRIGGER USER;
UPDATE public.rotas SET data_inicio=data_rota WHERE data_inicio IS NULL;
UPDATE public.rotas SET data_fim=data_inicio WHERE data_fim IS NULL;
UPDATE public.rota_paradas p SET dia=r.data_inicio FROM public.rotas r WHERE r.id=p.rota_id AND p.dia IS NULL;
ALTER TABLE public.rotas ENABLE TRIGGER USER;
ALTER TABLE public.rota_paradas ENABLE TRIGGER USER;

-- Veículos
CREATE TABLE IF NOT EXISTS public.veiculos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modelo text NOT NULL,
  combustivel text NOT NULL,
  consumo_km_l numeric NOT NULL,
  placa text,
  vendedor_id uuid,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.veiculos TO authenticated;
GRANT ALL ON public.veiculos TO service_role;
ALTER TABLE public.veiculos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS veiculos_select ON public.veiculos;
CREATE POLICY veiculos_select ON public.veiculos FOR SELECT TO authenticated USING (public.is_approved(auth.uid()));
DROP POLICY IF EXISTS veiculos_admin_write ON public.veiculos;
CREATE POLICY veiculos_admin_write ON public.veiculos FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='rotas_veiculo_fk') THEN
    ALTER TABLE public.rotas ADD CONSTRAINT rotas_veiculo_fk FOREIGN KEY (veiculo_id) REFERENCES public.veiculos(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Parâmetros de viagem (linha única)
CREATE TABLE IF NOT EXISTS public.viagem_parametros (
  id text PRIMARY KEY DEFAULT 'padrao',
  preco_diesel numeric NOT NULL DEFAULT 6.20,
  preco_gasolina numeric NOT NULL DEFAULT 6.30,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.viagem_parametros TO authenticated;
GRANT ALL ON public.viagem_parametros TO service_role;
ALTER TABLE public.viagem_parametros ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS viagem_parametros_select ON public.viagem_parametros;
CREATE POLICY viagem_parametros_select ON public.viagem_parametros FOR SELECT TO authenticated USING (public.is_approved(auth.uid()));
DROP POLICY IF EXISTS viagem_parametros_admin_write ON public.viagem_parametros;
CREATE POLICY viagem_parametros_admin_write ON public.viagem_parametros FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
INSERT INTO public.viagem_parametros(id) VALUES ('padrao') ON CONFLICT DO NOTHING;

-- Validações de veículo / parâmetros
CREATE OR REPLACE FUNCTION public.fn_validar_viagem_cadastros() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF TG_TABLE_NAME='veiculos' THEN
    IF NEW.combustivel NOT IN ('diesel','gasolina') THEN RAISE EXCEPTION 'Combustível deve ser diesel ou gasolina.'; END IF;
    IF NEW.consumo_km_l <= 0 OR NEW.consumo_km_l > 50 THEN RAISE EXCEPTION 'Consumo inválido.'; END IF;
    IF nullif(btrim(NEW.modelo),'') IS NULL THEN RAISE EXCEPTION 'Informe o modelo.'; END IF;
  ELSE
    IF NEW.preco_diesel <= 0 OR NEW.preco_gasolina <= 0 THEN RAISE EXCEPTION 'Preço do combustível inválido.'; END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_veiculos_validar ON public.veiculos;
CREATE TRIGGER trg_veiculos_validar BEFORE INSERT OR UPDATE ON public.veiculos FOR EACH ROW EXECUTE FUNCTION public.fn_validar_viagem_cadastros();
DROP TRIGGER IF EXISTS trg_viagem_parametros_validar ON public.viagem_parametros;
CREATE TRIGGER trg_viagem_parametros_validar BEFORE INSERT OR UPDATE ON public.viagem_parametros FOR EACH ROW EXECUTE FUNCTION public.fn_validar_viagem_cadastros();

-- Seed dos veículos atuais
INSERT INTO public.veiculos(modelo, combustivel, consumo_km_l, vendedor_id)
SELECT v.modelo, v.comb, v.cons, v.uid::uuid FROM (VALUES
  ('S10','diesel',11.5,'0488a4f9-5a4a-4cac-a564-beec5fb21757'),
  ('S10','diesel',11.5,'2555cff8-3ac8-4525-bf38-6198dc85c887'),
  ('Toro','gasolina',10,'14138b1c-5b33-4a66-b0f0-fc06e58da561')
) v(modelo,comb,cons,uid)
WHERE NOT EXISTS (SELECT 1 FROM public.veiculos x WHERE x.vendedor_id=v.uid::uuid);

-- Período da rota: data_rota sempre = data_inicio; roda antes de rotas_autorizacao (ordem alfabética)
CREATE OR REPLACE FUNCTION public.fn_rotas_periodo() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE servico boolean := coalesce(current_setting('request.jwt.claim.role', true),'') = 'service_role'
  OR coalesce((nullif(current_setting('request.jwt.claims', true),'')::jsonb)->>'role','') = 'service_role';
BEGIN
  IF TG_OP='INSERT' THEN
    NEW.data_inicio := coalesce(NEW.data_inicio, NEW.data_rota);
  ELSIF NEW.data_inicio IS NOT DISTINCT FROM OLD.data_inicio AND NEW.data_rota IS DISTINCT FROM OLD.data_rota THEN
    -- telas antigas que só mexem em data_rota: move o período inteiro
    NEW.data_fim := coalesce(NEW.data_fim, OLD.data_fim) + (NEW.data_rota - OLD.data_rota);
    NEW.data_inicio := NEW.data_rota;
  END IF;
  IF NEW.data_inicio IS NULL THEN RAISE EXCEPTION 'Informe a data de início da viagem.'; END IF;
  NEW.data_rota := NEW.data_inicio;
  NEW.data_fim := coalesce(NEW.data_fim, NEW.data_inicio);
  IF NEW.data_fim < NEW.data_inicio THEN RAISE EXCEPTION 'A data de fim não pode ser antes do início.'; END IF;
  IF NEW.data_fim - NEW.data_inicio > 14 THEN RAISE EXCEPTION 'Uma viagem pode ter no máximo 15 dias.'; END IF;
  IF NEW.alimentacao_dia_estimada IS NOT NULL AND NEW.alimentacao_dia_estimada < 0 THEN RAISE EXCEPTION 'Alimentação estimada inválida.'; END IF;
  -- Pedágio só é gravado pela função do servidor
  IF NOT servico THEN
    IF TG_OP='INSERT' THEN
      NEW.custo_pedagio_est:=NULL; NEW.pedagio_consultado_em:=NULL; NEW.pedagio_assinatura:=NULL; NEW.pedagio_detalhe:=NULL;
    ELSE
      NEW.custo_pedagio_est:=OLD.custo_pedagio_est; NEW.pedagio_consultado_em:=OLD.pedagio_consultado_em;
      NEW.pedagio_assinatura:=OLD.pedagio_assinatura; NEW.pedagio_detalhe:=OLD.pedagio_detalhe;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS a_rotas_periodo ON public.rotas;
CREATE TRIGGER a_rotas_periodo BEFORE INSERT OR UPDATE ON public.rotas FOR EACH ROW EXECUTE FUNCTION public.fn_rotas_periodo();

-- Autorização: mesmas regras, "data passada" passa a ser a data de FIM
CREATE OR REPLACE FUNCTION public.fn_rotas_autorizacao()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE admin boolean:=coalesce(public.has_role(auth.uid(),'admin'),false); pendente date; hoje date:=(now() AT TIME ZONE 'America/Sao_Paulo')::date; periodo_mudou boolean;
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
    IF NOT EXISTS(SELECT 1 FROM public.rota_paradas WHERE rota_id=NEW.id) OR EXISTS(SELECT 1 FROM public.rota_paradas WHERE rota_id=NEW.id AND (nullif(btrim(objetivo),'') IS NULL OR (tipo='visita' AND organizacao_id IS NULL))) THEN RAISE EXCEPTION 'Complete o plano antes de aprovar.'; END IF;
    NEW.aprovada_em:=now(); NEW.aprovada_por:=auth.uid(); NEW.motivo_reprovacao:=NULL;
   ELSIF nullif(btrim(NEW.motivo_reprovacao),'') IS NULL THEN RAISE EXCEPTION 'Informe o motivo da reprovação.';
   END IF;
  ELSIF NEW.status='aguardando_aprovacao' THEN
   IF OLD.status NOT IN ('rascunho','reprovada','aprovada') THEN RAISE EXCEPTION 'Esta rota não pode ser enviada para aprovação.'; END IF;
   IF NEW.data_fim<hoje THEN RAISE EXCEPTION 'A data da rota deve ser hoje ou uma data futura.'; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.rota_paradas WHERE rota_id=NEW.id) THEN RAISE EXCEPTION 'Adicione ao menos uma parada.'; END IF;
   IF EXISTS(SELECT 1 FROM public.rota_paradas WHERE rota_id=NEW.id AND nullif(btrim(objetivo),'') IS NULL) THEN RAISE EXCEPTION 'Preencha o objetivo de todas as paradas.'; END IF;
   IF EXISTS(SELECT 1 FROM public.rota_paradas WHERE rota_id=NEW.id AND tipo='visita' AND organizacao_id IS NULL) THEN RAISE EXCEPTION 'Toda visita deve ter uma organização.'; END IF;
   IF EXISTS(SELECT 1 FROM public.rota_paradas WHERE rota_id=NEW.id AND tipo='pernoite' AND (nullif(btrim(hotel_nome),'') IS NULL OR valor_diaria_est IS NULL)) THEN RAISE EXCEPTION 'Informe hotel e valor da diária em todos os pernoites.'; END IF;
   SELECT min(coalesce(data_fim,data_rota)) INTO pendente FROM public.rotas WHERE vendedor_id=NEW.vendedor_id AND id<>NEW.id AND status='aprovada' AND coalesce(data_fim,data_rota)<hoje;
   IF pendente IS NOT NULL THEN RAISE EXCEPTION 'Preste contas da rota de % antes de pedir nova viagem.',to_char(pendente,'DD/MM'); END IF;
   NEW.enviada_em:=now(); NEW.aprovada_em:=NULL; NEW.aprovada_por:=NULL; NEW.motivo_reprovacao:=NULL;
  ELSIF NEW.status='concluida' THEN
   IF OLD.status<>'aprovada' OR NEW.data_inicio>hoje THEN RAISE EXCEPTION 'Só é possível prestar contas de uma rota aprovada cuja data chegou.'; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.rota_paradas WHERE rota_id=NEW.id AND tipo<>'pernoite') OR EXISTS(SELECT 1 FROM public.rota_paradas WHERE rota_id=NEW.id AND tipo<>'pernoite' AND (visitada IS NULL OR (visitada AND nullif(btrim(resultado),'') IS NULL) OR (NOT visitada AND nullif(btrim(motivo_nao_visita),'') IS NULL))) THEN RAISE EXCEPTION 'Informe todas as paradas: resultado da visita ou motivo de não visita.'; END IF;
   NEW.prestacao_concluida_em:=now();
  ELSIF NEW.status='rascunho' THEN
   IF OLD.status NOT IN ('aguardando_aprovacao','reprovada') THEN RAISE EXCEPTION 'Uma viagem aprovada não pode voltar para rascunho. Preste contas.'; END IF;
  ELSIF NEW.status='cancelada' THEN
   IF OLD.status='concluida' OR (OLD.status='aprovada' AND NOT admin) THEN RAISE EXCEPTION 'Somente admin pode cancelar uma viagem aprovada.'; END IF;
  END IF;
 END IF;
 NEW.updated_at:=now(); RETURN NEW;
END $function$;

-- Paradas: dia padrão = início e dentro do período; pernoite sem prestação
CREATE OR REPLACE FUNCTION public.fn_paradas_protecao()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r public.rotas; planejamento boolean; admin boolean:=coalesce(public.has_role(auth.uid(),'admin'),false); hoje date:=(now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
 IF TG_OP='UPDATE' AND NEW.rota_id IS DISTINCT FROM OLD.rota_id THEN RAISE EXCEPTION 'Não é permitido transferir paradas entre rotas.'; END IF;
 SELECT * INTO r FROM public.rotas WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.rota_id ELSE NEW.rota_id END FOR UPDATE;
 IF NOT FOUND THEN IF TG_OP='DELETE' THEN RETURN OLD; END IF; RAISE EXCEPTION 'Rota não encontrada.'; END IF;
 IF NOT admin AND r.status IN ('concluida','cancelada') THEN RAISE EXCEPTION 'Paradas de uma rota encerrada não podem ser alteradas.'; END IF;
 IF TG_OP<>'DELETE' THEN
  NEW.dia := coalesce(NEW.dia, r.data_inicio, r.data_rota);
  IF NEW.dia < coalesce(r.data_inicio,r.data_rota) OR NEW.dia > coalesce(r.data_fim,r.data_rota) THEN RAISE EXCEPTION 'O dia da parada precisa estar dentro do período da viagem.'; END IF;
  IF NEW.valor_diaria_est IS NOT NULL AND NEW.valor_diaria_est < 0 THEN RAISE EXCEPTION 'Valor da diária inválido.'; END IF;
 END IF;
 planejamento:=TG_OP IN ('INSERT','DELETE');
 IF TG_OP='UPDATE' THEN planejamento:=ROW(NEW.organizacao_id,NEW.oportunidade_id,NEW.cidade,NEW.estado,NEW.ordem,NEW.objetivo,NEW.tipo,NEW.latitude,NEW.longitude,NEW.atividade_id,NEW.dia,NEW.hotel_nome,NEW.valor_diaria_est) IS DISTINCT FROM ROW(OLD.organizacao_id,OLD.oportunidade_id,OLD.cidade,OLD.estado,OLD.ordem,OLD.objetivo,OLD.tipo,OLD.latitude,OLD.longitude,OLD.atividade_id,OLD.dia,OLD.hotel_nome,OLD.valor_diaria_est); END IF;
 IF planejamento AND NOT admin AND r.status='aprovada' AND coalesce(r.data_fim,r.data_rota)<hoje THEN RAISE EXCEPTION 'O plano de uma viagem passada não pode ser alterado. Preste contas.'; END IF;
 IF TG_OP<>'DELETE' THEN
  IF (TG_OP='INSERT' AND (NEW.visitada IS NOT NULL OR NEW.resultado IS NOT NULL OR NEW.motivo_nao_visita IS NOT NULL)) OR (TG_OP='UPDATE' AND ROW(NEW.visitada,NEW.resultado,NEW.motivo_nao_visita) IS DISTINCT FROM ROW(OLD.visitada,OLD.resultado,OLD.motivo_nao_visita)) THEN
   IF NOT admin AND (r.status<>'aprovada' OR coalesce(r.data_inicio,r.data_rota)>hoje) THEN RAISE EXCEPTION 'Preste contas somente na data de uma viagem aprovada.'; END IF;
   NEW.informada_em:=CASE WHEN NEW.visitada IS NULL THEN NULL ELSE now() END;
  ELSIF TG_OP='UPDATE' THEN NEW.informada_em:=OLD.informada_em; ELSE NEW.informada_em:=NULL; END IF;
  RETURN NEW;
 END IF;
 RETURN OLD;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_paradas_reaprovacao()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE rid uuid; planejamento boolean;
BEGIN
 rid:=CASE WHEN TG_OP='DELETE' THEN OLD.rota_id ELSE NEW.rota_id END;
 planejamento:=TG_OP IN ('INSERT','DELETE');
 IF TG_OP='UPDATE' THEN planejamento:=ROW(NEW.organizacao_id,NEW.oportunidade_id,NEW.cidade,NEW.estado,NEW.ordem,NEW.objetivo,NEW.tipo,NEW.latitude,NEW.longitude,NEW.atividade_id,NEW.dia,NEW.hotel_nome,NEW.valor_diaria_est) IS DISTINCT FROM ROW(OLD.organizacao_id,OLD.oportunidade_id,OLD.cidade,OLD.estado,OLD.ordem,OLD.objetivo,OLD.tipo,OLD.latitude,OLD.longitude,OLD.atividade_id,OLD.dia,OLD.hotel_nome,OLD.valor_diaria_est); END IF;
 IF planejamento THEN UPDATE public.rotas SET status='aguardando_aprovacao' WHERE id=rid AND status='aprovada' AND coalesce(data_fim,data_rota)>=(now() AT TIME ZONE 'America/Sao_Paulo')::date; END IF;
 RETURN NULL;
END $function$;

REVOKE ALL ON FUNCTION public.fn_paradas_protecao() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.fn_paradas_reaprovacao() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.fn_rotas_autorizacao() FROM PUBLIC,anon,authenticated;

CREATE INDEX IF NOT EXISTS rotas_vendedor_status_fim_idx ON public.rotas(vendedor_id,status,data_fim);
CREATE INDEX IF NOT EXISTS rota_paradas_rota_dia_idx ON public.rota_paradas(rota_id,dia,ordem);