import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Coins } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { alternarClienteAntigo, clienteAntigo, paraComissao, porVendedor, resumoComissao, type LinhaOrcamento } from "@/lib/comissao";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
// Só colunas de venda: o card nunca lê custo.
const COLUNAS = "id,numero_orcamento,nome_cliente,subtotal,desconto_tipo,desconto_valor,status,updated_at,responsavel_id,organizacao_id,organizacoes(id,tags,responsavel_id)";
type Org = { id: string; tags: string[] | null; responsavel_id: string | null };

export const permissoesComissao = (hasAnyRole: (r: any[]) => boolean) => {
  const gestor = hasAnyRole(["admin", "gerente_comercial"]);
  const vendedor = hasAnyRole(["comercial", "rtv"]);
  return { gestor, vendedor, pode: gestor || vendedor };
};

// Mesma consulta para o resumo do menu da Home e para a página /comissoes.
export function useComissao() {
  const { user, hasAnyRole } = useAuth();
  const { gestor, pode } = permissoesComissao(hasAnyRole);
  const chave = ["comissao-card", user?.id, gestor];
  const query = useQuery({
    queryKey: chave,
    enabled: !!user && pode,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      let q = supabase.from("orcamentos").select(COLUNAS).in("status", ["rascunho", "enviado", "aprovado"]).limit(1000);
      if (!gestor) q = q.eq("responsavel_id", user!.id);
      const { data, error } = await q;
      if (error) return null;
      const linhas = (data ?? []) as unknown as (LinhaOrcamento & { organizacoes: Org | null })[];
      const nomes = new Map<string, string>();
      if (gestor) {
        const ids = [...new Set(linhas.map(l => l.responsavel_id).filter(Boolean))] as string[];
        if (ids.length) {
          const p = await supabase.from("profiles").select("user_id,nome").in("user_id", ids);
          for (const r of p.data ?? []) nomes.set(r.user_id, r.nome ?? "");
        }
      }
      const orgs = new Map<string, Org>();
      for (const l of linhas) if (l.organizacoes) orgs.set(l.organizacoes.id, l.organizacoes);
      return { lista: linhas.map(l => paraComissao(l, l.organizacoes?.tags, l.responsavel_id ? nomes.get(l.responsavel_id) : null)), orgs };
    },
  });
  return { ...query, chave, gestor, pode };
}

export default function ComissaoCard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data, chave, gestor, isLoading } = useComissao();
  const [todos, setTodos] = useState(false);
  const [salvando, setSalvando] = useState<string | null>(null);
  if (isLoading) return <Card className="p-5 text-sm text-muted-foreground">Carregando comissões…</Card>;
  if (data === null) return <Card className="p-5 text-sm text-muted-foreground">Não foi possível carregar as comissões agora.</Card>;
  if (!data || data.lista.length === 0) return <Card className="p-5 text-sm text-muted-foreground">Nenhum orçamento aberto ou fechado no ano para calcular comissão.</Card>;

  const r = resumoComissao(data.lista);
  const vendedores = gestor ? porVendedor(data.lista).filter(v => v.emJogo > 0 || v.garantidoAno > 0) : [];
  const podeMarcar = (org?: Org) => !!org && (gestor || org.responsavel_id === user?.id);

  const marcar = async (orgId: string, valor: boolean) => {
    const org = data.orgs.get(orgId); if (!org) return;
    setSalvando(orgId);
    const { error } = await supabase.from("organizacoes").update({ tags: alternarClienteAntigo(org.tags, valor) }).eq("id", orgId);
    setSalvando(null);
    if (error) { toast.error("Não foi possível marcar. Só o responsável pela empresa ou o admin pode."); return; }
    toast.success(valor ? "Marcado como cliente antigo (5%)" : "Desmarcado: volta para 4%");
    qc.invalidateQueries({ queryKey: chave });
  };

  const lista = todos ? r.abertos : r.top3;
  return (
    <Card className="p-5 space-y-4 border-primary/40">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center"><Coins className="w-5 h-5" /></div>
        <div>
          <p className="text-sm text-muted-foreground">{gestor ? "Comissão em jogo (todos)" : "Sua comissão em jogo"}</p>
          <p className="text-2xl font-bold text-primary">{brl(r.emJogo)}</p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{r.qtdAbertos} orçamento(s) abertos e movimentados nos últimos 90 dias</p>

      {lista.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">{todos ? "Orçamentos abertos" : "Feche estes primeiro"}</p>
          {lista.map(o => {
            const org = o.organizacao_id ? data.orgs.get(o.organizacao_id) : undefined;
            return (
              <div key={o.id} className="rounded-md border p-3 space-y-2">
                <button onClick={() => navigate(`/orcamento?load=${o.id}`)} className="w-full text-left">
                  <p className="font-medium truncate">{o.cliente || o.numero}</p>
                  <p className="text-sm text-muted-foreground">{brl(o.venda)} · {gestor && o.vendedor_nome ? `${o.vendedor_nome} ganha` : "você ganha"} <span className="font-semibold text-primary">{brl(o.ganha)}</span></p>
                </button>
                {org && (
                  <label className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-muted-foreground">Cliente antigo (5%)</span>
                    <Switch checked={clienteAntigo(org.tags)} disabled={!podeMarcar(org) || salvando === org.id}
                      onCheckedChange={v => marcar(org.id, v)} aria-label="Cliente antigo" />
                  </label>
                )}
              </div>
            );
          })}
          {r.abertos.length > 3 && (
            <Button variant="ghost" size="sm" className="w-full" onClick={() => setTodos(!todos)}>
              {todos ? "Mostrar só os 3 maiores" : `Ver todos (${r.abertos.length})`}
            </Button>
          )}
        </div>
      )}

      <div className="rounded-md bg-muted/50 p-3">
        <p className="text-sm text-muted-foreground">Já garantido em {new Date().getFullYear()}</p>
        <p className="text-lg font-semibold">{brl(r.garantidoAno)} <span className="text-sm font-normal text-muted-foreground">({r.qtdGanhos} fechado(s))</span></p>
      </div>

      {gestor && vendedores.length > 0 && (
        <div className="space-y-1">
          <p className="text-sm font-medium">Por vendedor</p>
          {vendedores.map(v => (
            <div key={v.id} className="flex justify-between text-sm gap-2">
              <span className="truncate">{v.nome}</span>
              <span className="text-muted-foreground whitespace-nowrap">{brl(v.emJogo)} em jogo · {brl(v.garantidoAno)} no ano</span>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">Estimativa: 4% sobre a venda, 5% para cliente antigo. Paga só com pedido assinado.</p>
    </Card>
  );
}
