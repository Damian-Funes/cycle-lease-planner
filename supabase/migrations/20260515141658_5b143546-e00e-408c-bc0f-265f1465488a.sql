
CREATE TABLE IF NOT EXISTS public.estados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sigla text NOT NULL UNIQUE CHECK (length(sigla) = 2),
  nome text NOT NULL,
  codigo_ibge text UNIQUE,
  regiao text CHECK (regiao IN ('Norte','Nordeste','Centro-Oeste','Sudeste','Sul')),
  ativo boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.estados ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Todos autenticados podem ler estados" ON public.estados;
CREATE POLICY "Todos autenticados podem ler estados" ON public.estados FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admin gerencia estados" ON public.estados;
CREATE POLICY "Admin gerencia estados" ON public.estados FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

INSERT INTO public.estados (sigla, nome, codigo_ibge, regiao) VALUES
('AC','Acre','12','Norte'),('AL','Alagoas','27','Nordeste'),('AP','Amapá','16','Norte'),
('AM','Amazonas','13','Norte'),('BA','Bahia','29','Nordeste'),('CE','Ceará','23','Nordeste'),
('DF','Distrito Federal','53','Centro-Oeste'),('ES','Espírito Santo','32','Sudeste'),('GO','Goiás','52','Centro-Oeste'),
('MA','Maranhão','21','Nordeste'),('MT','Mato Grosso','51','Centro-Oeste'),('MS','Mato Grosso do Sul','50','Centro-Oeste'),
('MG','Minas Gerais','31','Sudeste'),('PA','Pará','15','Norte'),('PB','Paraíba','25','Nordeste'),
('PR','Paraná','41','Sul'),('PE','Pernambuco','26','Nordeste'),('PI','Piauí','22','Nordeste'),
('RJ','Rio de Janeiro','33','Sudeste'),('RN','Rio Grande do Norte','24','Nordeste'),('RS','Rio Grande do Sul','43','Sul'),
('RO','Rondônia','11','Norte'),('RR','Roraima','14','Norte'),('SC','Santa Catarina','42','Sul'),
('SP','São Paulo','35','Sudeste'),('SE','Sergipe','28','Nordeste'),('TO','Tocantins','17','Norte')
ON CONFLICT (sigla) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.usuario_estados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  estado_id uuid NOT NULL REFERENCES public.estados(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, estado_id)
);
ALTER TABLE public.usuario_estados ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_usuario_estados_user ON public.usuario_estados(user_id);
CREATE INDEX IF NOT EXISTS idx_usuario_estados_estado ON public.usuario_estados(estado_id);

CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid, _roles app_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = ANY(_roles))
$$;

CREATE OR REPLACE FUNCTION public.user_cobre_estado(_user_id uuid, _estado_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _estado_id IS NULL OR EXISTS (
    SELECT 1 FROM public.usuario_estados WHERE user_id = _user_id AND estado_id = _estado_id
  )
$$;

CREATE OR REPLACE FUNCTION public.pode_ver_organizacao(_user_id uuid, _org_estado_id uuid, _org_responsavel_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.has_any_role(_user_id, ARRAY['admin','marketing','gerente_comercial','viewer','engenharia','financeiro','operacao']::app_role[])
    OR (public.has_role(_user_id, 'comercial') AND (_org_responsavel_id = _user_id OR public.user_cobre_estado(_user_id, _org_estado_id)))
    OR (public.has_role(_user_id, 'rtv') AND public.user_cobre_estado(_user_id, _org_estado_id))
$$;

DROP POLICY IF EXISTS "Usuário vê próprios estados" ON public.usuario_estados;
CREATE POLICY "Usuário vê próprios estados" ON public.usuario_estados FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Admin/Gerente vê todos vínculos" ON public.usuario_estados;
CREATE POLICY "Admin/Gerente vê todos vínculos" ON public.usuario_estados FOR SELECT TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin','gerente_comercial']::app_role[]));
DROP POLICY IF EXISTS "Admin gerencia vínculos de estado" ON public.usuario_estados;
CREATE POLICY "Admin gerencia vínculos de estado" ON public.usuario_estados FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

ALTER TABLE public.organizacoes ADD COLUMN IF NOT EXISTS estado_id uuid REFERENCES public.estados(id);
CREATE INDEX IF NOT EXISTS idx_organizacoes_estado ON public.organizacoes(estado_id);

UPDATE public.organizacoes o SET estado_id = e.id
  FROM public.estados e
  WHERE o.estado_id IS NULL AND o.estado IS NOT NULL AND UPPER(TRIM(o.estado)) = e.sigla;

CREATE OR REPLACE FUNCTION public.fn_sync_estado_organizacao()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.estado_id IS NOT NULL THEN
    NEW.estado := (SELECT sigla FROM public.estados WHERE id = NEW.estado_id);
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_sync_estado_org ON public.organizacoes;
CREATE TRIGGER trg_sync_estado_org BEFORE INSERT OR UPDATE ON public.organizacoes
  FOR EACH ROW EXECUTE FUNCTION public.fn_sync_estado_organizacao();

ALTER TABLE public.pessoas      ADD COLUMN IF NOT EXISTS responsavel_id uuid;
ALTER TABLE public.propostas    ADD COLUMN IF NOT EXISTS responsavel_id uuid;
ALTER TABLE public.orcamentos   ADD COLUMN IF NOT EXISTS responsavel_id uuid;
ALTER TABLE public.orcamentos_reforma ADD COLUMN IF NOT EXISTS responsavel_id uuid;

CREATE INDEX IF NOT EXISTS idx_organizacoes_responsavel ON public.organizacoes(responsavel_id);
CREATE INDEX IF NOT EXISTS idx_pessoas_responsavel ON public.pessoas(responsavel_id);
CREATE INDEX IF NOT EXISTS idx_propostas_responsavel ON public.propostas(responsavel_id);
CREATE INDEX IF NOT EXISTS idx_orcamentos_responsavel ON public.orcamentos(responsavel_id);
CREATE INDEX IF NOT EXISTS idx_orcamentos_reforma_responsavel ON public.orcamentos_reforma(responsavel_id);

CREATE OR REPLACE FUNCTION public.fn_proximo_comercial_para_estado(_estado_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ue.user_id
  FROM public.usuario_estados ue
  INNER JOIN public.user_roles ur ON ur.user_id = ue.user_id AND ur.role = 'comercial'
  INNER JOIN public.profiles p ON p.user_id = ue.user_id AND p.status = 'approved'
  WHERE ue.estado_id = _estado_id
  ORDER BY (SELECT COUNT(*) FROM public.organizacoes o WHERE o.responsavel_id = ue.user_id) ASC, ue.created_at ASC
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.fn_atribuir_responsavel_org()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE criador_role app_role; comercial_destino uuid;
BEGIN
  IF NEW.responsavel_id IS NOT NULL THEN RETURN NEW; END IF;
  SELECT role INTO criador_role FROM public.user_roles WHERE user_id = auth.uid()
    ORDER BY CASE role WHEN 'admin' THEN 1 WHEN 'gerente_comercial' THEN 2 WHEN 'comercial' THEN 3 WHEN 'rtv' THEN 4 ELSE 99 END
    LIMIT 1;
  IF criador_role = 'rtv' AND NEW.estado_id IS NOT NULL THEN
    comercial_destino := public.fn_proximo_comercial_para_estado(NEW.estado_id);
    NEW.responsavel_id := COALESCE(comercial_destino, auth.uid());
  ELSE
    NEW.responsavel_id := auth.uid();
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_atribuir_resp_org ON public.organizacoes;
CREATE TRIGGER trg_atribuir_resp_org BEFORE INSERT ON public.organizacoes
  FOR EACH ROW EXECUTE FUNCTION public.fn_atribuir_responsavel_org();

CREATE OR REPLACE FUNCTION public.fn_atribuir_responsavel_pessoa()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.responsavel_id IS NULL THEN
    IF NEW.organizacao_id IS NOT NULL THEN
      NEW.responsavel_id := (SELECT responsavel_id FROM public.organizacoes WHERE id = NEW.organizacao_id);
    END IF;
    IF NEW.responsavel_id IS NULL THEN NEW.responsavel_id := auth.uid(); END IF;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_atribuir_resp_pessoa ON public.pessoas;
CREATE TRIGGER trg_atribuir_resp_pessoa BEFORE INSERT ON public.pessoas
  FOR EACH ROW EXECUTE FUNCTION public.fn_atribuir_responsavel_pessoa();

CREATE OR REPLACE FUNCTION public.fn_set_responsavel_default()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.responsavel_id IS NULL THEN
    IF NEW.organizacao_id IS NOT NULL THEN
      NEW.responsavel_id := (SELECT responsavel_id FROM public.organizacoes WHERE id = NEW.organizacao_id);
    END IF;
    IF NEW.responsavel_id IS NULL THEN NEW.responsavel_id := auth.uid(); END IF;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_set_resp_propostas ON public.propostas;
CREATE TRIGGER trg_set_resp_propostas BEFORE INSERT ON public.propostas FOR EACH ROW EXECUTE FUNCTION public.fn_set_responsavel_default();
DROP TRIGGER IF EXISTS trg_set_resp_orcamentos ON public.orcamentos;
CREATE TRIGGER trg_set_resp_orcamentos BEFORE INSERT ON public.orcamentos FOR EACH ROW EXECUTE FUNCTION public.fn_set_responsavel_default();
DROP TRIGGER IF EXISTS trg_set_resp_orcamentos_reforma ON public.orcamentos_reforma;
CREATE TRIGGER trg_set_resp_orcamentos_reforma BEFORE INSERT ON public.orcamentos_reforma FOR EACH ROW EXECUTE FUNCTION public.fn_set_responsavel_default();

-- ORGANIZACOES policies
DROP POLICY IF EXISTS "Permissive access on organizacoes" ON public.organizacoes;
DROP POLICY IF EXISTS "Allow all access to organizacoes" ON public.organizacoes;
DROP POLICY IF EXISTS "Ver organizações" ON public.organizacoes;
DROP POLICY IF EXISTS "Criar organizações" ON public.organizacoes;
DROP POLICY IF EXISTS "Editar organizações" ON public.organizacoes;
DROP POLICY IF EXISTS "Deletar organizações" ON public.organizacoes;
CREATE POLICY "Ver organizações" ON public.organizacoes FOR SELECT TO authenticated
  USING (is_approved(auth.uid()) AND pode_ver_organizacao(auth.uid(), estado_id, responsavel_id));
CREATE POLICY "Criar organizações" ON public.organizacoes FOR INSERT TO authenticated
  WITH CHECK (is_approved(auth.uid()) AND has_any_role(auth.uid(), ARRAY['admin','gerente_comercial','comercial','rtv']::app_role[]));
CREATE POLICY "Editar organizações" ON public.organizacoes FOR UPDATE TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin','gerente_comercial']::app_role[])
    OR (responsavel_id = auth.uid() AND has_any_role(auth.uid(), ARRAY['comercial','rtv']::app_role[])));
CREATE POLICY "Deletar organizações" ON public.organizacoes FOR DELETE TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin','gerente_comercial']::app_role[]));

-- PESSOAS
DROP POLICY IF EXISTS "Permissive access on pessoas" ON public.pessoas;
DROP POLICY IF EXISTS "Allow all access to pessoas" ON public.pessoas;
DROP POLICY IF EXISTS "Ver pessoas" ON public.pessoas;
DROP POLICY IF EXISTS "Criar pessoas" ON public.pessoas;
DROP POLICY IF EXISTS "Editar pessoas" ON public.pessoas;
DROP POLICY IF EXISTS "Deletar pessoas" ON public.pessoas;
CREATE POLICY "Ver pessoas" ON public.pessoas FOR SELECT TO authenticated USING (
  is_approved(auth.uid()) AND (
    has_any_role(auth.uid(), ARRAY['admin','marketing','gerente_comercial','viewer','engenharia','financeiro','operacao']::app_role[])
    OR (organizacao_id IS NULL AND responsavel_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.organizacoes o WHERE o.id = pessoas.organizacao_id AND pode_ver_organizacao(auth.uid(), o.estado_id, o.responsavel_id))
  )
);
CREATE POLICY "Criar pessoas" ON public.pessoas FOR INSERT TO authenticated WITH CHECK (
  is_approved(auth.uid()) AND has_any_role(auth.uid(), ARRAY['admin','gerente_comercial','comercial','rtv']::app_role[])
);
CREATE POLICY "Editar pessoas" ON public.pessoas FOR UPDATE TO authenticated USING (
  has_any_role(auth.uid(), ARRAY['admin','gerente_comercial']::app_role[])
  OR (responsavel_id = auth.uid() AND has_any_role(auth.uid(), ARRAY['comercial','rtv']::app_role[]))
);
CREATE POLICY "Deletar pessoas" ON public.pessoas FOR DELETE TO authenticated USING (
  has_any_role(auth.uid(), ARRAY['admin','gerente_comercial']::app_role[])
);

-- PROPOSTAS
DROP POLICY IF EXISTS "Approved users can view propostas" ON public.propostas;
DROP POLICY IF EXISTS "Approved users can insert propostas" ON public.propostas;
DROP POLICY IF EXISTS "Approved users can update propostas" ON public.propostas;
DROP POLICY IF EXISTS "Approved users can delete propostas" ON public.propostas;
CREATE POLICY "Ver propostas" ON public.propostas FOR SELECT TO authenticated USING (
  is_approved(auth.uid()) AND (
    has_any_role(auth.uid(), ARRAY['admin','marketing','gerente_comercial','viewer','engenharia','financeiro','operacao']::app_role[])
    OR (has_role(auth.uid(),'comercial') AND (
      responsavel_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.organizacoes o WHERE o.id = propostas.organizacao_id AND user_cobre_estado(auth.uid(), o.estado_id))
    ))
  )
);
CREATE POLICY "Criar propostas" ON public.propostas FOR INSERT TO authenticated WITH CHECK (
  is_approved(auth.uid()) AND has_any_role(auth.uid(), ARRAY['admin','gerente_comercial','comercial']::app_role[])
);
CREATE POLICY "Editar propostas" ON public.propostas FOR UPDATE TO authenticated USING (
  has_any_role(auth.uid(), ARRAY['admin','gerente_comercial']::app_role[])
  OR (responsavel_id = auth.uid() AND has_role(auth.uid(),'comercial'))
);
CREATE POLICY "Deletar propostas" ON public.propostas FOR DELETE TO authenticated USING (
  has_any_role(auth.uid(), ARRAY['admin','gerente_comercial']::app_role[])
);

-- ORCAMENTOS
DROP POLICY IF EXISTS "Approved users can view orcamentos" ON public.orcamentos;
DROP POLICY IF EXISTS "Approved users can insert orcamentos" ON public.orcamentos;
DROP POLICY IF EXISTS "Approved users can update orcamentos" ON public.orcamentos;
DROP POLICY IF EXISTS "Approved users can delete orcamentos" ON public.orcamentos;
CREATE POLICY "Ver orcamentos" ON public.orcamentos FOR SELECT TO authenticated USING (
  is_approved(auth.uid()) AND (
    has_any_role(auth.uid(), ARRAY['admin','marketing','gerente_comercial','viewer','engenharia','financeiro','operacao']::app_role[])
    OR (has_role(auth.uid(),'comercial') AND (
      responsavel_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.organizacoes o WHERE o.id = orcamentos.organizacao_id AND user_cobre_estado(auth.uid(), o.estado_id))
    ))
  )
);
CREATE POLICY "Criar orcamentos" ON public.orcamentos FOR INSERT TO authenticated WITH CHECK (
  is_approved(auth.uid()) AND has_any_role(auth.uid(), ARRAY['admin','gerente_comercial','comercial']::app_role[])
);
CREATE POLICY "Editar orcamentos" ON public.orcamentos FOR UPDATE TO authenticated USING (
  has_any_role(auth.uid(), ARRAY['admin','gerente_comercial']::app_role[])
  OR (responsavel_id = auth.uid() AND has_role(auth.uid(),'comercial'))
);
CREATE POLICY "Deletar orcamentos" ON public.orcamentos FOR DELETE TO authenticated USING (
  has_any_role(auth.uid(), ARRAY['admin','gerente_comercial']::app_role[])
);

-- ORCAMENTOS_REFORMA
DROP POLICY IF EXISTS "Approved users can view orcamentos_reforma" ON public.orcamentos_reforma;
DROP POLICY IF EXISTS "Approved users can insert orcamentos_reforma" ON public.orcamentos_reforma;
DROP POLICY IF EXISTS "Approved users can update orcamentos_reforma" ON public.orcamentos_reforma;
DROP POLICY IF EXISTS "Approved users can delete orcamentos_reforma" ON public.orcamentos_reforma;
CREATE POLICY "Ver orcamentos_reforma" ON public.orcamentos_reforma FOR SELECT TO authenticated USING (
  is_approved(auth.uid()) AND (
    has_any_role(auth.uid(), ARRAY['admin','marketing','gerente_comercial','viewer','engenharia','financeiro','operacao']::app_role[])
    OR (has_role(auth.uid(),'comercial') AND (
      responsavel_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.organizacoes o WHERE o.id = orcamentos_reforma.organizacao_id AND user_cobre_estado(auth.uid(), o.estado_id))
    ))
  )
);
CREATE POLICY "Criar orcamentos_reforma" ON public.orcamentos_reforma FOR INSERT TO authenticated WITH CHECK (
  is_approved(auth.uid()) AND has_any_role(auth.uid(), ARRAY['admin','gerente_comercial','comercial']::app_role[])
);
CREATE POLICY "Editar orcamentos_reforma" ON public.orcamentos_reforma FOR UPDATE TO authenticated USING (
  has_any_role(auth.uid(), ARRAY['admin','gerente_comercial']::app_role[])
  OR (responsavel_id = auth.uid() AND has_role(auth.uid(),'comercial'))
);
CREATE POLICY "Deletar orcamentos_reforma" ON public.orcamentos_reforma FOR DELETE TO authenticated USING (
  has_any_role(auth.uid(), ARRAY['admin','gerente_comercial']::app_role[])
);

-- AUDIT LOG
CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  user_id uuid,
  tabela text NOT NULL,
  registro_id uuid,
  acao text NOT NULL CHECK (acao IN ('insert','update','delete')),
  dados_antes jsonb,
  dados_depois jsonb
);
CREATE INDEX IF NOT EXISTS idx_audit_user ON public.audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_tabela ON public.audit_log(tabela, registro_id);
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin vê audit log" ON public.audit_log;
CREATE POLICY "Admin vê audit log" ON public.audit_log FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.fn_audit_trigger()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.audit_log (user_id, tabela, registro_id, acao, dados_antes, dados_depois)
  VALUES (
    auth.uid(), TG_TABLE_NAME, COALESCE(NEW.id, OLD.id), LOWER(TG_OP),
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) END
  );
  RETURN COALESCE(NEW, OLD);
END; $$;

DROP TRIGGER IF EXISTS trg_audit_organizacoes ON public.organizacoes;
CREATE TRIGGER trg_audit_organizacoes AFTER INSERT OR UPDATE OR DELETE ON public.organizacoes FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();
DROP TRIGGER IF EXISTS trg_audit_pessoas ON public.pessoas;
CREATE TRIGGER trg_audit_pessoas AFTER INSERT OR UPDATE OR DELETE ON public.pessoas FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();
DROP TRIGGER IF EXISTS trg_audit_propostas ON public.propostas;
CREATE TRIGGER trg_audit_propostas AFTER INSERT OR UPDATE OR DELETE ON public.propostas FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();
DROP TRIGGER IF EXISTS trg_audit_orcamentos ON public.orcamentos;
CREATE TRIGGER trg_audit_orcamentos AFTER INSERT OR UPDATE OR DELETE ON public.orcamentos FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();
DROP TRIGGER IF EXISTS trg_audit_orcamentos_reforma ON public.orcamentos_reforma;
CREATE TRIGGER trg_audit_orcamentos_reforma AFTER INSERT OR UPDATE OR DELETE ON public.orcamentos_reforma FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();
