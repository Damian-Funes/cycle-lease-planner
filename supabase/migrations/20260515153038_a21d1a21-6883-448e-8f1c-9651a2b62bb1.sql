
-- Responsável padrão em organizações + sincronização da sigla do estado
DROP TRIGGER IF EXISTS trg_org_responsavel ON public.organizacoes;
CREATE TRIGGER trg_org_responsavel
BEFORE INSERT ON public.organizacoes
FOR EACH ROW EXECUTE FUNCTION public.fn_atribuir_responsavel_org();

DROP TRIGGER IF EXISTS trg_org_estado_sync ON public.organizacoes;
CREATE TRIGGER trg_org_estado_sync
BEFORE INSERT OR UPDATE OF estado_id ON public.organizacoes
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_estado_organizacao();

DROP TRIGGER IF EXISTS trg_org_updated_at ON public.organizacoes;
CREATE TRIGGER trg_org_updated_at
BEFORE UPDATE ON public.organizacoes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Responsável padrão em pessoas
DROP TRIGGER IF EXISTS trg_pessoa_responsavel ON public.pessoas;
CREATE TRIGGER trg_pessoa_responsavel
BEFORE INSERT ON public.pessoas
FOR EACH ROW EXECUTE FUNCTION public.fn_atribuir_responsavel_pessoa();

DROP TRIGGER IF EXISTS trg_pessoa_updated_at ON public.pessoas;
CREATE TRIGGER trg_pessoa_updated_at
BEFORE UPDATE ON public.pessoas
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Responsável padrão e sync de dados em propostas/orçamentos
DROP TRIGGER IF EXISTS trg_propostas_responsavel ON public.propostas;
CREATE TRIGGER trg_propostas_responsavel
BEFORE INSERT ON public.propostas
FOR EACH ROW EXECUTE FUNCTION public.fn_set_responsavel_default();

DROP TRIGGER IF EXISTS trg_propostas_sync_org ON public.propostas;
CREATE TRIGGER trg_propostas_sync_org
BEFORE INSERT OR UPDATE ON public.propostas
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_dados_organizacao();

DROP TRIGGER IF EXISTS trg_propostas_congelar ON public.propostas;
CREATE TRIGGER trg_propostas_congelar
BEFORE UPDATE ON public.propostas
FOR EACH ROW EXECUTE FUNCTION public.fn_congelar_ao_aprovar();

DROP TRIGGER IF EXISTS trg_propostas_updated_at ON public.propostas;
CREATE TRIGGER trg_propostas_updated_at
BEFORE UPDATE ON public.propostas
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_orcamentos_responsavel ON public.orcamentos;
CREATE TRIGGER trg_orcamentos_responsavel
BEFORE INSERT ON public.orcamentos
FOR EACH ROW EXECUTE FUNCTION public.fn_set_responsavel_default();

DROP TRIGGER IF EXISTS trg_orcamentos_sync_org ON public.orcamentos;
CREATE TRIGGER trg_orcamentos_sync_org
BEFORE INSERT OR UPDATE ON public.orcamentos
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_dados_organizacao();

DROP TRIGGER IF EXISTS trg_orcamentos_congelar ON public.orcamentos;
CREATE TRIGGER trg_orcamentos_congelar
BEFORE UPDATE ON public.orcamentos
FOR EACH ROW EXECUTE FUNCTION public.fn_congelar_ao_aprovar();

DROP TRIGGER IF EXISTS trg_orcamentos_updated_at ON public.orcamentos;
CREATE TRIGGER trg_orcamentos_updated_at
BEFORE UPDATE ON public.orcamentos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_orcamentos_reforma_responsavel ON public.orcamentos_reforma;
CREATE TRIGGER trg_orcamentos_reforma_responsavel
BEFORE INSERT ON public.orcamentos_reforma
FOR EACH ROW EXECUTE FUNCTION public.fn_set_responsavel_default();

DROP TRIGGER IF EXISTS trg_orcamentos_reforma_sync_org ON public.orcamentos_reforma;
CREATE TRIGGER trg_orcamentos_reforma_sync_org
BEFORE INSERT OR UPDATE ON public.orcamentos_reforma
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_dados_organizacao();

DROP TRIGGER IF EXISTS trg_orcamentos_reforma_congelar ON public.orcamentos_reforma;
CREATE TRIGGER trg_orcamentos_reforma_congelar
BEFORE UPDATE ON public.orcamentos_reforma
FOR EACH ROW EXECUTE FUNCTION public.fn_congelar_ao_aprovar();

DROP TRIGGER IF EXISTS trg_orcamentos_reforma_updated_at ON public.orcamentos_reforma;
CREATE TRIGGER trg_orcamentos_reforma_updated_at
BEFORE UPDATE ON public.orcamentos_reforma
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Atividades sincronizam datas em oportunidades
DROP TRIGGER IF EXISTS trg_atividades_sync_opp ON public.atividades;
CREATE TRIGGER trg_atividades_sync_opp
AFTER INSERT OR UPDATE OR DELETE ON public.atividades
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_oportunidade_atividades();

DROP TRIGGER IF EXISTS trg_atividades_updated_at ON public.atividades;
CREATE TRIGGER trg_atividades_updated_at
BEFORE UPDATE ON public.atividades
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Histórico e eventos automáticos em oportunidades
DROP TRIGGER IF EXISTS trg_opp_log_created ON public.oportunidades;
CREATE TRIGGER trg_opp_log_created
AFTER INSERT ON public.oportunidades
FOR EACH ROW EXECUTE FUNCTION public.log_oportunidade_created();

DROP TRIGGER IF EXISTS trg_opp_log_changes ON public.oportunidades;
CREATE TRIGGER trg_opp_log_changes
AFTER UPDATE ON public.oportunidades
FOR EACH ROW EXECUTE FUNCTION public.log_oportunidade_changes();

DROP TRIGGER IF EXISTS trg_opp_evento_atividade ON public.oportunidades;
CREATE TRIGGER trg_opp_evento_atividade
AFTER UPDATE ON public.oportunidades
FOR EACH ROW EXECUTE FUNCTION public.fn_log_oportunidade_evento();

DROP TRIGGER IF EXISTS trg_opp_updated_at ON public.oportunidades;
CREATE TRIGGER trg_opp_updated_at
BEFORE UPDATE ON public.oportunidades
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- updated_at em demais tabelas
DROP TRIGGER IF EXISTS trg_clientes_updated_at ON public.clientes;
CREATE TRIGGER trg_clientes_updated_at
BEFORE UPDATE ON public.clientes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_contatos_updated_at ON public.contatos;
CREATE TRIGGER trg_contatos_updated_at
BEFORE UPDATE ON public.contatos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
