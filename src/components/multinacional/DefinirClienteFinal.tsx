import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { mensagemErroEnvio } from "@/lib/multinacional";

/** Preenche o cliente final de um negócio que estava "a definir" (opcional; vendedor responsável ou admin). */
export default function DefinirClienteFinal({ dealId, open, onOpenChange, sugestao, onDone }: {
  dealId: string; open: boolean; onOpenChange: (o: boolean) => void; sugestao?: boolean; onDone: () => void;
}) {
  const [busca, setBusca] = useState("");
  const [escolhido, setEscolhido] = useState<{ id: string; nome: string } | null>(null);
  const [novo, setNovo] = useState(false);
  const [nome, setNome] = useState(""); const [cidade, setCidade] = useState(""); const [uf, setUf] = useState("");
  const [busy, setBusy] = useState(false);

  const opcoes = useQuery({
    queryKey: ["cliente-final-busca", busca],
    enabled: open && !novo && busca.trim().length >= 2,
    queryFn: async () => {
      const { data } = await supabase.from("organizacoes").select("id, nome, cidade")
        .ilike("nome", `%${busca.trim()}%`).or("segmento.is.null,segmento.neq.MULTINACIONAIS").order("nome").limit(8);
      return data ?? [];
    },
  });
  const estados = useQuery({
    queryKey: ["estados-lista"], enabled: open && novo,
    queryFn: async () => (await supabase.from("estados").select("id, sigla").order("sigla")).data ?? [],
  });

  const confirmar = async () => {
    setBusy(true);
    let alvo = escolhido;
    if (novo) {
      if (!nome.trim()) { setBusy(false); toast.error("Informe o nome da empresa."); return; }
      const { data, error } = await supabase.from("organizacoes")
        .insert({ nome: nome.trim(), cidade: cidade.trim() || null, estado_id: uf || null }).select("id, nome").single();
      if (error || !data) { setBusy(false); toast.error("Não foi possível cadastrar a empresa."); return; }
      alvo = data;
    }
    if (!alvo) { setBusy(false); return; }
    const { error } = await supabase.rpc("fn_definir_cliente_final", { _oportunidade_id: dealId, _cliente_final_id: alvo.id });
    setBusy(false);
    if (error) { console.error(error); toast.error(mensagemErroEnvio(error.message)); return; }
    toast.success(`Cliente final: ${alvo.nome}`);
    onOpenChange(false); onDone();
  };

  return (
    <Dialog open={open} onOpenChange={o => { onOpenChange(o); if (!o) { setBusca(""); setEscolhido(null); setNovo(false); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cliente final (quem vai usar a máquina)</DialogTitle>
          <DialogDescription>
            {sugestao ? "A multinacional já tem um comprador? Informe agora para a comissão seguir a regra do cliente. " : ""}
            Opcional — pode deixar "a definir" e preencher depois.
          </DialogDescription>
        </DialogHeader>
        {!novo ? (
          <div className="space-y-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={busca} onChange={e => { setBusca(e.target.value); setEscolhido(null); }} placeholder="Buscar empresa" className="pl-8" />
            </div>
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {(opcoes.data ?? []).map(o => (
                <button key={o.id} type="button" onClick={() => setEscolhido({ id: o.id, nome: o.nome })}
                  className={`w-full text-left rounded-md border px-3 py-2 text-sm ${escolhido?.id === o.id ? "border-primary bg-primary/5" : ""}`}>
                  <span className="font-medium">{o.nome}</span>{o.cidade ? <span className="text-muted-foreground"> · {o.cidade}</span> : null}
                </button>
              ))}
              {busca.trim().length >= 2 && opcoes.isSuccess && (opcoes.data ?? []).length === 0 && <p className="text-xs text-muted-foreground">Nenhuma empresa encontrada.</p>}
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => { setNovo(true); setNome(busca); }}><Plus className="w-4 h-4 mr-1" />Cadastrar nova</Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Verifique antes se a empresa já não existe.</p>
            <div className="space-y-1"><Label>Nome</Label><Input value={nome} onChange={e => setNome(e.target.value)} /></div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2 space-y-1"><Label>Cidade</Label><Input value={cidade} onChange={e => setCidade(e.target.value)} /></div>
              <div className="space-y-1"><Label>UF</Label>
                <Select value={uf} onValueChange={setUf}>
                  <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
                  <SelectContent>{(estados.data ?? []).map(e => <SelectItem key={e.id} value={e.id}>{e.sigla}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => setNovo(false)}>Voltar para a busca</Button>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Depois</Button>
          <Button onClick={confirmar} disabled={busy || (!novo && !escolhido)}>{busy ? "Salvando…" : "Confirmar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
