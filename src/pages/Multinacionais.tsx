import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown, Search } from "lucide-react";
import { toast } from "sonner";
import AppHeader from "@/components/AppHeader";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { agruparParados, rotuloSituacao, textoVia, type LinhaParada } from "@/lib/multinacional";

const fmtData = (d?: string | null) => d ? new Date(d.length === 10 ? `${d}T12:00:00` : d).toLocaleDateString("pt-BR") : "—";
const dias = (n: number | null) => n === null ? "—" : n === 1 ? "1 dia" : `${n} dias`;

function useNomesVendedores(ids: string[]) {
  return useQuery({
    queryKey: ["nomes-vendedores", [...ids].sort().join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, nome").in("user_id", ids);
      return new Map((data ?? []).map(p => [p.user_id, p.nome ?? ""]));
    },
  });
}

function Parados() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["multinacionais-parados"],
    queryFn: async () => {
      const { data, error } = await supabase.from("vw_multinacionais_paradas").select("*");
      if (error) throw error;
      return (data ?? []) as unknown as LinhaParada[];
    },
  });
  const grupos = useMemo(() => agruparParados(data ?? []), [data]);
  const nomes = useNomesVendedores([...new Set(grupos.map(g => g.responsavel_id).filter(Boolean))] as string[]).data;
  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (error) return <p className="text-sm text-muted-foreground">Não foi possível carregar agora.</p>;
  if (grupos.length === 0) return <p className="text-sm text-muted-foreground">Nenhum negócio aberto com multinacionais.</p>;
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Do mais parado para o menos. "Parado" = dias desde a última movimentação de qualquer multinacional do negócio.</p>
      {grupos.map(g => (
        <Card key={g.chave} className="p-3">
          <Collapsible>
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                {g.oportunidade_id
                  ? <Link to={`/crm/deal/${g.oportunidade_id}`} className="font-medium text-primary hover:underline line-clamp-2">{g.cliente_final || g.titulo}</Link>
                  : <p className="font-medium">{g.cliente_final || g.titulo}</p>}
                <p className="text-xs text-muted-foreground truncate">{g.numero_base} · {g.via}{g.responsavel_id && nomes?.get(g.responsavel_id) ? ` · ${nomes.get(g.responsavel_id)}` : ""}</p>
                <p className="text-xs text-muted-foreground">No funil há {dias(g.dias_no_funil)}</p>
              </div>
              <div className="text-right shrink-0">
                <p className={`text-lg font-bold ${g.dias_parado >= 30 ? "text-destructive" : ""}`}>{g.dias_parado}d</p>
                <p className="text-[11px] text-muted-foreground">parado</p>
              </div>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="Ver por multinacional"><ChevronDown className="w-4 h-4" /></Button>
              </CollapsibleTrigger>
            </div>
            <CollapsibleContent className="mt-2 space-y-1 border-t pt-2">
              {g.envios.map(e => (
                <div key={e.envio_id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{e.multinacional ?? "Multinacional"}</span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {rotuloSituacao(e.situacao)} · enviado há {dias(e.dias_desde_envio)} · parado {e.dias_parado}d{e.cobrar_em ? ` · cobrar ${fmtData(e.cobrar_em)}` : ""}
                  </span>
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        </Card>
      ))}
    </div>
  );
}

type OrcLegado = { id: string; numero_orcamento: string; oportunidade_id: string | null; responsavel_id: string | null; organizacoes: { nome: string } | null };
type Grupo = { oportunidade_id: string; titulo: string; multis: string[]; versoes: number; responsavel_id: string | null };

function FilaLegado() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["multinacionais-fila"],
    queryFn: async () => {
      const { data } = await supabase.from("orcamentos")
        .select("id, numero_orcamento, oportunidade_id, responsavel_id, organizacoes!inner(nome, segmento)")
        .eq("organizacoes.segmento", "MULTINACIONAIS")
        .in("status", ["rascunho", "enviado", "aprovado"]);
      const linhas = (data ?? []) as unknown as OrcLegado[];
      const ops = [...new Set(linhas.map(l => l.oportunidade_id).filter(Boolean))] as string[];
      const titulos = new Map<string, string>();
      for (let i = 0; i < ops.length; i += 200) {
        const { data: os } = await supabase.from("oportunidades").select("id, titulo").in("id", ops.slice(i, i + 200));
        for (const o of os ?? []) titulos.set(o.id, o.titulo);
      }
      const m = new Map<string, Grupo>();
      let semNegocio = 0;
      for (const l of linhas) {
        if (!l.oportunidade_id) { semNegocio++; continue; }
        const g = m.get(l.oportunidade_id) ?? { oportunidade_id: l.oportunidade_id, titulo: titulos.get(l.oportunidade_id) ?? l.numero_orcamento, multis: [], versoes: 0, responsavel_id: l.responsavel_id };
        g.versoes++; if (l.organizacoes?.nome) g.multis.push(l.organizacoes.nome);
        m.set(l.oportunidade_id, g);
      }
      return { grupos: [...m.values()].sort((a, b) => b.versoes - a.versoes), semNegocio };
    },
  });
  const nomes = useNomesVendedores([...new Set((data?.grupos ?? []).map(g => g.responsavel_id).filter(Boolean))] as string[]).data;
  const [alvo, setAlvo] = useState<Grupo | null>(null);
  const [busca, setBusca] = useState("");
  const [escolhido, setEscolhido] = useState<{ id: string; nome: string } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const opcoes = useQuery({
    queryKey: ["cliente-final-busca", busca],
    enabled: busca.trim().length >= 2,
    queryFn: async () => {
      const { data } = await supabase.from("organizacoes").select("id, nome, cidade, segmento")
        .ilike("nome", `%${busca.trim()}%`).or("segmento.is.null,segmento.neq.MULTINACIONAIS").order("nome").limit(8);
      return data ?? [];
    },
  });
  const confirmar = async () => {
    if (!alvo || !escolhido) return;
    setSalvando(true);
    const { error } = await supabase.rpc("fn_definir_cliente_final", { _oportunidade_id: alvo.oportunidade_id, _cliente_final_id: escolhido.id });
    setSalvando(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Cliente final: ${escolhido.nome}. As multinacionais viraram envios.`);
    setAlvo(null);
    ["multinacionais-fila", "multinacionais-parados", "multinacionais-via", "comissao-card"].forEach(k => qc.invalidateQueries({ queryKey: [k] }));
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  const grupos = data?.grupos ?? [];
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Orçamentos antigos gravados com a multinacional como cliente. Escolha o cliente final de cada negócio: o orçamento passa a ser dele e cada multinacional vira um envio. Nada é apagado.
      </p>
      {grupos.length === 0 && <p className="text-sm text-muted-foreground">Nenhum negócio pendente.</p>}
      {grupos.map(g => (
        <Card key={g.oportunidade_id} className="p-3 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <Link to={`/crm/deal/${g.oportunidade_id}`} className="font-medium text-primary hover:underline line-clamp-2">{g.titulo}</Link>
            <p className="text-xs text-muted-foreground truncate">{textoVia(g.multis)} · {g.versoes} versão(ões){g.responsavel_id && nomes?.get(g.responsavel_id) ? ` · ${nomes.get(g.responsavel_id)}` : ""}</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => { setAlvo(g); setBusca(""); setEscolhido(null); }}>Definir cliente final</Button>
        </Card>
      ))}
      {!!data?.semNegocio && <p className="text-xs text-muted-foreground">{data.semNegocio} orçamento(s) sem negócio vinculado não entram na fila.</p>}

      <Dialog open={!!alvo} onOpenChange={o => !o && setAlvo(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cliente final de {alvo?.titulo}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={busca} onChange={e => { setBusca(e.target.value); setEscolhido(null); }} placeholder="Nome da empresa (cliente final)" className="pl-8" autoFocus />
            </div>
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {(opcoes.data ?? []).map(o => (
                <button key={o.id} onClick={() => setEscolhido({ id: o.id, nome: o.nome })}
                  className={`w-full text-left rounded-md border px-3 py-2 text-sm ${escolhido?.id === o.id ? "border-primary bg-primary/5" : ""}`}>
                  <span className="font-medium">{o.nome}</span>{o.cidade ? <span className="text-muted-foreground"> · {o.cidade}</span> : null}
                </button>
              ))}
              {busca.trim().length >= 2 && opcoes.isSuccess && (opcoes.data ?? []).length === 0 && <p className="text-xs text-muted-foreground">Nenhuma empresa encontrada.</p>}
            </div>
            {escolhido && <p className="text-xs text-muted-foreground">Todas as versões de {alvo && textoVia(alvo.multis).replace("via ", "")} deste negócio passam para <b>{escolhido.nome}</b> (a comissão segue a regra do cliente final).</p>}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAlvo(null)}>Cancelar</Button>
            <Button onClick={confirmar} disabled={!escolhido || salvando}>{salvando ? "Salvando…" : "Confirmar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function Multinacionais() {
  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b bg-card">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Button asChild variant="ghost" size="icon" aria-label="Voltar"><Link to="/comissoes"><ArrowLeft className="w-4 h-4" /></Link></Button>
            <h1 className="text-xl font-semibold truncate">Multinacionais</h1>
          </div>
          <AppHeader />
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-6">
        <Tabs defaultValue="parados">
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="parados">Parados</TabsTrigger>
            <TabsTrigger value="fila">Sem cliente final</TabsTrigger>
          </TabsList>
          <TabsContent value="parados" className="mt-4"><Parados /></TabsContent>
          <TabsContent value="fila" className="mt-4"><FilaLegado /></TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
