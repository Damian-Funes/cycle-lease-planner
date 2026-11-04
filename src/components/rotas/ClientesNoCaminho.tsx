import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Loader2, Plus } from "lucide-react";
import { formatBRL } from "@/lib/smartcycle";
import { objetivoSugerido, textoMotivo } from "@/lib/rotaNavegacao";
import type { SugestaoCaminho } from "@/lib/clientesNoCaminho";

const RAIOS = [10, 30, 50, 100];
const PAGINA = 30;

interface Props {
  sugestoes: SugestaoCaminho[];
  carregando: boolean;
  erro: string | null;
  raioKm: number;
  onRaio: (km: number) => void;
  selecionadaId: string | null;
  onSelecionar: (id: string | null) => void;
  onAdicionar: (s: SugestaoCaminho, objetivo: string) => Promise<void>;
  busy: boolean;
}

export default function ClientesNoCaminho({ sugestoes, carregando, erro, raioKm, onRaio, selecionadaId, onSelecionar, onAdicionar, busy }: Props) {
  const [aberto, setAberto] = useState(false);
  const [limite, setLimite] = useState(PAGINA);
  const [objetivo, setObjetivo] = useState("");

  useEffect(() => {
    if (!selecionadaId) return;
    const s = sugestoes.find((x) => x.id === selecionadaId);
    if (!s) return;
    setAberto(true);
    setObjetivo(objetivoSugerido(s.motivo));
    const idx = sugestoes.indexOf(s);
    if (idx >= limite) setLimite(idx + 1);
    setTimeout(() => document.getElementById(`sugestao-${s.id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 50);
  }, [selecionadaId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Card className="p-3">
      <Collapsible open={aberto} onOpenChange={setAberto}>
        <div className="flex items-center justify-between gap-2">
          <CollapsibleTrigger className="flex items-center gap-2 font-semibold text-sm">
            <ChevronDown className={`w-4 h-4 transition-transform ${aberto ? "" : "-rotate-90"}`} />
            Clientes no caminho ({sugestoes.length})
            {carregando && <Loader2 className="w-4 h-4 animate-spin" />}
          </CollapsibleTrigger>
          <div className="flex gap-1" role="group" aria-label="Distância do trajeto">
            {RAIOS.map((r) => (
              <Button key={r} size="sm" variant={r === raioKm ? "default" : "outline"} className="h-7 px-2 text-xs" onClick={() => onRaio(r)}>{r} km</Button>
            ))}
          </div>
        </div>
        <CollapsibleContent className="mt-3 space-y-2">
          {erro && <p className="text-sm text-destructive">{erro}</p>}
          {!carregando && !erro && sugestoes.length === 0 && <p className="text-sm text-muted-foreground">Nenhum cliente a até {raioKm} km do trajeto.</p>}
          {sugestoes.slice(0, limite).map((s) => {
            const sel = s.id === selecionadaId;
            return (
              <div key={s.id} id={`sugestao-${s.id}`} className={`border rounded-md p-2 text-sm ${sel ? "border-primary bg-primary/5" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{s.nome}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.cidade ?? "—"}{s.estado ? `/${s.estado}` : ""} · {Math.round(s.distanciaKm)} km da rota · desvio ≈ {Math.round(s.distanciaKm * 2)} km ida e volta (estimativa)
                    </p>
                    {s.aproximada && <p className="text-xs text-muted-foreground italic">Localização aproximada (centro da cidade)</p>}
                    <p className="text-xs mt-1"><Badge variant={s.motivo.prioridade <= 2 ? "default" : "secondary"} className="text-[10px] mr-1">P{s.motivo.prioridade}</Badge>{textoMotivo(s.motivo, formatBRL)}</p>
                  </div>
                  {!sel && (
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => { onSelecionar(s.id); setObjetivo(objetivoSugerido(s.motivo)); }}>
                      <Plus className="w-4 h-4 mr-1" />Adicionar à rota
                    </Button>
                  )}
                </div>
                {sel && (
                  <div className="mt-2 flex gap-2">
                    <Input aria-label="Objetivo da visita" value={objetivo} onChange={(e) => setObjetivo(e.target.value)} placeholder="Objetivo *" />
                    <Button size="sm" disabled={busy || !objetivo.trim()} onClick={async () => { await onAdicionar(s, objetivo.trim()); onSelecionar(null); }}>Confirmar</Button>
                    <Button size="sm" variant="ghost" onClick={() => onSelecionar(null)}>Cancelar</Button>
                  </div>
                )}
              </div>
            );
          })}
          {sugestoes.length > limite && <Button variant="ghost" size="sm" onClick={() => setLimite((l) => l + PAGINA)}>Ver mais ({sugestoes.length - limite})</Button>}
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
