import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { geocodeAddress } from "@/lib/maps";
import { diaRota } from "@/lib/rotasFluxo";
import { parseValorBR as parseBRL } from "@/lib/viagem";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Hotel } from "lucide-react";
import { toast } from "sonner";

export type NovoPernoite = { dia: string; hotel_nome: string; cidade: string; estado: string; latitude: number; longitude: number; valor_diaria_est: number };
type HotelSug = { id: string; nome: string; endereco: string; lat: number; lng: number; nota: number | null; cidade: string | null; uf: string | null };

export default function PernoiteDialog({ open, onOpenChange, dias, diaInicial, pontoReferencia, onSalvar }: {
  open: boolean; onOpenChange: (o: boolean) => void; dias: string[]; diaInicial: string;
  pontoReferencia: (dia: string) => { lat: number; lng: number; cidade?: string | null; estado?: string | null } | null;
  onSalvar: (p: NovoPernoite) => Promise<void>;
}) {
  const [dia, setDia] = useState(diaInicial);
  const [hotel, setHotel] = useState("");
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("");
  const [valor, setValor] = useState("");
  const [coord, setCoord] = useState<{ lat: number; lng: number } | null>(null);
  const [sugs, setSugs] = useState<HotelSug[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDia(diaInicial); setHotel(""); setValor(""); setCoord(null); setSugs(null); setAviso(null);
    const ref = pontoReferencia(diaInicial);
    setCidade(ref?.cidade ?? ""); setUf(ref?.estado ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, diaInicial]);

  async function sugerir() {
    const ref = pontoReferencia(dia);
    if (!ref) { setAviso("Adicione uma parada com localização neste dia para sugerir hotéis."); return; }
    setBuscando(true); setAviso(null);
    try {
      const { data, error } = await supabase.functions.invoke("hoteis-proximos", { body: { lat: ref.lat, lng: ref.lng } });
      if (error || data?.indisponivel) { setAviso("A busca de hotéis não está disponível. Digite o hotel abaixo."); setSugs([]); return; }
      setSugs(data?.hoteis ?? []);
      if (!data?.hoteis?.length) setAviso("Nenhum hotel encontrado em até 15 km. Digite o hotel abaixo.");
    } finally { setBuscando(false); }
  }

  function escolher(h: HotelSug) {
    setHotel(h.nome); setCoord({ lat: h.lat, lng: h.lng });
    if (h.cidade) setCidade(h.cidade);
    if (h.uf) setUf(h.uf);
  }

  async function salvar() {
    const v = parseBRL(valor);
    if (!hotel.trim()) { toast.error("Informe o hotel"); return; }
    if (!cidade.trim()) { toast.error("Informe a cidade"); return; }
    if (!(v >= 0) || !valor.trim()) { toast.error("Informe o valor estimado da diária"); return; }
    setSalvando(true);
    try {
      let c = coord;
      if (!c) c = await geocodeAddress(`${hotel}, ${cidade}, ${uf}, Brasil`) ?? await geocodeAddress(`${cidade}, ${uf}, Brasil`);
      if (!c) { toast.error("Não encontrei essa cidade no mapa. Confira cidade e UF."); return; }
      await onSalvar({ dia, hotel_nome: hotel.trim(), cidade: cidade.trim(), estado: uf.trim().toUpperCase(), latitude: c.lat, longitude: c.lng, valor_diaria_est: v });
      onOpenChange(false);
    } finally { setSalvando(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Adicionar pernoite</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {dias.length > 1 && (
            <div>
              <Label htmlFor="pernoite-dia">Noite do dia</Label>
              <select id="pernoite-dia" className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={dia} onChange={(e) => { setDia(e.target.value); setSugs(null); setCoord(null); }}>
                {dias.slice(0, -1).map((d, i) => <option key={d} value={d}>Dia {i + 1} — {diaRota(d)}</option>)}
              </select>
            </div>
          )}
          <Button type="button" variant="outline" onClick={sugerir} disabled={buscando}>
            {buscando ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Hotel className="w-4 h-4 mr-1" />}Sugerir hotéis perto da última parada do dia
          </Button>
          {aviso && <p className="text-sm text-muted-foreground">{aviso}</p>}
          {sugs && sugs.length > 0 && (
            <ul className="max-h-48 overflow-y-auto border rounded-md divide-y">
              {sugs.map((h) => (
                <li key={h.id}><button type="button" onClick={() => escolher(h)} className={`w-full text-left p-2 text-sm hover:bg-muted ${hotel === h.nome ? "bg-muted" : ""}`}>
                  <span className="font-medium">{h.nome}</span>{h.nota ? ` · ${h.nota.toFixed(1)}★` : ""}<br /><span className="text-xs text-muted-foreground">{h.endereco}</span>
                </button></li>
              ))}
            </ul>
          )}
          <div><Label htmlFor="pernoite-hotel">Hotel *</Label><Input id="pernoite-hotel" value={hotel} onChange={(e) => { setHotel(e.target.value); setCoord(null); }} placeholder="Nome do hotel" /></div>
          <div className="grid grid-cols-[1fr_80px] gap-2">
            <div><Label htmlFor="pernoite-cidade">Cidade *</Label><Input id="pernoite-cidade" value={cidade} onChange={(e) => { setCidade(e.target.value); setCoord(null); }} /></div>
            <div><Label htmlFor="pernoite-uf">UF</Label><Input id="pernoite-uf" maxLength={2} value={uf} onChange={(e) => { setUf(e.target.value); setCoord(null); }} /></div>
          </div>
          <div><Label htmlFor="pernoite-valor">Valor estimado da diária (R$) *</Label><Input id="pernoite-valor" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Ex.: 250,00" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando}>{salvando && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}Adicionar pernoite</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
