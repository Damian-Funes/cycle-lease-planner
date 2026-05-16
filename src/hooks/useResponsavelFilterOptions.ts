import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, AppRole } from "./useAuth";

export interface ResponsavelProfile {
  user_id: string;
  nome: string | null;
  email: string;
}

/**
 * Roles que podem filtrar atividades/registros de OUTROS responsáveis.
 * Marketing/comercial/rtv só veem "Eu" e "Todos" (RLS já restringe os dados).
 */
const ROLES_QUE_VEEM_OUTROS: AppRole[] = [
  "admin",
  "gerente_comercial",
  "viewer",
  "financeiro",
  "engenharia",
  "operacao",
];

/**
 * Hook para os FILTROS de listagem (Atividades, Crm, Organizações, Pessoas, Relatórios).
 * NÃO usar nos dropdowns de criação/edição — esses devem listar todos os profiles.
 */
export function useResponsavelFilterOptions() {
  const { isAdmin, hasAnyRole } = useAuth();
  const showOthers = isAdmin || hasAnyRole(ROLES_QUE_VEEM_OUTROS);

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-lite-filter"],
    enabled: showOthers,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("user_id, nome, email")
        .eq("status", "approved");
      return (data ?? []) as ResponsavelProfile[];
    },
  });

  return { profiles: showOthers ? profiles : [], showOthers };
}
