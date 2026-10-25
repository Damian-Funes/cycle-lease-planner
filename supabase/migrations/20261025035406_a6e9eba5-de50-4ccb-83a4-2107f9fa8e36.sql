CREATE TABLE IF NOT EXISTS public.capacidade_modelos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), modelo text NOT NULL UNIQUE, kg_batelada numeric NOT NULL,
 ordem integer NOT NULL DEFAULT 0, ativo boolean NOT NULL DEFAULT true,
 tipico_id uuid REFERENCES public.tipicos(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.capacidade_modelos TO authenticated;
GRANT ALL ON public.capacidade_modelos TO service_role;
ALTER TABLE public.capacidade_modelos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS capacidade_modelos_ler ON public.capacidade_modelos;
CREATE POLICY capacidade_modelos_ler ON public.capacidade_modelos FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS capacidade_modelos_admin ON public.capacidade_modelos;
CREATE POLICY capacidade_modelos_admin ON public.capacidade_modelos FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.capacidade_parametros (
 id text PRIMARY KEY DEFAULT 'padrao' CHECK (id = 'padrao'),
 tempo_receita_padrao_s numeric NOT NULL DEFAULT 43,
 horas_trabalhadas_padrao numeric NOT NULL DEFAULT 20,
 horas_perdidas_padrao numeric NOT NULL DEFAULT 2,
 horas_perdidas_lotes_desorganizados numeric NOT NULL DEFAULT 4,
 folga_minima numeric NOT NULL DEFAULT 0.15,
 peso_soja numeric DEFAULT 40, peso_milho numeric, peso_trigo numeric,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.capacidade_parametros TO authenticated;
GRANT ALL ON public.capacidade_parametros TO service_role;
ALTER TABLE public.capacidade_parametros ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS capacidade_parametros_ler ON public.capacidade_parametros;
CREATE POLICY capacidade_parametros_ler ON public.capacidade_parametros FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS capacidade_parametros_admin ON public.capacidade_parametros;
CREATE POLICY capacidade_parametros_admin ON public.capacidade_parametros FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.diagnosticos_tecnicos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 oportunidade_id uuid REFERENCES public.oportunidades(id) ON DELETE SET NULL,
 organizacao_id uuid REFERENCES public.organizacoes(id) ON DELETE SET NULL,
 responsavel_id uuid NOT NULL DEFAULT auth.uid(), cultura text NOT NULL,
 sacos_safra numeric NOT NULL, kg_por_saco numeric NOT NULL, janela_dias numeric NOT NULL,
 horas_trabalhadas_dia numeric NOT NULL, lotes_liberados_dia_anterior boolean NOT NULL,
 horas_perdidas_dia numeric NOT NULL, tempo_receita_s numeric NOT NULL,
 num_produtos_liquidos integer NOT NULL DEFAULT 0, usa_po boolean NOT NULL DEFAULT false,
 capacidade_atual_kg_h numeric, equipamento_atual text,
 modelo_sugerido_id uuid REFERENCES public.capacidade_modelos(id) ON DELETE SET NULL,
 resultado jsonb NOT NULL, observacoes text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.diagnosticos_tecnicos TO authenticated;
GRANT ALL ON public.diagnosticos_tecnicos TO service_role;
ALTER TABLE public.diagnosticos_tecnicos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS diagnosticos_ler ON public.diagnosticos_tecnicos;
CREATE POLICY diagnosticos_ler ON public.diagnosticos_tecnicos FOR SELECT TO authenticated USING (
 responsavel_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.oportunidades o WHERE o.id = oportunidade_id)
);
DROP POLICY IF EXISTS diagnosticos_criar ON public.diagnosticos_tecnicos;
CREATE POLICY diagnosticos_criar ON public.diagnosticos_tecnicos FOR INSERT TO authenticated WITH CHECK (
 (responsavel_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
 AND (oportunidade_id IS NULL OR EXISTS (SELECT 1 FROM public.oportunidades o WHERE o.id = oportunidade_id))
 AND (organizacao_id IS NULL OR EXISTS (SELECT 1 FROM public.organizacoes o WHERE o.id = organizacao_id))
);
DROP POLICY IF EXISTS diagnosticos_editar ON public.diagnosticos_tecnicos;
CREATE POLICY diagnosticos_editar ON public.diagnosticos_tecnicos FOR UPDATE TO authenticated USING (
 responsavel_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.oportunidades o WHERE o.id = oportunidade_id)
) WITH CHECK (
 (responsavel_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.oportunidades o WHERE o.id = oportunidade_id))
 AND (oportunidade_id IS NULL OR EXISTS (SELECT 1 FROM public.oportunidades o WHERE o.id = oportunidade_id))
 AND (organizacao_id IS NULL OR EXISTS (SELECT 1 FROM public.organizacoes o WHERE o.id = organizacao_id))
);
DROP POLICY IF EXISTS diagnosticos_excluir ON public.diagnosticos_tecnicos;
CREATE POLICY diagnosticos_excluir ON public.diagnosticos_tecnicos FOR DELETE TO authenticated USING (responsavel_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE INDEX IF NOT EXISTS diagnosticos_oportunidade_idx ON public.diagnosticos_tecnicos(oportunidade_id, created_at DESC);
CREATE INDEX IF NOT EXISTS diagnosticos_organizacao_idx ON public.diagnosticos_tecnicos(organizacao_id, created_at DESC);
CREATE INDEX IF NOT EXISTS diagnosticos_responsavel_idx ON public.diagnosticos_tecnicos(responsavel_id);

CREATE OR REPLACE FUNCTION public.fn_validar_capacidade() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 IF TG_TABLE_NAME = 'capacidade_modelos' THEN
  IF NEW.kg_batelada <= 0 OR btrim(NEW.modelo) = '' THEN RAISE EXCEPTION 'Informe o modelo e kg por batelada maior que zero.'; END IF;
  IF NEW.tipico_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.tipicos WHERE id = NEW.tipico_id AND tipo = 'orcamento') THEN RAISE EXCEPTION 'Vincule um Típico do tipo orçamento.'; END IF;
 ELSIF TG_TABLE_NAME = 'capacidade_parametros' THEN
  IF NEW.tempo_receita_padrao_s <= 0 OR NEW.horas_trabalhadas_padrao <= 0 OR NEW.horas_trabalhadas_padrao > 24 OR NEW.horas_perdidas_padrao < 0 OR NEW.horas_perdidas_lotes_desorganizados < 0 OR NEW.horas_perdidas_padrao >= NEW.horas_trabalhadas_padrao OR NEW.horas_perdidas_lotes_desorganizados >= NEW.horas_trabalhadas_padrao OR NEW.folga_minima < 0 OR NEW.folga_minima >= 1 OR NEW.peso_soja <= 0 OR NEW.peso_milho <= 0 OR NEW.peso_trigo <= 0 THEN RAISE EXCEPTION 'Parâmetros inválidos: verifique ciclo, horas, folga e pesos.'; END IF;
 ELSE
  IF TG_OP = 'UPDATE' AND NEW.responsavel_id IS DISTINCT FROM OLD.responsavel_id AND NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Somente admin pode alterar o responsável do diagnóstico.'; END IF;
  IF NEW.sacos_safra <= 0 OR NEW.kg_por_saco <= 0 OR NEW.janela_dias <= 0 OR NEW.tempo_receita_s <= 0 OR NEW.horas_trabalhadas_dia <= 0 OR NEW.horas_trabalhadas_dia > 24 OR NEW.horas_perdidas_dia < 0 OR NEW.horas_perdidas_dia >= NEW.horas_trabalhadas_dia OR NEW.num_produtos_liquidos < 0 OR NEW.capacidade_atual_kg_h <= 0 THEN RAISE EXCEPTION 'Diagnóstico inválido: volume, peso, janela e ciclo devem ser positivos e horas efetivas maiores que zero.'; END IF;
  IF NEW.oportunidade_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.oportunidades WHERE id = NEW.oportunidade_id AND organizacao_id IS NOT DISTINCT FROM NEW.organizacao_id) THEN RAISE EXCEPTION 'A organização deve ser a mesma do negócio vinculado.'; END IF;
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_validar_capacidade() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_validar_capacidade() TO service_role;
DROP TRIGGER IF EXISTS validar_capacidade ON public.capacidade_modelos;
CREATE TRIGGER validar_capacidade BEFORE INSERT OR UPDATE ON public.capacidade_modelos FOR EACH ROW EXECUTE FUNCTION public.fn_validar_capacidade();
DROP TRIGGER IF EXISTS validar_capacidade ON public.capacidade_parametros;
CREATE TRIGGER validar_capacidade BEFORE INSERT OR UPDATE ON public.capacidade_parametros FOR EACH ROW EXECUTE FUNCTION public.fn_validar_capacidade();
DROP TRIGGER IF EXISTS validar_capacidade ON public.diagnosticos_tecnicos;
CREATE TRIGGER validar_capacidade BEFORE INSERT OR UPDATE ON public.diagnosticos_tecnicos FOR EACH ROW EXECUTE FUNCTION public.fn_validar_capacidade();
DROP TRIGGER IF EXISTS capacidade_updated_at ON public.capacidade_modelos;
CREATE TRIGGER capacidade_updated_at BEFORE UPDATE ON public.capacidade_modelos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS capacidade_updated_at ON public.capacidade_parametros;
CREATE TRIGGER capacidade_updated_at BEFORE UPDATE ON public.capacidade_parametros FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS capacidade_updated_at ON public.diagnosticos_tecnicos;
CREATE TRIGGER capacidade_updated_at BEFORE UPDATE ON public.diagnosticos_tecnicos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS diagnosticos_audit ON public.diagnosticos_tecnicos;
CREATE TRIGGER diagnosticos_audit AFTER INSERT OR UPDATE OR DELETE ON public.diagnosticos_tecnicos FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();

INSERT INTO public.capacidade_modelos(modelo,kg_batelada,ordem) VALUES ('LSB50',50,1),('LSB130',130,2),('LSB150',150,3),('LSB300',300,4),('LSB300D (Duo)',570,5) ON CONFLICT (modelo) DO NOTHING;
INSERT INTO public.capacidade_parametros(id) VALUES ('padrao') ON CONFLICT (id) DO NOTHING;