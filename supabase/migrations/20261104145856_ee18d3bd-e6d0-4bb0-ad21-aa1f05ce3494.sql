CREATE OR REPLACE FUNCTION public.fn_uuid_seguro(_t text) RETURNS uuid
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN _t ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN _t::uuid ELSE NULL END
$$;

CREATE OR REPLACE FUNCTION public.fn_rota_hoje_brt() RETURNS date
LANGUAGE sql STABLE SET search_path = public AS $$ SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date $$;

CREATE OR REPLACE FUNCTION public.fn_pode_escrever_diario(_user uuid, _rota uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.rotas r
    WHERE r.id = _rota AND r.vendedor_id = _user AND r.status = 'aprovada'
      AND public.fn_rota_hoje_brt() BETWEEN COALESCE(r.data_inicio, r.data_rota)
                                    AND COALESCE(r.data_fim, r.data_rota) + 1)
$$;

CREATE OR REPLACE FUNCTION public.fn_pode_lancar_gasto(_user uuid, _rota uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.rotas r
    WHERE r.id = _rota AND r.vendedor_id = _user
      AND r.status = 'aprovada' AND r.prestacao_concluida_em IS NULL)
$$;

CREATE OR REPLACE FUNCTION public.fn_pode_ver_rota(_user uuid, _rota uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user, 'admin')
      OR EXISTS (SELECT 1 FROM public.rotas r WHERE r.id = _rota AND r.vendedor_id = _user)
$$;

CREATE TABLE IF NOT EXISTS public.rota_diario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rota_id uuid NOT NULL REFERENCES public.rotas(id) ON DELETE CASCADE,
  parada_id uuid REFERENCES public.rota_paradas(id) ON DELETE SET NULL,
  organizacao_id uuid REFERENCES public.organizacoes(id) ON DELETE SET NULL,
  autor_id uuid NOT NULL DEFAULT auth.uid(),
  texto text NOT NULL CHECK (length(btrim(texto)) BETWEEN 1 AND 5000),
  registrado_em timestamptz NOT NULL DEFAULT now(),
  latitude numeric, longitude numeric,
  fotos text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rota_diario_rota_idx ON public.rota_diario(rota_id, registrado_em DESC);

GRANT SELECT, INSERT, DELETE ON public.rota_diario TO authenticated;
GRANT ALL ON public.rota_diario TO service_role;
ALTER TABLE public.rota_diario ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS diario_select ON public.rota_diario;
DROP POLICY IF EXISTS diario_insert ON public.rota_diario;
DROP POLICY IF EXISTS diario_delete ON public.rota_diario;
CREATE POLICY diario_select ON public.rota_diario FOR SELECT TO authenticated
  USING (public.fn_pode_ver_rota(auth.uid(), rota_id));
CREATE POLICY diario_insert ON public.rota_diario FOR INSERT TO authenticated
  WITH CHECK (autor_id = auth.uid() AND public.fn_pode_escrever_diario(auth.uid(), rota_id)
    AND (parada_id IS NULL OR EXISTS (SELECT 1 FROM public.rota_paradas p WHERE p.id = parada_id AND p.rota_id = rota_diario.rota_id))
    AND NOT EXISTS (SELECT 1 FROM unnest(fotos) f WHERE split_part(f, '/', 1) <> rota_id::text));
CREATE POLICY diario_delete ON public.rota_diario FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.fn_diario_imutavel() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'Informativo do diário não pode ser alterado depois de gravado.'; END $$;
DROP TRIGGER IF EXISTS trg_diario_imutavel ON public.rota_diario;
CREATE TRIGGER trg_diario_imutavel BEFORE UPDATE ON public.rota_diario
  FOR EACH ROW EXECUTE FUNCTION public.fn_diario_imutavel();

CREATE TABLE IF NOT EXISTS public.rota_gastos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rota_id uuid NOT NULL REFERENCES public.rotas(id) ON DELETE CASCADE,
  categoria text NOT NULL CHECK (categoria IN ('combustivel','pedagio','hotel','alimentacao','outros')),
  valor numeric(12,2) NOT NULL CHECK (valor > 0 AND valor < 100000),
  data date NOT NULL,
  descricao text CHECK (descricao IS NULL OR length(descricao) <= 500),
  arquivo_path text,
  autor_id uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (arquivo_path IS NULL OR split_part(arquivo_path, '/', 1) = rota_id::text)
);
CREATE INDEX IF NOT EXISTS rota_gastos_rota_idx ON public.rota_gastos(rota_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rota_gastos TO authenticated;
GRANT ALL ON public.rota_gastos TO service_role;
ALTER TABLE public.rota_gastos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gastos_select ON public.rota_gastos;
DROP POLICY IF EXISTS gastos_insert ON public.rota_gastos;
DROP POLICY IF EXISTS gastos_update ON public.rota_gastos;
DROP POLICY IF EXISTS gastos_delete ON public.rota_gastos;
CREATE POLICY gastos_select ON public.rota_gastos FOR SELECT TO authenticated
  USING (public.fn_pode_ver_rota(auth.uid(), rota_id));
CREATE POLICY gastos_insert ON public.rota_gastos FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin')
    OR (autor_id = auth.uid() AND public.fn_pode_lancar_gasto(auth.uid(), rota_id)));
CREATE POLICY gastos_update ON public.rota_gastos FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.fn_pode_lancar_gasto(auth.uid(), rota_id))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.fn_pode_lancar_gasto(auth.uid(), rota_id));
CREATE POLICY gastos_delete ON public.rota_gastos FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.fn_pode_lancar_gasto(auth.uid(), rota_id));

DROP TRIGGER IF EXISTS trg_rota_gastos_updated ON public.rota_gastos;
CREATE TRIGGER trg_rota_gastos_updated BEFORE UPDATE ON public.rota_gastos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS viagens_select ON storage.objects;
DROP POLICY IF EXISTS viagens_insert ON storage.objects;
DROP POLICY IF EXISTS viagens_delete ON storage.objects;
CREATE POLICY viagens_select ON storage.objects FOR SELECT TO authenticated
  USING (CASE WHEN bucket_id = 'viagens'
    THEN COALESCE(public.fn_pode_ver_rota(auth.uid(), public.fn_uuid_seguro((storage.foldername(name))[1])), false)
    ELSE false END);
CREATE POLICY viagens_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (CASE WHEN bucket_id = 'viagens' THEN
    public.fn_uuid_seguro((storage.foldername(name))[1]) IS NOT NULL AND (
      public.has_role(auth.uid(), 'admin')
      OR ((storage.foldername(name))[2] = 'diario' AND public.fn_pode_escrever_diario(auth.uid(), public.fn_uuid_seguro((storage.foldername(name))[1])))
      OR ((storage.foldername(name))[2] = 'notas'  AND public.fn_pode_lancar_gasto(auth.uid(),  public.fn_uuid_seguro((storage.foldername(name))[1]))))
    ELSE false END);
CREATE POLICY viagens_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'viagens' AND public.has_role(auth.uid(), 'admin'));