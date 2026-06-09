import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface OrgIncompletaFlags {
  semContato: boolean;
  semTelefone: boolean;
  semEmail: boolean;
  semCidadeEstado: boolean;
  semResponsavel: boolean;
}

export interface OrgIncompletaRow {
  id: string;
  nome: string;
  flags: OrgIncompletaFlags;
}

function isVazio(v: any) {
  return v === null || v === undefined || String(v).trim() === "";
}

export function avaliarIncompletude(o: any, contatosCount: number): OrgIncompletaFlags {
  return {
    semContato: contatosCount === 0,
    semTelefone: isVazio(o.telefone_principal),
    semEmail: isVazio(o.email_principal),
    semCidadeEstado: isVazio(o.cidade) || (isVazio(o.estado) && isVazio(o.estado_id)),
    semResponsavel: isVazio(o.responsavel_id),
  };
}

export function temAlgumProblema(f: OrgIncompletaFlags) {
  return f.semContato || f.semTelefone || f.semEmail || f.semCidadeEstado || f.semResponsavel;
}

export function useOrganizacoesIncompletas() {
  const { user, hasAnyRole, isAdmin } = useAuth();
  const enabled = !!user && (isAdmin || hasAnyRole(["comercial", "gerente_comercial", "rtv"]));

  return useQuery({
    queryKey: ["organizacoes-incompletas", user?.id],
    enabled,
    queryFn: async () => {
      const [orgsRes, pessoasRes] = await Promise.all([
        (supabase as any).from("organizacoes").select("id, nome, telefone_principal, email_principal, cidade, estado, estado_id, responsavel_id"),
        supabase.from("pessoas").select("organizacao_id"),
      ]);
      const orgs = (orgsRes.data ?? []) as any[];
      const pessoas = (pessoasRes.data ?? []) as any[];
      const countByOrg = new Map<string, number>();
      pessoas.forEach((p) => {
        if (p.organizacao_id) countByOrg.set(p.organizacao_id, (countByOrg.get(p.organizacao_id) ?? 0) + 1);
      });
      const map = new Map<string, OrgIncompletaFlags>();
      let total = 0;
      orgs.forEach((o) => {
        const f = avaliarIncompletude(o, countByOrg.get(o.id) ?? 0);
        if (temAlgumProblema(f)) {
          map.set(o.id, f);
          total += 1;
        }
      });
      return { map, total };
    },
    staleTime: 30_000,
  });
}
