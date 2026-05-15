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
  IF COALESCE(NEW.dados_congelados, false) = true THEN
    RETURN NEW;
  END IF;

  IF NEW.organizacao_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.organizacao_id IS DISTINCT FROM OLD.organizacao_id) THEN
    SELECT nome, cnpj, endereco, telefone_principal, email_principal
      INTO org
    FROM public.organizacoes
    WHERE id = NEW.organizacao_id;

    IF FOUND THEN
      NEW.nome_cliente := COALESCE(org.nome, NEW.nome_cliente);
      NEW.cliente_cnpj := COALESCE(org.cnpj, NEW.cliente_cnpj);
      NEW.cliente_endereco := COALESCE(org.endereco, NEW.cliente_endereco);
      NEW.cliente_telefone := COALESCE(org.telefone_principal, NEW.cliente_telefone);
      NEW.cliente_email := COALESCE(org.email_principal, NEW.cliente_email);
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'propostas' THEN
    IF NEW.pessoa_contato_id IS NOT NULL
       AND (TG_OP = 'INSERT' OR NEW.pessoa_contato_id IS DISTINCT FROM OLD.pessoa_contato_id) THEN
      SELECT nome INTO pes
      FROM public.pessoas
      WHERE id = NEW.pessoa_contato_id;

      IF FOUND THEN
        NEW.contato_nome := pes.nome;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;