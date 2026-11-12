-- PROPOSTA (NÃO APLICADA) — Card de comissão na tela inicial. Aplicar só após OK explícito do CEO.
-- Regras (fixas): cliente novo 4%, recorrente 5%, seminovo 2%, sobre a venda (subtotal − desconto, sem frete/montagem).
-- Só conta quando o orçamento vira ganho (status 'aprovado'). Nunca devolve custo.

ALTER TABLE public.organizacoes ADD COLUMN IF NOT EXISTS cliente_desde date;
ALTER TABLE public.orcamentos ADD COLUMN IF NOT EXISTS seminovo boolean NOT NULL DEFAULT false;

-- cliente_desde só admin/gerente comercial altera.
CREATE OR REPLACE FUNCTION public.fn_cliente_desde_protecao() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
 IF NEW.cliente_desde IS DISTINCT FROM OLD.cliente_desde AND auth.uid() IS NOT NULL
    AND NOT public.has_any_role(auth.uid(), ARRAY['admin','gerente_comercial']::app_role[]) THEN
  NEW.cliente_desde := OLD.cliente_desde;
 END IF;
 RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_cliente_desde_protecao() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_cliente_desde_protecao ON public.organizacoes;
CREATE TRIGGER trg_cliente_desde_protecao BEFORE UPDATE ON public.organizacoes FOR EACH ROW EXECUTE FUNCTION public.fn_cliente_desde_protecao();

-- Base da comissão: vendedor recebe só os dele; admin/gerente recebe todos.
CREATE OR REPLACE FUNCTION public.fn_comissao_base()
RETURNS TABLE(id uuid, numero text, cliente text, venda numeric, status text, atualizado_em timestamptz,
              vendedor_id uuid, vendedor_nome text, recorrente boolean, seminovo boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
 SELECT o.id, o.numero_orcamento, o.nome_cliente,
  greatest(0, coalesce(o.subtotal,0) - CASE WHEN o.desconto_tipo='valor' THEN coalesce(o.desconto_valor,0)
                                           ELSE coalesce(o.subtotal,0)*coalesce(o.desconto_valor,0)/100 END),
  o.status, o.updated_at, o.responsavel_id, p.nome,
  coalesce(org.cliente_desde < o.created_at::date, false) OR EXISTS(
    SELECT 1 FROM public.orcamentos a WHERE a.organizacao_id=o.organizacao_id AND a.status='aprovado'
      AND regexp_replace(a.numero_orcamento,'-V\d+$','') <> regexp_replace(o.numero_orcamento,'-V\d+$','')
      AND a.updated_at < o.updated_at),
  o.seminovo
 FROM public.orcamentos o
 LEFT JOIN public.organizacoes org ON org.id=o.organizacao_id
 LEFT JOIN public.profiles p ON p.user_id=o.responsavel_id
 WHERE public.is_approved(auth.uid())
   AND o.status IN ('rascunho','enviado','aprovado')
   AND (o.responsavel_id = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['admin','gerente_comercial']::app_role[]))
$$;
REVOKE EXECUTE ON FUNCTION public.fn_comissao_base() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_comissao_base() TO authenticated;
