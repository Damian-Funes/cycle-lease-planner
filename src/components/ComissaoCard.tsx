import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Coins } from "lucide-react";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { porVendedor, resumoComissao, type OrcamentoComissao } from "@/lib/comissao";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** Card motivacional de comissão. Fica escondido enquanto a função do banco não existir. */
export default function ComissaoCard() {
  const { user, hasAnyRole } = useAuth();
  const navigate = useNavigate();
  const gestor = hasAnyRole(["admin", "gerente_comercial"]);
  const { data } = useQuery({
    queryKey: ["comissao-base", user?.id],
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("fn_comissao_base");
      return error ? null : ((data ?? []) as OrcamentoComissao[]);
    },
  });
  if (!data || data.length === 0) return null;
  const r = resumoComissao(data);
  const vendedores = gestor ? porVendedor(data).filter(v => v.emJogo > 0 || v.garantidoAno > 0) : [];

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

      {r.top3.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Feche estes primeiro</p>
          {r.top3.map(o => (
            <button key={o.id} onClick={() => navigate(`/orcamento?load=${o.id}`)} className="w-full text-left rounded-md border p-3 hover:bg-muted/50">
              <p className="font-medium truncate">{o.cliente || o.numero}</p>
              <p className="text-sm text-muted-foreground">{brl(o.venda)} · {gestor && o.vendedor_nome ? `${o.vendedor_nome} ganha` : "você ganha"} <span className="font-semibold text-primary">{brl(o.ganha)}</span></p>
            </button>
          ))}
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
      <p className="text-xs text-muted-foreground">Estimativa: novo 4%, recorrente 5%, seminovo 2% sobre a venda. Paga só com pedido assinado.</p>
    </Card>
  );
}
