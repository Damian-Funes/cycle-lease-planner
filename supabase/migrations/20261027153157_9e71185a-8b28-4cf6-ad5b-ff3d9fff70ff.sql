ALTER TABLE public.diagnosticos_tecnicos
  ADD COLUMN IF NOT EXISTS crescimento_modo text,
  ADD COLUMN IF NOT EXISTS crescimento_anual_pct numeric,
  ADD COLUMN IF NOT EXISTS meta_sacos numeric,
  ADD COLUMN IF NOT EXISTS horizonte_anos integer;
ALTER TABLE public.capacidade_parametros
  ADD COLUMN IF NOT EXISTS crescimento_padrao_pct numeric NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS horizonte_padrao_anos integer NOT NULL DEFAULT 5;

CREATE OR REPLACE FUNCTION public.fn_validar_capacidade()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
 IF TG_TABLE_NAME = 'capacidade_modelos' THEN
  IF NEW.kg_batelada <= 0 OR btrim(NEW.modelo) = '' THEN RAISE EXCEPTION 'Informe o modelo e kg por batelada maior que zero.'; END IF;
  IF NEW.tipico_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.tipicos WHERE id = NEW.tipico_id AND tipo = 'orcamento') THEN RAISE EXCEPTION 'Vincule um Típico do tipo orçamento.'; END IF;
 ELSIF TG_TABLE_NAME = 'capacidade_parametros' THEN
  IF NEW.tempo_receita_padrao_s <= 0 OR NEW.horas_trabalhadas_padrao <= 0 OR NEW.horas_trabalhadas_padrao > 24 OR NEW.horas_perdidas_padrao < 0 OR NEW.horas_perdidas_lotes_desorganizados < 0 OR NEW.horas_perdidas_padrao >= NEW.horas_trabalhadas_padrao OR NEW.horas_perdidas_lotes_desorganizados >= NEW.horas_trabalhadas_padrao OR NEW.folga_minima < 0 OR NEW.folga_minima >= 1 OR NEW.peso_soja <= 0 OR NEW.peso_milho <= 0 OR NEW.peso_trigo <= 0 THEN RAISE EXCEPTION 'Parâmetros inválidos: verifique ciclo, horas, folga e pesos.'; END IF;
  IF NEW.crescimento_padrao_pct < -50 OR NEW.crescimento_padrao_pct > 200 OR NEW.horizonte_padrao_anos < 1 OR NEW.horizonte_padrao_anos > 15 THEN RAISE EXCEPTION 'Parâmetros de crescimento inválidos: percentual entre -50 e 200 e horizonte entre 1 e 15 anos.'; END IF;
 ELSE
  IF TG_OP = 'UPDATE' AND NEW.responsavel_id IS DISTINCT FROM OLD.responsavel_id AND NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Somente admin pode alterar o responsável do diagnóstico.'; END IF;
  IF NEW.sacos_safra <= 0 OR NEW.kg_por_saco <= 0 OR NEW.janela_dias <= 0 OR NEW.tempo_receita_s <= 0 OR NEW.horas_trabalhadas_dia <= 0 OR NEW.horas_trabalhadas_dia > 24 OR NEW.horas_perdidas_dia < 0 OR NEW.horas_perdidas_dia >= NEW.horas_trabalhadas_dia OR NEW.num_produtos_liquidos < 0 OR NEW.capacidade_atual_kg_h <= 0 THEN RAISE EXCEPTION 'Diagnóstico inválido: volume, peso, janela e ciclo devem ser positivos e horas efetivas maiores que zero.'; END IF;
  IF NEW.oportunidade_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.oportunidades WHERE id = NEW.oportunidade_id AND organizacao_id IS NOT DISTINCT FROM NEW.organizacao_id) THEN RAISE EXCEPTION 'A organização deve ser a mesma do negócio vinculado.'; END IF;
  IF NEW.crescimento_modo IS NOT NULL THEN
   IF NEW.crescimento_modo NOT IN ('percentual','meta') THEN RAISE EXCEPTION 'Crescimento inválido: modo deve ser percentual ou meta.'; END IF;
   IF NEW.horizonte_anos IS NULL OR NEW.horizonte_anos < 1 OR NEW.horizonte_anos > 15 THEN RAISE EXCEPTION 'Crescimento inválido: horizonte entre 1 e 15 anos.'; END IF;
   IF NEW.crescimento_modo = 'percentual' AND (NEW.crescimento_anual_pct IS NULL OR NEW.crescimento_anual_pct < -50 OR NEW.crescimento_anual_pct > 200) THEN RAISE EXCEPTION 'Crescimento inválido: percentual entre -50 e 200.'; END IF;
   IF NEW.crescimento_modo = 'meta' AND (NEW.meta_sacos IS NULL OR NEW.meta_sacos <= 0) THEN RAISE EXCEPTION 'Crescimento inválido: meta de sacos deve ser maior que zero.'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END;
$function$;