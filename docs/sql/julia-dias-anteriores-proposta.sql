-- PROPOSTA SOMENTE: NÃO EXECUTADA. Aplicar só após aprovação do CEO.
-- 1) Dias "sem visita" (deslocamento/folga) para a Júlia e o app não cobrarem o dia de novo.
-- 2) julia_registrar_voz: pernoite de uma noite específica (p_dados.noite) e ação registrar_dia_sem_visita.
-- 3) push_regras: fechou: e naofechou: (respeitam silêncio); caiu: já existe como urgente.

CREATE TABLE public.rota_dias_sem_visita (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rota_id uuid NOT NULL REFERENCES public.rotas(id) ON DELETE CASCADE,
  dia date NOT NULL,
  motivo text NOT NULL,
  observacao text,
  autor_id uuid NOT NULL,
  origem text NOT NULL DEFAULT 'app',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rota_id, dia)
);
GRANT SELECT, INSERT, DELETE ON public.rota_dias_sem_visita TO authenticated;
GRANT ALL ON public.rota_dias_sem_visita TO service_role;
ALTER TABLE public.rota_dias_sem_visita ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ver dias sem visita" ON public.rota_dias_sem_visita FOR SELECT TO authenticated
  USING (public.fn_pode_ver_rota(auth.uid(), rota_id));
CREATE POLICY "registrar dia sem visita" ON public.rota_dias_sem_visita FOR INSERT TO authenticated
  WITH CHECK (autor_id = auth.uid() AND public.fn_pode_escrever_diario(auth.uid(), rota_id));
CREATE POLICY "admin remove dia sem visita" ON public.rota_dias_sem_visita FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Validação: dia dentro da viagem e já passado (BRT), motivo conhecido, sem visita contabilizada nesse dia,
-- só dono da rota ou admin (o servidor da Júlia grava com autor = vendedor da ligação).
CREATE OR REPLACE FUNCTION public.fn_dias_sem_visita_validar() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.rotas;
BEGIN
  SELECT * INTO r FROM public.rotas WHERE id = NEW.rota_id;
  IF NOT FOUND OR r.status <> 'aprovada' THEN RAISE EXCEPTION 'Viagem não aprovada.'; END IF;
  IF NEW.dia < r.data_inicio OR NEW.dia > r.data_fim THEN RAISE EXCEPTION 'Dia fora da viagem.'; END IF;
  IF NEW.dia >= (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN RAISE EXCEPTION 'Só dias anteriores podem ser marcados sem visita.'; END IF;
  IF NEW.motivo NOT IN ('deslocamento','folga','outro') THEN RAISE EXCEPTION 'Motivo inválido.'; END IF;
  IF NEW.motivo = 'outro' AND nullif(btrim(coalesce(NEW.observacao,'')),'') IS NULL THEN RAISE EXCEPTION 'Explique o motivo na observação.'; END IF;
  IF NEW.autor_id <> r.vendedor_id AND NOT public.has_role(NEW.autor_id, 'admin') THEN RAISE EXCEPTION 'Só o vendedor da viagem ou admin.'; END IF;
  IF EXISTS (SELECT 1 FROM public.rota_paradas p WHERE p.rota_id = r.id AND p.dia = NEW.dia AND p.visitada IS NOT NULL AND coalesce(p.tipo,'') <> 'pernoite') THEN
    RAISE EXCEPTION 'Esse dia já tem visita registrada.';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.fn_dias_sem_visita_validar() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_dias_sem_visita_validar BEFORE INSERT OR UPDATE ON public.rota_dias_sem_visita
  FOR EACH ROW EXECUTE FUNCTION public.fn_dias_sem_visita_validar();

-- julia_registrar_voz: igual à atual, mudando só o ramo de pernoite e acrescentando registrar_dia_sem_visita.
-- (Na aplicação, a função inteira é recriada a partir da definição atual com estes dois trechos.)
--  ELSIF p_acao='registrar_pernoite' THEN
--   n := coalesce(nullif(p_dados->>'noite','')::date, l.data_ref);
--   IF n > l.data_ref OR n < r.data_inicio THEN RAISE EXCEPTION 'Noite fora da viagem até hoje.'; END IF;
--   IF n >= r.data_fim THEN RAISE EXCEPTION 'Último dia: não há pernoite a registrar.'; END IF;
--   ... (hotel: rota_gastos.data = n; rota_pernoites.noite = n — resto idêntico)
--  ELSIF p_acao='registrar_dia_sem_visita' THEN
--   INSERT INTO public.rota_dias_sem_visita(rota_id,dia,motivo,observacao,autor_id,origem)
--    VALUES(r.id,(p_dados->>'dia')::date,p_dados->>'motivo',nullif(btrim(p_dados->>'observacao'),''),l.vendedor_id,'julia')
--    ON CONFLICT (rota_id,dia) DO NOTHING;
-- O gatilho de rota_pernoites (fn_pernoites_validar) continua sendo a autoridade sobre noites.

INSERT INTO public.push_regras(prefixo, ativo, urgente, descricao) VALUES
  ('fechou:', true, false, 'Vendedor fechou o dia (admins)'),
  ('naofechou:', true, false, 'Vendedor não fechou o dia às 22h (admins)')
ON CONFLICT (prefixo) DO UPDATE SET ativo = EXCLUDED.ativo, urgente = EXCLUDED.urgente, descricao = EXCLUDED.descricao;
