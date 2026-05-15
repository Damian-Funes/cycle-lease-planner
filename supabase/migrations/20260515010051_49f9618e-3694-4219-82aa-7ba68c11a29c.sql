-- 1) Colunas em propostas
ALTER TABLE public.propostas
  ADD COLUMN IF NOT EXISTS organizacao_id uuid REFERENCES public.organizacoes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pessoa_contato_id uuid REFERENCES public.pessoas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS oportunidade_id uuid REFERENCES public.oportunidades(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dados_congelados boolean NOT NULL DEFAULT false;

-- 2) Colunas em orcamentos
ALTER TABLE public.orcamentos
  ADD COLUMN IF NOT EXISTS organizacao_id uuid REFERENCES public.organizacoes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS oportunidade_id uuid REFERENCES public.oportunidades(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dados_congelados boolean NOT NULL DEFAULT false;

-- 3) Colunas em orcamentos_reforma
ALTER TABLE public.orcamentos_reforma
  ADD COLUMN IF NOT EXISTS organizacao_id uuid REFERENCES public.organizacoes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS oportunidade_id uuid REFERENCES public.oportunidades(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dados_congelados boolean NOT NULL DEFAULT false;

-- 4) Coluna em layouts
ALTER TABLE public.layouts
  ADD COLUMN IF NOT EXISTS organizacao_id uuid REFERENCES public.organizacoes(id) ON DELETE SET NULL;

-- 5) Índices
CREATE INDEX IF NOT EXISTS idx_propostas_organizacao_id ON public.propostas(organizacao_id);
CREATE INDEX IF NOT EXISTS idx_propostas_oportunidade_id ON public.propostas(oportunidade_id);
CREATE INDEX IF NOT EXISTS idx_orcamentos_organizacao_id ON public.orcamentos(organizacao_id);
CREATE INDEX IF NOT EXISTS idx_orcamentos_oportunidade_id ON public.orcamentos(oportunidade_id);
CREATE INDEX IF NOT EXISTS idx_orcamentos_reforma_organizacao_id ON public.orcamentos_reforma(organizacao_id);
CREATE INDEX IF NOT EXISTS idx_orcamentos_reforma_oportunidade_id ON public.orcamentos_reforma(oportunidade_id);
CREATE INDEX IF NOT EXISTS idx_layouts_organizacao_id ON public.layouts(organizacao_id);

-- 6) Função: congelar dados quando status vira aprovada/aprovado
CREATE OR REPLACE FUNCTION public.fn_congelar_ao_aprovar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND lower(NEW.status) IN ('aprovada','aprovado','fechado','fechada') THEN
    NEW.dados_congelados := true;
  END IF;
  RETURN NEW;
END;
$$;

-- 7) Função: sincronizar dados da organização (quando não congelados)
CREATE OR REPLACE FUNCTION public.fn_sync_dados_organizacao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  org record;
  pes record;
BEGIN
  -- Se dados estão congelados, não sincroniza
  IF COALESCE(NEW.dados_congelados, false) = true THEN
    RETURN NEW;
  END IF;

  -- Sincroniza dados da organização
  IF NEW.organizacao_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.organizacao_id IS DISTINCT FROM OLD.organizacao_id) THEN
    SELECT nome, cnpj, endereco, telefone_principal, email_principal
      INTO org FROM public.organizacoes WHERE id = NEW.organizacao_id;
    IF FOUND THEN
      NEW.nome_cliente := COALESCE(org.nome, NEW.nome_cliente);
      NEW.cliente_cnpj := COALESCE(org.cnpj, NEW.cliente_cnpj);
      NEW.cliente_endereco := COALESCE(org.endereco, NEW.cliente_endereco);
      NEW.cliente_telefone := COALESCE(org.telefone_principal, NEW.cliente_telefone);
      NEW.cliente_email := COALESCE(org.email_principal, NEW.cliente_email);
    END IF;
  END IF;

  -- Sincroniza pessoa de contato (apenas em propostas)
  IF TG_TABLE_NAME = 'propostas' AND NEW.pessoa_contato_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.pessoa_contato_id IS DISTINCT FROM OLD.pessoa_contato_id) THEN
    SELECT nome INTO pes FROM public.pessoas WHERE id = NEW.pessoa_contato_id;
    IF FOUND THEN
      NEW.contato_nome := pes.nome;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 8) Triggers em propostas
DROP TRIGGER IF EXISTS trg_freeze_propostas ON public.propostas;
CREATE TRIGGER trg_freeze_propostas
  BEFORE UPDATE ON public.propostas
  FOR EACH ROW EXECUTE FUNCTION public.fn_congelar_ao_aprovar();

DROP TRIGGER IF EXISTS trg_sync_org_propostas ON public.propostas;
CREATE TRIGGER trg_sync_org_propostas
  BEFORE INSERT OR UPDATE ON public.propostas
  FOR EACH ROW EXECUTE FUNCTION public.fn_sync_dados_organizacao();

-- 9) Triggers em orcamentos
DROP TRIGGER IF EXISTS trg_freeze_orcamentos ON public.orcamentos;
CREATE TRIGGER trg_freeze_orcamentos
  BEFORE UPDATE ON public.orcamentos
  FOR EACH ROW EXECUTE FUNCTION public.fn_congelar_ao_aprovar();

DROP TRIGGER IF EXISTS trg_sync_org_orcamentos ON public.orcamentos;
CREATE TRIGGER trg_sync_org_orcamentos
  BEFORE INSERT OR UPDATE ON public.orcamentos
  FOR EACH ROW EXECUTE FUNCTION public.fn_sync_dados_organizacao();

-- 10) Triggers em orcamentos_reforma
DROP TRIGGER IF EXISTS trg_freeze_orcamentos_reforma ON public.orcamentos_reforma;
CREATE TRIGGER trg_freeze_orcamentos_reforma
  BEFORE UPDATE ON public.orcamentos_reforma
  FOR EACH ROW EXECUTE FUNCTION public.fn_congelar_ao_aprovar();

DROP TRIGGER IF EXISTS trg_sync_org_orcamentos_reforma ON public.orcamentos_reforma;
CREATE TRIGGER trg_sync_org_orcamentos_reforma
  BEFORE INSERT OR UPDATE ON public.orcamentos_reforma
  FOR EACH ROW EXECUTE FUNCTION public.fn_sync_dados_organizacao();