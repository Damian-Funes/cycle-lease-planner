import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

/**
 * Regra única de "completa" (espelha a visão `organizacao_completude` do banco, que é a autoridade):
 * ao menos 1 pessoa de contato com telefone/celular + cidade + UF + responsável. E-mail não conta.
 * Telefone da empresa sem pessoa NÃO conta. Organizações descartadas ficam de fora.
 */
export interface OrgIncompletaFlags {
  semContato: boolean;
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

export const telefoneValido = (t?: string | null) => (t ?? "").replace(/\D/g, "").length >= 10;

/** Usado só como plano B (antes da migração) e nos testes. */
export function avaliarIncompletude(o: any, contatosComTelefone: number): OrgIncompletaFlags {
  return {
    semContato: contatosComTelefone === 0,
    semCidadeEstado: isVazio(o.cidade) || (isVazio(o.estado) && isVazio(o.estado_id)),
    semResponsavel: isVazio(o.responsavel_id),
  };
}

export function temAlgumProblema(f: OrgIncompletaFlags) {
  return f.semContato || f.semCidadeEstado || f.semResponsavel;
}

export function faltasTexto(f: OrgIncompletaFlags): string[] {
  return [f.semContato && "contato com telefone", f.semCidadeEstado && "cidade/UF", f.semResponsavel && "responsável"].filter(Boolean) as string[];
}

export function useOrganizacoesIncompletas() {
  const { user, hasAnyRole, isAdmin } = useAuth();
  const enabled = !!user && (isAdmin || hasAnyRole(["comercial", "gerente_comercial", "rtv"]));

  return useQuery({
    queryKey: ["organizacoes-incompletas", user?.id],
    enabled,
    queryFn: async () => {
      const map = new Map<string, OrgIncompletaFlags>();
      const view = await (supabase as any).from("organizacao_completude")
        .select("id, falta_contato, falta_cidade, falta_uf, falta_responsavel").limit(5000);
      if (!view.error) {
        for (const r of (view.data ?? []) as any[]) {
          const f = { semContato: !!r.falta_contato, semCidadeEstado: !!(r.falta_cidade || r.falta_uf), semResponsavel: !!r.falta_responsavel };
          if (temAlgumProblema(f)) map.set(r.id, f);
        }
        return { map, total: map.size };
      }
      // Plano B enquanto a migração não foi aplicada: mesma regra, calculada aqui.
      const [orgsRes, pessoasRes] = await Promise.all([
        (supabase as any).from("organizacoes").select("id, cidade, estado, estado_id, responsavel_id"),
        supabase.from("pessoas").select("organizacao_id, telefone, celular"),
      ]);
      const comTel = new Map<string, number>();
      ((pessoasRes.data ?? []) as any[]).forEach((p) => {
        if (p.organizacao_id && (telefoneValido(p.telefone) || telefoneValido(p.celular))) comTel.set(p.organizacao_id, (comTel.get(p.organizacao_id) ?? 0) + 1);
      });
      ((orgsRes.data ?? []) as any[]).forEach((o) => {
        const f = avaliarIncompletude(o, comTel.get(o.id) ?? 0);
        if (temAlgumProblema(f)) map.set(o.id, f);
      });
      return { map, total: map.size };
    },
    staleTime: 30_000,
  });
}
