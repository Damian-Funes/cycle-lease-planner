import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { chanceJulia, transcricaoJulia, type LigacaoJulia } from "@/lib/julia";

export function JuliaChance({ value }: { value: string | null }) {
  return <Badge variant="outline" className={value === "alta" ? "bg-secondary text-secondary-foreground border-primary/30" : value === "media" ? "bg-accent/20 text-accent-foreground border-accent/40" : "bg-muted text-muted-foreground"}>Chance: {chanceJulia(value)}</Badge>;
}

export default function JuliaConversa({ ligacao, onClose }: { ligacao: LigacaoJulia | null; onClose: () => void }) {
  const mensagens = transcricaoJulia(ligacao?.transcricao ?? null);
  return <Dialog open={!!ligacao} onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="sm:max-w-2xl max-h-[85dvh] flex flex-col">
      <DialogHeader>
        <DialogTitle>Conversa com Júlia</DialogTitle>
        <DialogDescription>{ligacao ? new Date(ligacao.created_at).toLocaleString("pt-BR") : ""} · {ligacao?.telefone}</DialogDescription>
      </DialogHeader>
      <div className="overflow-y-auto min-h-0 space-y-4 py-3" aria-label="Transcrição da ligação">
        {mensagens.length === 0 && <p className="text-sm text-muted-foreground">Transcrição ainda não disponível.</p>}
        {mensagens.map((m, i) => <div key={i} className={`flex ${m.cliente ? "justify-end" : "justify-start"}`}>
          <div className={`max-w-[85%] rounded-lg p-3 ${m.cliente ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
            <div className="text-xs font-semibold mb-1">{m.cliente ? "Cliente" : "Júlia"}{m.seg !== null ? ` · ${Math.floor(m.seg / 60)}:${String(Math.floor(m.seg % 60)).padStart(2, "0")}` : ""}</div>
            <p className="text-sm whitespace-pre-wrap break-words">{m.texto}</p>
          </div>
        </div>)}
      </div>
    </DialogContent>
  </Dialog>;
}