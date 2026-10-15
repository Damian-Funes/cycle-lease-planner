import { useState } from "react";
import { Phone, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLigacoesJulia } from "@/hooks/useLigacoesJulia";
import { motivoJulia, statusJulia, type LigacaoJulia } from "@/lib/julia";
import JuliaConversa, { JuliaChance } from "./JuliaConversa";

export default function JuliaHistorico({ orcamentoId, oportunidadeId }: { orcamentoId?: string; oportunidadeId?: string }) {
  const { data = [], isLoading, error, refetch } = useLigacoesJulia({ orcamentoId, oportunidadeId });
  const [selected, setSelected] = useState<LigacaoJulia | null>(null);
  return <section className="space-y-4 py-4" aria-label="Histórico de ligações da Júlia">
    <h2 className="text-base font-semibold flex items-center gap-2"><Phone className="w-4 h-4 text-primary" /> Histórico de ligações da Júlia</h2>
    {isLoading && <p className="flex gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Carregando ligações...</p>}
    {error && <div role="alert" className="text-sm text-destructive">Não foi possível carregar as ligações. <Button variant="outline" size="sm" onClick={() => void refetch()}>Tentar novamente</Button></div>}
    {!isLoading && !error && data.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma ligação registrada.</p>}
    <div className="divide-y">
      {data.map((r) => <article key={r.id} className="py-4 space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <time dateTime={r.created_at}>{new Date(r.created_at).toLocaleString("pt-BR")}</time>
          <Badge variant={r.status === "falhou" ? "destructive" : "outline"}>{r.status === "discando" && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}{statusJulia(r.status)}</Badge>
          <JuliaChance value={r.chance_reabrir} />
          <span className="text-muted-foreground">Tentativa {r.tentativa}{r.duracao_segundos !== null ? ` · ${r.duracao_segundos} s` : ""}</span>
        </div>
        <p className="font-medium text-sm">{motivoJulia(r.motivo_principal)}</p>
        {r.resumo && <p className="text-sm whitespace-pre-wrap break-words text-muted-foreground">{r.resumo}</p>}
        {r.erro && <p className="text-sm text-destructive">{r.erro}</p>}
        <Button variant="outline" size="sm" onClick={() => setSelected(r)}>Ver conversa</Button>
      </article>)}
    </div>
    <JuliaConversa ligacao={selected ? data.find((r) => r.id === selected.id) ?? selected : null} onClose={() => setSelected(null)} />
  </section>;
}