import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Phone, PhoneIncoming, TrendingUp, Loader2 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { useLigacoesJulia } from "@/hooks/useLigacoesJulia";
import { indicadoresJulia, MOTIVOS_JULIA, motivoJulia, type LigacaoJulia } from "@/lib/julia";
import JuliaConversa, { JuliaChance } from "@/components/JuliaConversa";

export default function JuliaMotivosPerda() {
  const { data = [], isLoading, error, refetch } = useLigacoesJulia();
  const [motivo, setMotivo] = useState("todos");
  const [chance, setChance] = useState("todos");
  const [vendedor, setVendedor] = useState("todos");
  const [pagina, setPagina] = useState(0);
  const [conversa, setConversa] = useState<LigacaoJulia | null>(null);
  const profiles = useQuery({ queryKey: ["julia-vendedores"], retry: false, queryFn: async () => {
    const { data, error } = await supabase.from("profiles").select("user_id, nome").order("nome");
    if (error) throw error;
    return data;
  } });
  const nomes = new Map(profiles.data?.map((p) => [p.user_id, p.nome ?? "Vendedor sem nome"]));
  const vendedores = [...new Set(data.map((r) => r.responsavel_id).filter((id): id is string => !!id))];
  const kpis = indicadoresJulia(data);
  const concluidas = useMemo(() => data.filter((r) => r.status === "concluida"), [data]);
  const filtradas = concluidas.filter((r) => (motivo === "todos" || (motivo === "sem_motivo" ? !r.motivo_principal : r.motivo_principal === motivo)) && (chance === "todos" || (chance === "sem_chance" ? !r.chance_reabrir : r.chance_reabrir === chance)) && (vendedor === "todos" || (vendedor === "sem_responsavel" ? !r.responsavel_id : r.responsavel_id === vendedor)));
  const barras = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of concluidas) { const label = motivoJulia(row.motivo_principal); counts.set(label, (counts.get(label) ?? 0) + 1); }
    return [...counts].map(([motivo, total]) => ({ motivo, total })).sort((a, b) => b.total - a.total);
  }, [concluidas]);
  const filtro = (set: (v: string) => void) => (value: string) => { set(value); setPagina(0); };
  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / 25));
  const atual = Math.min(pagina, totalPaginas - 1);
  return <div className="min-h-screen bg-background">
    <header className="border-b bg-card"><div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0"><Button asChild variant="ghost" size="icon" aria-label="Voltar ao início"><Link to="/"><ArrowLeft className="w-4 h-4" /></Link></Button><h1 className="text-xl font-semibold">Motivos de perda (Júlia)</h1></div><AppHeader />
    </div></header>
    <main className="max-w-6xl mx-auto px-4 py-6 space-y-8">
      {isLoading && <p className="flex gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Carregando ligações...</p>}
      {error && <div role="alert" className="text-destructive">Não foi possível carregar as ligações. <Button variant="outline" size="sm" onClick={() => void refetch()}>Tentar novamente</Button></div>}
      {!isLoading && !error && <>
        <section className="grid sm:grid-cols-3 gap-4" aria-label="Indicadores de ligações">
          {[{ label: "Total de ligações", value: kpis.total.toLocaleString("pt-BR"), icon: Phone }, { label: "Atendidas", value: `${kpis.atendidas.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`, icon: PhoneIncoming }, { label: "Chance alta / média", value: kpis.chances.toLocaleString("pt-BR"), icon: TrendingUp }].map((k) => <Card key={k.label} className="rounded-lg"><CardContent className="p-5"><div className="flex items-center justify-between text-sm text-muted-foreground"><span>{k.label}</span><k.icon className="w-4 h-4 text-primary" /></div><div className="text-3xl font-semibold mt-3 tabular-nums">{k.value}</div></CardContent></Card>)}
        </section>
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Ligações concluídas por motivo</h2>
          {barras.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma ligação concluída.</p> : <ChartContainer config={{ total: { label: "Ligações", color: "hsl(var(--primary))" } }} className="h-[420px] w-full aspect-auto">
            <BarChart data={barras} layout="vertical" margin={{ left: 0, right: 24, top: 4, bottom: 4 }} accessibilityLayer>
              <CartesianGrid horizontal={false} /><XAxis type="number" allowDecimals={false} /><YAxis dataKey="motivo" type="category" width={150} tick={{ fontSize: 11 }} interval={0} /><ChartTooltip content={<ChartTooltipContent />} /><Bar dataKey="total" fill="var(--color-total)" radius={[0, 4, 4, 0]} maxBarSize={30} />
            </BarChart>
          </ChartContainer>}
        </section>
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Ligações concluídas <span className="text-muted-foreground font-normal">({filtradas.length})</span></h2>
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="space-y-1.5"><Label htmlFor="julia-motivo">Motivo</Label><Select value={motivo} onValueChange={filtro(setMotivo)}><SelectTrigger id="julia-motivo"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos os motivos</SelectItem>{Object.entries(MOTIVOS_JULIA).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}<SelectItem value="sem_motivo">Não informado</SelectItem></SelectContent></Select></div>
            <div className="space-y-1.5"><Label htmlFor="julia-chance">Chance de reabrir</Label><Select value={chance} onValueChange={filtro(setChance)}><SelectTrigger id="julia-chance"><SelectValue /></SelectTrigger><SelectContent>{[["todos", "Todas as chances"], ["alta", "Alta"], ["media", "Média"], ["baixa", "Baixa"], ["nenhuma", "Nenhuma"], ["sem_chance", "Não informada"]].map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label htmlFor="julia-vendedor">Vendedor</Label><Select value={vendedor} onValueChange={filtro(setVendedor)}><SelectTrigger id="julia-vendedor"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos os vendedores</SelectItem><SelectItem value="sem_responsavel">Sem responsável</SelectItem>{vendedores.map((id, i) => <SelectItem key={id} value={id}>{nomes.get(id) ?? `Vendedor não disponível ${i + 1}`}</SelectItem>)}</SelectContent></Select>{profiles.error && <p className="text-xs text-destructive">Nomes dos vendedores indisponíveis.</p>}</div>
          </div>
          <div className="overflow-x-auto border rounded-lg"><table className="w-full text-sm min-w-[850px]"><thead className="bg-muted text-muted-foreground"><tr>{["Data", "Orçamento", "Vendedor", "Motivo", "Chance", "Resumo", "Conversa"].map((h) => <th key={h} className="p-3 text-left font-medium">{h}</th>)}</tr></thead><tbody>
            {filtradas.slice(atual * 25, (atual + 1) * 25).map((r) => <tr key={r.id} className="border-t"><td className="p-3 whitespace-nowrap">{new Date(r.created_at).toLocaleString("pt-BR")}</td><td className="p-3">{r.orcamento_id ? <Link className="text-primary underline underline-offset-4" to={`/orcamento?load=${r.orcamento_id}`}>Ver orçamento</Link> : "Sem vínculo"}</td><td className="p-3">{r.responsavel_id ? nomes.get(r.responsavel_id) ?? "Não disponível" : "Sem responsável"}</td><td className="p-3">{motivoJulia(r.motivo_principal)}</td><td className="p-3"><JuliaChance value={r.chance_reabrir} /></td><td className="p-3 min-w-52 max-w-80 break-words">{r.resumo ?? "—"}</td><td className="p-3"><Button variant="outline" size="sm" onClick={() => setConversa(r)}>Ver conversa</Button></td></tr>)}
            {filtradas.length === 0 && <tr><td colSpan={7} className="text-center p-8 text-muted-foreground">Nenhuma ligação para estes filtros.</td></tr>}
          </tbody></table></div>
          {totalPaginas > 1 && <div className="flex justify-end items-center gap-3 text-sm"><Button variant="outline" size="sm" disabled={atual === 0} onClick={() => setPagina(atual - 1)}>Anterior</Button><span>{atual + 1} / {totalPaginas}</span><Button variant="outline" size="sm" disabled={atual + 1 >= totalPaginas} onClick={() => setPagina(atual + 1)}>Próxima</Button></div>}
        </section>
      </>}
    </main>
    <JuliaConversa ligacao={conversa} onClose={() => setConversa(null)} />
  </div>;
}