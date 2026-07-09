
-- Corrige cálculo de montagem para usuários não-admin.
-- A função precisa ser SECURITY DEFINER para conseguir ler config_montagem
-- (que tem RLS restrita a admin/financeiro/gerente_comercial).

CREATE OR REPLACE FUNCTION public.recalc_montagem_total()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c public.config_montagem%ROWTYPE;
  v_custo numeric(12,2);
  v_dias_sugeridos integer;
BEGIN
  IF TG_OP = 'INSERT' OR OLD.itens IS DISTINCT FROM NEW.itens THEN
    SELECT COALESCE(
             SUM(COALESCE((item->>'quantidade')::numeric, 0) * e.dias_montagem_padrao),
             0
           )::integer
      INTO v_dias_sugeridos
      FROM jsonb_array_elements(COALESCE(NEW.itens, '[]'::jsonb)) AS item
      JOIN public.equipamentos e
        ON e.id::text = (item->>'equipamento_id')
     WHERE COALESCE(e.dias_montagem_padrao, 0) > 0;

    IF v_dias_sugeridos > 0 THEN
      NEW.montagem_dias := v_dias_sugeridos;
    END IF;
  END IF;

  SELECT * INTO c FROM public.config_montagem LIMIT 1;

  IF c.id IS NULL THEN
    NEW.montagem_custo_total := 0;
    NEW.montagem_preco_total := 0;
    NEW.montagem_margem_aplicada := 0;
    RETURN NEW;
  END IF;

  v_custo :=
      (COALESCE(NEW.montagem_dias, 0)
        * COALESCE(NEW.montagem_numero_colaboradores, 0)
        * c.valor_dia_colaborador)
    + (2 * COALESCE(NEW.montagem_km_origem_destino, 0)
        * c.valor_km
        * COALESCE(NEW.montagem_numero_veiculos, 1))
    + CASE
        WHEN COALESCE(NEW.montagem_eh_fazenda, false) THEN
          (COALESCE(NEW.montagem_dias, 0)
            * 2
            * COALESCE(NEW.montagem_km_hotel_local, 0)
            * c.valor_km
            * COALESCE(NEW.montagem_numero_veiculos, 1))
        ELSE 0
      END
    + (COALESCE(NEW.montagem_dias, 0)
        * COALESCE(NEW.montagem_numero_colaboradores, 0)
        * c.diaria_hospedagem)
    + (COALESCE(NEW.montagem_dias, 0)
        * COALESCE(NEW.montagem_numero_colaboradores, 0)
        * c.diaria_alimentacao);

  NEW.montagem_custo_total := v_custo;
  NEW.montagem_margem_aplicada := c.margem_percentual;
  NEW.montagem_preco_total := ROUND(v_custo * (1 + c.margem_percentual / 100), 2);

  RETURN NEW;
END;
$function$;

-- Reprocessa orçamentos existentes que ficaram com montagem zerada mas têm dias > 0.
-- Um UPDATE tocando em uma coluna monitorada faz o trigger recalcular tudo.
UPDATE public.orcamentos
   SET montagem_dias = montagem_dias
 WHERE montagem_dias > 0
   AND (montagem_preco_total IS NULL OR montagem_preco_total = 0);

-- Recalcula a coluna total incluindo o novo preço de montagem
UPDATE public.orcamentos o
   SET total = COALESCE(o.subtotal, 0)
             - CASE WHEN o.desconto_tipo = 'percentual'
                    THEN COALESCE(o.subtotal, 0) * COALESCE(o.desconto_valor, 0) / 100
                    ELSE COALESCE(o.desconto_valor, 0)
               END
             + COALESCE(o.frete, 0)
             + COALESCE(o.montagem_preco_total, 0)
 WHERE o.montagem_preco_total > 0;
