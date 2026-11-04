import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Camera, X } from "lucide-react";
import { toast } from "sonner";
import { criarInformativo, posicaoAtual } from "@/lib/viagemDados";
import type { RotaParada } from "@/lib/rotas";

const nomeParada = (p: RotaParada) => p.tipo === "pernoite" ? `Pernoite: ${p.hotel_nome ?? ""}` : (p.organizacao?.nome_fantasia || p.organizacao?.nome || p.cidade || "Parada");

export default function InformativoDialog({ open, onOpenChange, rotaId, paradas, paradaInicial, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; rotaId: string; paradas: RotaParada[]; paradaInicial?: string | null; onSaved: () => void;
}) {
  const [texto, setTexto] = useState("");
  const [fotos, setFotos] = useState<File[]>([]);
  const [paradaId, setParadaId] = useState<string>(paradaInicial ?? "");
  const [usarLocal, setUsarLocal] = useState(true);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    if (!texto.trim()) { toast.error("Escreva o informativo"); return; }
    setSalvando(true);
    try {
      const posicao = usarLocal ? await posicaoAtual() : null;
      await criarInformativo({ rotaId, texto, fotos, parada: paradas.find((p) => p.id === paradaId) ?? null, posicao });
      toast.success("Informativo registrado");
      setTexto(""); setFotos([]); setParadaId("");
      onOpenChange(false); onSaved();
    } catch (e) { toast.error((e as Error).message); } finally { setSalvando(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!salvando) onOpenChange(v); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Novo informativo</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="inf-texto">O que aconteceu? *</Label>
            <Textarea id="inf-texto" rows={4} className="text-base" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ex.: Visitei a Cotrijal, gerente pediu proposta da LSB150" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="inf-parada">Ligar a uma parada (opcional)</Label>
            <select id="inf-parada" className="w-full h-12 rounded-md border border-input bg-background px-3 text-base" value={paradaId} onChange={(e) => setParadaId(e.target.value)}>
              <option value="">Nenhuma</option>
              {paradas.map((p, i) => <option key={p.id} value={p.id}>{i + 1}. {nomeParada(p)}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label className="flex h-14 items-center justify-center gap-2 rounded-md border-2 border-dashed border-input text-base font-medium cursor-pointer">
              <Camera className="w-5 h-5" /> Tirar foto / escolher
              <input type="file" accept="image/*" capture="environment" multiple className="sr-only"
                onChange={(e) => { const fs = Array.from(e.target.files ?? []); setFotos((f) => [...f, ...fs].slice(0, 6)); e.target.value = ""; }} />
            </label>
            {fotos.length > 0 && <ul className="flex flex-wrap gap-2">{fotos.map((f, i) => (
              <li key={i} className="relative"><img src={URL.createObjectURL(f)} alt={`Foto ${i + 1}`} className="w-16 h-16 object-cover rounded" />
                <button type="button" aria-label="Remover foto" className="absolute -top-2 -right-2 rounded-full bg-destructive text-destructive-foreground p-0.5" onClick={() => setFotos((x) => x.filter((_, j) => j !== i))}><X className="w-3 h-3" /></button></li>))}</ul>}
            <p className="text-xs text-muted-foreground">As fotos são reduzidas antes do envio para economizar dados.</p>
          </div>
          <div className="flex items-center justify-between"><Label htmlFor="inf-local">Registrar minha localização</Label><Switch id="inf-local" checked={usarLocal} onCheckedChange={setUsarLocal} /></div>
        </div>
        <DialogFooter><Button size="lg" className="w-full h-12 text-base" onClick={salvar} disabled={salvando}>{salvando ? "Enviando..." : "Salvar informativo"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
