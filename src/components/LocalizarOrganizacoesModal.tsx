import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { geocodeAddress } from "@/lib/maps";

const PAUSA_MS = 300;

export default function LocalizarOrganizacoesModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [rodando, setRodando] = useState(false);
  const [feito, setFeito] = useState(0);
  const [total, setTotal] = useState(0);
  const [ok, setOk] = useState(0);
  const [falhas, setFalhas] = useState<string[]>([]);
  const [fim, setFim] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function iniciar() {
    setRodando(true); setFim(false); setErro(null); setOk(0); setFalhas([]); setFeito(0);
    try {
      const { data, error } = await (supabase as any).from("organizacoes")
        .select("id, nome, nome_fantasia, endereco, cidade, estado")
        .or("latitude.is.null,longitude.is.null").limit(2000);
      if (error) throw error;
      const lista = data ?? [];
      setTotal(lista.length);
      let n = 0;
      for (const o of lista) {
        const nome = o.nome_fantasia || o.nome;
        const texto = o.endereco
          ? [o.endereco, o.cidade, o.estado, "Brasil"].filter(Boolean).join(", ")
          : o.cidade ? [o.cidade, o.estado, "Brasil"].filter(Boolean).join(", ") : "";
        const coords = texto ? await geocodeAddress(texto) : null;
        if (coords) {
          const { error: e2 } = await (supabase as any).from("organizacoes").update({ latitude: coords.lat, longitude: coords.lng }).eq("id", o.id);
          if (e2) setFalhas((f) => [...f, `${nome} (erro ao salvar: ${e2.message})`]); else setOk((v) => v + 1);
        } else {
          setFalhas((f) => [...f, texto ? nome : `${nome} (sem cidade)`]);
        }
        n++; setFeito(n);
        await new Promise((r) => setTimeout(r, PAUSA_MS));
      }
      qc.invalidateQueries({ queryKey: ["organizacoes"] });
    } catch (e: any) {
      setErro(e?.message || "Falha ao localizar organizações.");
    } finally { setRodando(false); setFim(true); }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!rodando) onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Localizar clientes sem coordenada</DialogTitle>
          <DialogDescription>Usa o endereço completo; sem endereço, usa o centro da cidade (localização aproximada).</DialogDescription>
        </DialogHeader>
        {total > 0 && <div className="space-y-1"><Progress value={(feito / total) * 100} /><p className="text-sm">{feito} de {total}</p></div>}
        {erro && <p className="text-sm text-destructive">{erro}</p>}
        {fim && !erro && (
          <div className="text-sm space-y-1">
            <p><strong>{ok}</strong> localizadas · <strong>{falhas.length}</strong> não encontradas</p>
            {falhas.length > 0 && <ul className="max-h-48 overflow-y-auto list-disc pl-5 text-muted-foreground">{falhas.map((f) => <li key={f}>{f}</li>)}</ul>}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={rodando} onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button disabled={rodando} onClick={iniciar}>{rodando ? "Localizando..." : fim ? "Rodar novamente" : "Iniciar"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
