import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Coins, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ItensSemCustoBloco from "@/components/comissao/ItensSemCusto";
import { useViaMultinacional } from "@/hooks/useMultinacionais";
import { numeroBase } from "@/lib/comissao";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { AppRole } from "@/hooks/useAuth";
import { toast } from "sonner";
import { alternarClienteAntigo, clienteAntigo, FILTRO_PADRAO, lerFiltro, paraComissao, resumoFiltrado, ultimasVersoes, type FiltroComissao, type LinhaComissao } from "@/lib/comissao";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
type Org = { id: string; tags: string[] | null; responsavel_id: string | null };

export const permissoesComissao = (hasAnyRole: (r: AppRole[]) => boolean) => {
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
      // A comissão vem pronta do banco (sobre o custo); o navegador nunca lê custo.
      const { data, error } = await supabase.rpc("fn_comissao_orcamentos" as never);
      if (error) return null;
      const linhas = (data ?? []) as unknown as LinhaComissao[];
      const nomes = new Map<string, string>();
      if (gestor) {
        const ids = [...new Set(linhas.map(l => l.responsavel_id).filter(Boolean))] as string[];
        if (ids.length) {
          const p = await supabase.from("profiles").select("user_id,nome").in("user_id", ids);
          for (const r of p.data ?? []) nomes.set(r.user_id, r.nome ?? "");
        }
      }
      const orgs = new Map<string, Org>();
      const orgIds = [...new Set(linhas.map(l => l.organizacao_id).filter(Boolean))] as string[];
      for (let i = 0; i < orgIds.length; i += 200) {
        const { data: os } = await supabase.from("organizacoes").select("id,tags,responsavel_id").in("id", orgIds.slice(i, i + 200));
        for (const o of (os ?? []) as Org[]) orgs.set(o.id, o);
      }
      return { lista: linhas.map(l => paraComissao(l, l.responsavel_id ? nomes.get(l.responsavel_id) : null)), orgs };
    },
  });
  return { ...query, chave, gestor, pode };
}

const chaveFiltro = (uid?: string) => `comissoes-filtro:${uid ?? "anon"}`;
function useFiltroSalvo(uid?: string) {
  const [f, setF] = useState<FiltroComissao>(() => {
    try { return lerFiltro(localStorage.getItem(chaveFiltro(uid))); } catch { return { ...FILTRO_PADRAO }; }
  });
  useEffect(() => { try { setF(lerFiltro(localStorage.getItem(chaveFiltro(uid)))); } catch { /* sem storage */ } }, [uid]);
  const mudar = (p: Partial<FiltroComissao>) => setF(prev => {
    const n = { ...prev, ...p };
    try { localStorage.setItem(chaveFiltro(uid), JSON.stringify(n)); } catch { /* sem storage */ }
    return n;
  });
  return [f, mudar] as const;
}

const PERIODO_TXT = { "90d": "nos últimos 90 dias", ano: "neste ano", tudo: "em todo o período" } as const;

export default function ComissaoCard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data, chave, gestor, isLoading } = useComissao();
  const via = useViaMultinacional().data?.porOrcamento;
  const [todos, setTodos] = useState(false);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [filtroSalvo, mudar] = useFiltroSalvo(user?.id);
  const filtro: FiltroComissao = gestor ? filtroSalvo : { ...filtroSalvo, vendedor: "todos" };
  const lista = data?.lista ?? [];
  const r = useMemo(() => resumoFiltrado(lista, filtro), [lista, filtro.busca, filtro.status, filtro.vendedor, filtro.periodo]);
  const vendedoresOpcoes = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of lista) m.set(o.vendedor_id ?? "—", o.vendedor_nome || "Sem responsável");
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
  }, [lista]);
  const ultimas = useMemo(() => ultimasVersoes(lista).map(o => ({ id: o.id, numero: o.numero })), [lista]);

  if (isLoading) return <Card className="p-5 text-sm text-muted-foreground">Carregando comissões…</Card>;
  if (data === null) return <Card className="p-5 text-sm text-muted-foreground">Não foi possível carregar as comissões agora.</Card>;
  if (!data || data.lista.length === 0) return <Card className="p-5 text-sm text-muted-foreground">Nenhum orçamento aberto ou fechado para calcular comissão.</Card>;

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

  const mostrar = todos ? r.linhas : r.linhas.slice(0, 3);
  return (
    <div className="space-y-4">
      <Card className="p-3 space-y-2">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={filtroSalvo.busca} onChange={e => mudar({ busca: e.target.value })} placeholder="Cliente ou nº do orçamento"
            className="h-9 pl-8 text-sm" aria-label="Buscar cliente ou número" />
        </div>
        <div className={`grid gap-2 ${gestor ? "grid-cols-3" : "grid-cols-2"}`}>
          <Select value={filtro.status} onValueChange={v => mudar({ status: v as FiltroComissao["status"] })}>
            <SelectTrigger className="h-9 text-xs px-2" aria-label="Status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="abertos">Abertos</SelectItem><SelectItem value="ganhos">Ganhos</SelectItem><SelectItem value="todos">Todos</SelectItem>
            </SelectContent>
          </Select>
          {gestor && (
            <Select value={filtro.vendedor} onValueChange={v => mudar({ vendedor: v })}>
              <SelectTrigger className="h-9 text-xs px-2" aria-label="Vendedor"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos vendedores</SelectItem>
                {vendedoresOpcoes.map(([id, nome]) => <SelectItem key={id} value={id}>{nome}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Select value={filtro.periodo} onValueChange={v => mudar({ periodo: v as FiltroComissao["periodo"] })}>
            <SelectTrigger className="h-9 text-xs px-2" aria-label="Período"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="90d">Últimos 90 dias</SelectItem><SelectItem value="ano">Este ano</SelectItem><SelectItem value="tudo">Tudo</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="p-5 space-y-4 border-primary/40">
        <div className="grid grid-cols-2 gap-3">
          {filtro.status !== "ganhos" && (
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 shrink-0 rounded-lg bg-primary/10 text-primary flex items-center justify-center"><Coins className="w-5 h-5" /></div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{gestor ? "Em jogo" : "Sua comissão em jogo"}</p>
                <p className="text-xl font-bold text-primary">{brl(r.emJogo)}</p>
                <p className="text-xs text-muted-foreground">{r.abertos.length} aberto(s)</p>
              </div>
            </div>
          )}
          {filtro.status !== "abertos" && (
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Já garantido</p>
              <p className="text-xl font-semibold">{brl(r.garantido)}</p>
              <p className="text-xs text-muted-foreground">{r.ganhos.length} fechado(s)</p>
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground">Orçamentos movimentados {PERIODO_TXT[filtro.periodo]}{filtroSalvo.busca ? ` com "${filtroSalvo.busca}"` : ""}.</p>

        {r.linhas.length === 0 && <p className="text-sm text-muted-foreground">Nenhum orçamento com esse filtro.</p>}
        {mostrar.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">{todos ? "Orçamentos" : filtro.status === "ganhos" ? "Maiores fechados" : "Feche estes primeiro"}</p>
            {mostrar.map(o => {
              const org = o.organizacao_id ? data.orgs.get(o.organizacao_id) : undefined;
              const ganho = o.status === "aprovado";
              return (
                <div key={o.id} className="rounded-md border p-3 space-y-2">
                  <button onClick={() => navigate(`/orcamento?load=${o.id}`)} className="w-full text-left">
                    <p className="font-medium truncate">{o.cliente || o.numero}</p>
                    <p className="text-xs text-muted-foreground">{o.numero}{ganho ? " · ganho" : ""}{via?.get(`${numeroBase(o.numero)}|${o.organizacao_id ?? ""}`) ? ` · ${via.get(`${numeroBase(o.numero)}|${o.organizacao_id ?? ""}`)}` : ""}</p>
                    <p className="text-sm text-muted-foreground">{brl(o.venda)} · {gestor && o.vendedor_nome ? `${o.vendedor_nome} ${ganho ? "ganhou" : "ganha"}` : ganho ? "você ganhou" : "você ganha"} <span className="font-semibold text-primary">{brl(o.ganha)}</span></p>
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
            {r.linhas.length > 3 && (
              <Button variant="ghost" size="sm" className="w-full" onClick={() => setTodos(!todos)}>
                {todos ? "Mostrar só os 3 maiores" : `Ver todos (${r.linhas.length})`}
              </Button>
            )}
          </div>
        )}

        {gestor && filtro.vendedor === "todos" && r.porVendedor.length > 0 && (
          <div className="space-y-1">
            <p className="text-sm font-medium">Por vendedor</p>
            {r.porVendedor.map(v => (
              <button key={v.id} onClick={() => mudar({ vendedor: v.id })} className="w-full flex justify-between text-sm gap-2 text-left">
                <span className="truncate">{v.nome}</span>
                <span className="text-muted-foreground whitespace-nowrap">
                  {filtro.status !== "ganhos" && `${brl(v.emJogo)} em jogo`}{filtro.status === "todos" && " · "}{filtro.status !== "abertos" && `${brl(v.garantido)} garantido`}
                </span>
              </button>
            ))}
          </div>
        )}

        {gestor && (
          <Button variant="outline" size="sm" className="w-full" onClick={() => navigate("/multinacionais")}>
            Negócios parados com multinacionais
          </Button>
        )}
        {gestor && <ItensSemCustoBloco orcamentos={ultimas} />}
        <p className="text-xs text-muted-foreground">Estimativa: 4% sobre o custo dos equipamentos, 5% para cliente antigo. Desconto não muda a comissão.</p>
      </Card>
    </div>
  );
}
