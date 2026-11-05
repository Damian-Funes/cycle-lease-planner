import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Camera, Loader2 } from "lucide-react";
import CidadeAutocomplete from "@/components/CidadeAutocomplete";
import { TIPOS_NOITE, parseValorBR, validarNoite, type TipoNoite } from "@/lib/viagem";
import { diaRota } from "@/lib/rotasFluxo";
import { salvarNoite, type Gasto, type Pernoite } from "@/lib/viagemDados";

type Props = {
  open: boolean; onOpenChange: (o: boolean) => void; rotaId: string;
  noites: string[];                 // noites que podem ser escolhidas
  noiteInicial: string;
  pernoites: Pernoite[]; gastos: Gasto[];
  sugestao?: { cidade: string | null; estado: string | null } | null;
  onSaved: () => void;
};

/** "Fechar o dia: onde dormi" — obrigatório em toda noite da viagem. */
export default function RelatorioDiaDialog({ open, onOpenChange, rotaId, noites, noiteInicial, pernoites, gastos, sugestao, onSaved }: Props) {
  const [noite, setNoite] = useState(noiteInicial);
  const existente = pernoites.find((p) => p.noite === noite) ?? null;
  const gastoAtual = existente?.gasto_id ? gastos.find((g) => g.id === existente.gasto_id) ?? null : null;
  const [tipo, setTipo] = useState<TipoNoite>("hotel");
  const [cidade, setCidade] = useState(""); const [estado, setEstado] = useState("");
  const [coord, setCoord] = useState<{ lat: number; lng: number } | null>(null);
  const [hotel, setHotel] = useState(""); const [valor, setValor] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [obs, setObs] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { if (open) setNoite(noiteInicial); }, [open, noiteInicial]);
  useEffect(() => {
    if (!open) return;
    setTipo(existente?.tipo ?? "hotel");
    setCidade(existente?.cidade ?? sugestao?.cidade ?? ""); setEstado(existente?.estado ?? sugestao?.estado ?? "");
    setCoord(existente?.latitude != null && existente.longitude != null ? { lat: Number(existente.latitude), lng: Number(existente.longitude) } : null);
    setHotel(existente?.hotel_nome ?? ""); setValor(gastoAtual ? String(gastoAtual.valor).replace(".", ",") : "");
    setArquivo(null); setObs(existente?.observacao ?? "");
  }, [open, noite, existente?.id]);

  const v = parseValorBR(valor);
  const erros = validarNoite({ tipo, cidade, estado, hotel_nome: hotel, valor: Number.isFinite(v) ? v : null, temNota: Boolean(arquivo || gastoAtual?.arquivo_path), observacao: obs });

  async function salvar() {
    if (erros.length) { toast.error(erros[0]); return; }
    setSalvando(true);
    try {
      await salvarNoite({ rotaId, noite, tipo, cidade, estado, latitude: coord?.lat ?? null, longitude: coord?.lng ?? null, hotel_nome: hotel, observacao: obs, valor: v, arquivo, existente, arquivoAtual: gastoAtual?.arquivo_path ?? null });
      toast.success(`Noite de ${diaRota(noite)} registrada`);
      onSaved(); onOpenChange(false);
    } catch (e) { toast.error((e as Error).message); }
    finally { setSalvando(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Fechar o dia: onde dormi</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {noites.length > 1 && (
            <div className="space-y-1">
              <Label htmlFor="noite">Noite</Label>
              <select id="noite" className="h-11 w-full rounded-md border border-input bg-background px-2" value={noite} onChange={(e) => setNoite(e.target.value)}>
                {noites.map((n) => <option key={n} value={n}>{diaRota(n)}{pernoites.some((p) => p.noite === n) ? " (registrada)" : ""}</option>)}
              </select>
            </div>
          )}
          <div className="grid gap-2">
            {TIPOS_NOITE.map((t) => (
              <button key={t.id} type="button" onClick={() => setTipo(t.id)}
                className={`text-left rounded-md border p-3 ${tipo === t.id ? "border-primary bg-primary/10" : "border-input"}`}>
                <span className="font-semibold block">{t.nome}</span>
                <span className="text-sm text-muted-foreground">{t.descricao}</span>
              </button>
            ))}
          </div>
          {tipo !== "voltou_base" && (
            <div className="grid grid-cols-[1fr_4.5rem] gap-2">
              <div className="space-y-1">
                <Label htmlFor="noite-cidade">Cidade</Label>
                <CidadeAutocomplete id="noite-cidade" value={cidade} ufPreferida={estado || sugestao?.estado}
                  onChange={(t) => { setCidade(t); setCoord(null); }}
                  onEscolher={(c) => { setCidade(c.nome); setEstado(c.estado); }}
                  onCoordenada={(c) => setCoord(c ? { lat: c.lat, lng: c.lng } : null)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="noite-uf">UF</Label>
                <Input id="noite-uf" value={estado} maxLength={2} onChange={(e) => setEstado(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))} />
              </div>
            </div>
          )}
          {tipo === "hotel" && <>
            <div className="space-y-1"><Label htmlFor="noite-hotel">Hotel</Label><Input id="noite-hotel" value={hotel} onChange={(e) => setHotel(e.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="noite-valor">Valor pago (R$)</Label><Input id="noite-valor" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} /></div>
            <div className="space-y-1">
              <Label htmlFor="noite-nota">Foto da nota</Label>
              <label htmlFor="noite-nota" className="flex items-center gap-2 h-12 rounded-md border border-dashed px-3 cursor-pointer">
                <Camera className="w-5 h-5" />{arquivo ? arquivo.name : gastoAtual?.arquivo_path ? "Nota já anexada — toque para trocar" : "Tirar foto ou escolher arquivo"}
              </label>
              <input id="noite-nota" type="file" accept="image/*,application/pdf" capture="environment" className="sr-only" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
            </div>
          </>}
          {tipo !== "hotel" && (
            <div className="space-y-1">
              <Label htmlFor="noite-obs">Por que não houve hotel?</Label>
              <Textarea id="noite-obs" value={obs} onChange={(e) => setObs(e.target.value)} placeholder={tipo === "voltou_base" ? "Ex.: terminei as visitas e voltei para casa" : "Ex.: dormi na casa do cliente"} />
            </div>
          )}
          {erros.length > 0 && <p className="text-xs text-muted-foreground">{erros.join(" ")}</p>}
        </div>
        <DialogFooter>
          <Button size="lg" className="w-full h-12" disabled={salvando} onClick={salvar}>{salvando && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}Salvar noite</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
