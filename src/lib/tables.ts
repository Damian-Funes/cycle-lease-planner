/**
 * Helpers para escolher tabela vs view de leitura.
 *
 * Marketing não enxerga campos monetários — RLS bloqueia acesso direto às
 * tabelas `oportunidades` / `propostas` / `orcamentos` / `orcamentos_reforma`,
 * e às views `v_relatorio_*` (filtradas no corpo).
 * Para leitura, marketing acessa as views `*_sem_valores`.
 *
 * ⚠️ USAR APENAS EM LEITURA (SELECT).
 *    Não usar em INSERT/UPDATE/DELETE — marketing não escreve nessas tabelas.
 */
import { useAuth } from "@/hooks/useAuth";

export function useReadTables() {
  const { hasRole } = useAuth();
  const isMkt = hasRole("marketing");
  return {
    oportunidades: isMkt ? "oportunidades_sem_valores" : "oportunidades",
    oportunidades_kanban: isMkt ? "v_oportunidades_kanban_sem_valores" : "v_oportunidades_kanban",
    propostas: isMkt ? "propostas_sem_valores" : "propostas",
    orcamentos: isMkt ? "orcamentos_sem_valores" : "orcamentos",
    orcamentos_reforma: isMkt ? "orcamentos_reforma_sem_valores" : "orcamentos_reforma",
  } as const;
}
