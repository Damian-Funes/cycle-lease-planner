import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { geocodeAddress, loadGoogleMaps } from "@/lib/maps";
import { cidadeDeResultados, normalizarUf } from "@/lib/cidadeGeo";
import CidadeAutocomplete from "@/components/CidadeAutocomplete";
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
  const [falhaAuto, setFalhaAuto] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDia(diaInicial); setHotel(""); setValor(""); setCoord(null); setSugs(null); setAviso(null); setFalhaAuto(false);
    const ref = pontoReferencia(diaInicial);
    setCidade(ref?.cidade ?? ""); setUf(normalizarUf(ref?.estado));
    if (ref && !ref.cidade?.trim()) preencherPorCoordenada(ref);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, diaInicial]);

  // Geocodificação reversa da última parada do dia (cidade = locality, UF = sigla)
  async function preencherPorCoordenada(ref: { lat: number; lng: number }) {
    try {
      const g = await loadGoogleMaps();
      const res: any = await new g.maps.Geocoder().geocode({ location: ref, language: "pt-BR" } as any);
      const x = cidadeDeResultados(res?.results);
      if (!x) { setFalhaAuto(true); return; }
      setCidade((atual) => atual.trim() ? atual : x.cidade);
      setUf((atual) => atual ? atual : x.uf);
      setAviso((a) => a ?? `Cidade sugerida: ${x.cidade}${x.uf ? ` - ${x.uf}` : ""} (pode corrigir).`);
    } catch (e) { console.error("[pernoite] geocodificação reversa", e); setFalhaAuto(true); }
  }

  // Hotel digitado à mão: localizar pelo nome perto da última parada do dia
  async function localizarHotelDigitado() {
    const nome = hotel.trim();
    if (nome.length < 2 || cidade.trim() || coord) return;
    const ref = pontoReferencia(dia);
    if (!ref) return;
    try {
      const { data, error } = await supabase.functions.invoke("hoteis-proximos", { body: { lat: ref.lat, lng: ref.lng, texto: nome } });
      const h: HotelSug | undefined = !error && !data?.indisponivel ? data?.hoteis?.[0] : undefined;
      if (error) console.error("[pernoite] localizar hotel", error);
      if (!h?.cidade) { setFalhaAuto(true); return; }
      setFalhaAuto(false);
      setCidade((a) => a.trim() ? a : h.cidade!);
      setUf((a) => a ? a : normalizarUf(h.uf));
      if (Number.isFinite(h.lat) && Number.isFinite(h.lng)) setCoord({ lat: h.lat, lng: h.lng });
      setAviso(`Encontrei "${h.nome}" em ${h.cidade}${h.uf ? ` - ${h.uf}` : ""}. Confira a cidade.`);
    } catch (e) { console.error("[pernoite] localizar hotel", e); setFalhaAuto(true); }
  }

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
    if (h.uf) setUf(normalizarUf(h.uf));
  }

  async function salvar() {
    const v = parseBRL(valor);
    if (!hotel.trim()) { toast.error("Informe o hotel"); return; }
    if (!cidade.trim()) { toast.error("Informe a cidade"); return; }
    if (uf && !/^[A-Z]{2}$/.test(uf)) { toast.error("UF deve ser a sigla com 2 letras (ex.: RS)"); return; }
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
          <div><Label htmlFor="pernoite-hotel">Hotel *</Label><Input id="pernoite-hotel" value={hotel} onChange={(e) => { setHotel(e.target.value); setCoord(null); }} onBlur={localizarHotelDigitado} placeholder="Nome do hotel" /></div>
          <div className="grid grid-cols-[1fr_80px] gap-2">
            <div><Label htmlFor="pernoite-cidade">Cidade *</Label><CidadeAutocomplete id="pernoite-cidade" value={cidade} onChange={(v) => { setCidade(v); setCoord(null); }}
              ufPreferida={pontoReferencia(dia)?.estado ?? uf}
              onEscolher={(c) => { setCidade(c.nome); setUf(normalizarUf(c.estado)); setCoord(null); setFalhaAuto(false); }}
              onCoordenada={(c) => { if (c) setCoord({ lat: c.lat, lng: c.lng }); }} /></div>
            <div><Label htmlFor="pernoite-uf">UF</Label><Input id="pernoite-uf" maxLength={2} value={uf} placeholder="PR" onChange={(e) => { setUf(normalizarUf(e.target.value)); setCoord(null); }} /></div>
          </div>
          {falhaAuto && !cidade.trim() && <p className="text-xs text-muted-foreground -mt-1">Não consegui localizar automaticamente — escolha a cidade na lista.</p>}
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
