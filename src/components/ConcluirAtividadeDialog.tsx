import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useGoogleIntegration } from "@/hooks/useGoogleIntegration";
import { dataAtalho, toLocalInput, tituloAutomatico } from "@/lib/atividadeRapida";
import {
  DataComAtalhos, TipoChips, VinculoPicker, Vinculos, inserirAtividade, nomesVinculo, useAtividadeListas,
} from "@/components/atividade/AtividadeCampos";

export interface AtividadeConcluir {
  id: string;
  tipo_id: string | null;
  tipo?: string | null;
  evento_automatico?: boolean | null;
  oportunidade_id: string | null;
  organizacao_id: string | null;
  pessoa_id: string | null;
  responsavel_id: string | null;
}

const norm = (s?: string | null) => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export default function ConcluirAtividadeDialog({ atividade, onClose, onDone }: {
  atividade: AtividadeConcluir | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const listas = useAtividadeListas();
  const { tipos, deals } = listas;
  const { isConnected, syncAtividade } = useGoogleIntegration();

  const [resultado, setResultado] = useState("");
  const [vinc, setVinc] = useState<Vinculos>({ dealId: "", orgId: "", pesId: "" });
  const [tipoId, setTipoId] = useState("");
  const [titulo, setTitulo] = useState("");
  const [data, setData] = useState(() => toLocalInput(dataAtalho("3dias")));
  const [abrirProximo, setAbrirProximo] = useState(true);
  const [dealSemProxima, setDealSemProxima] = useState(false);
  const [saving, setSaving] = useState(false);

  const tipoAtual = tipos.find((t) => t.id === atividade?.tipo_id);
  const isAutoNota = Boolean(atividade?.evento_automatico) && (norm(tipoAtual?.nome || atividade?.tipo) === "nota");
  const temVinculo = Boolean(atividade?.oportunidade_id || atividade?.organizacao_id || atividade?.pessoa_id);
  const oferecerProximo = !isAutoNota;

  useEffect(() => {
    if (!atividade) return;
    setResultado(""); setTitulo("");
    setVinc({ dealId: atividade.oportunidade_id || "", orgId: atividade.organizacao_id || "", pesId: atividade.pessoa_id || "" });
    setData(toLocalInput(dataAtalho("3dias")));
    setAbrirProximo(Boolean(atividade.oportunidade_id || atividade.organizacao_id || atividade.pessoa_id));
    setDealSemProxima(false);
  }, [atividade?.id]);

  useEffect(() => {
    if (!atividade || tipoId && tipos.some((t) => t.id === tipoId)) return;
    const lig = tipos.find((t) => ["ligacao"].includes(norm(t.nome)));
    if (lig || tipos[0]) setTipoId((lig || tipos[0]).id);
  }, [tipos, atividade?.id]);

  // Aviso: deal aberto ficará sem próxima atividade
  useEffect(() => {
    const dealId = atividade?.oportunidade_id;
    if (!dealId) return;
    const deal = deals.find((d) => d.id === dealId);
    if (!deal || deal.status !== "aberta") { setDealSemProxima(false); return; }
    (async () => {
      const { data: fut } = await (supabase as any).from("atividades").select("id")
        .eq("oportunidade_id", dealId).eq("concluida", false).neq("id", atividade!.id)
        .gt("data_inicio", new Date().toISOString()).limit(1);
      setDealSemProxima(!(fut || []).length);
    })();
  }, [atividade?.id, deals]);

  const concluir = async (agendar: boolean) => {
    if (!atividade) return;
    setSaving(true);
    const { error } = await (supabase as any).from("atividades").update({
      concluida: true, data_conclusao: new Date().toISOString(), resultado: resultado.trim() || null,
    }).eq("id", atividade.id);
    if (error) { setSaving(false); toast.error(error.message); return; }
    if (agendar) {
      const id = await inserirAtividade({
        tipo: tipos.find((t) => t.id === tipoId), titulo, dataLocal: data, duracao: 30, concluida: false,
        vinculos: vinc, responsavelId: atividade.responsavel_id, criarMeet: false, isConnected,
        deals: listas.deals, orgs: listas.orgs, pessoas: listas.pessoas, syncAtividade,
      });
      if (id) toast.success("Concluída e próximo passo agendado");
    } else {
      toast.success("Atividade concluída");
    }
    setSaving(false);
    onDone();
  };

  const agendarPrimario = oferecerProximo && (temVinculo || abrirProximo);
  const tipoSel = tipos.find((t) => t.id === tipoId);

  return (
    <Dialog open={!!atividade} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg" onKeyDown={(e) => {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); concluir(agendarPrimario && abrirProximo); }
      }}>
        <DialogHeader><DialogTitle>Concluir atividade</DialogTitle></DialogHeader>
        <div className="space-y-1">
          <Label className="text-xs">Resultado</Label>
          <Textarea placeholder="Resultado (opcional)" value={resultado} onChange={e => setResultado(e.target.value)} rows={3} autoFocus />
        </div>

        {oferecerProximo && (
          <div className="border rounded-lg p-3 space-y-2.5">
            <button type="button" className="flex items-center gap-1 text-sm font-medium w-full text-left"
              onClick={() => setAbrirProximo((v) => !v)}>
              {abrirProximo ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              Próximo passo
            </button>
            {dealSemProxima && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600" /> Este deal vai ficar sem próxima atividade.
              </p>
            )}
            {abrirProximo && (
              <>
                <TipoChips tipos={tipos} value={tipoId} onChange={setTipoId} />
                <Input value={titulo} onChange={(e) => setTitulo(e.target.value)}
                  placeholder={`Título (opcional) — ${tituloAutomatico(tipoSel?.nome || "Atividade", nomesVinculo(vinc, listas))}`} />
                <DataComAtalhos key={atividade?.id} value={data} onChange={setData} ativo="3dias" />
                <VinculoPicker value={vinc} onChange={setVinc} deals={listas.deals} orgs={listas.orgs} pessoas={listas.pessoas} />
              </>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
          {oferecerProximo && abrirProximo ? (
            <>
              <Button variant={agendarPrimario ? "outline" : "default"} onClick={() => concluir(false)} disabled={saving}>Só concluir</Button>
              <Button variant={agendarPrimario ? "default" : "outline"} onClick={() => concluir(true)} disabled={saving}>
                {saving && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}Concluir e agendar
              </Button>
            </>
          ) : (
            <Button onClick={() => concluir(false)} disabled={saving}>
              {saving && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}Só concluir
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
