import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Check, CalendarClock, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { cancelarAtividade, concluirAtividade, reagendarAtividade, textoValido } from "@/lib/atividadesAcoes";

export type AcaoAtividade = "feito" | "reagendar" | "cancelar";

export interface AtividadeAcao { id: string; titulo: string; data_inicio?: string | null }

/** Diálogo único das 3 ações. Nada some sem resultado/motivo. */
export function AcaoAtividadeDialog({ atividade, acao, dataSugerida, onClose, onDone }: {
  atividade: AtividadeAcao | null;
  acao: AcaoAtividade | null;
  dataSugerida?: Date | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [texto, setTexto] = useState("");
  const [data, setData] = useState("");
  const [salvando, setSalvando] = useState(false);
  const aberto = !!atividade && !!acao;

  const abrir = (o: boolean) => {
    if (o) return;
    setTexto(""); setData(""); onClose();
  };
  const valorData = data || (dataSugerida ? format(dataSugerida, "yyyy-MM-dd'T'HH:mm") : "");

  const salvar = async () => {
    if (!atividade || !acao) return;
    if (!textoValido(texto)) return toast.error(acao === "feito" ? "Escreva o resultado." : "Escreva o motivo.");
    setSalvando(true);
    try {
      if (acao === "feito") await concluirAtividade(atividade.id, texto);
      if (acao === "cancelar") await cancelarAtividade(atividade.id, texto);
      if (acao === "reagendar") {
        if (!valorData) throw new Error("Escolha a nova data.");
        const n = await reagendarAtividade(atividade.id, new Date(valorData), texto);
        if (n >= 3) toast.warning(`Esta atividade já foi reagendada ${n} vezes — o gestor será avisado.`);
      }
      toast.success(acao === "feito" ? "Atividade concluída" : acao === "cancelar" ? "Atividade cancelada" : "Atividade reagendada");
      setTexto(""); setData("");
      onDone();
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível salvar");
    } finally { setSalvando(false); }
  };

  const titulo = acao === "feito" ? "Marcar como feita" : acao === "reagendar" ? "Reagendar" : "Cancelar atividade";
  return (
    <Dialog open={aberto} onOpenChange={abrir}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription className="truncate">{atividade?.titulo}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {acao === "reagendar" && (
            <div className="space-y-1">
              <Label>Nova data *</Label>
              <Input type="datetime-local" value={valorData} min={format(new Date(), "yyyy-MM-dd'T'00:00")} onChange={(e) => setData(e.target.value)} />
            </div>
          )}
          <div className="space-y-1">
            <Label>{acao === "feito" ? "Resultado *" : acao === "reagendar" ? "Por que vai mudar a data? *" : "Por que não vai acontecer? *"}</Label>
            <Textarea autoFocus rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => abrir(false)}>Voltar</Button>
          <Button onClick={salvar} disabled={salvando} variant={acao === "cancelar" ? "destructive" : "default"}>
            {salvando && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Os 3 botões. `onAcao` abre o diálogo no componente pai (ou use <AcoesAtividade/> autônomo). */
export function BotoesAcaoAtividade({ onAcao, compacto }: { onAcao: (a: AcaoAtividade) => void; compacto?: boolean }) {
  const cls = compacto ? "h-7 px-2 text-xs" : "h-8 text-xs";
  return (
    <div className="flex items-center gap-1 shrink-0">
      <Button size="sm" variant="outline" className={cls} onClick={(e) => { e.stopPropagation(); onAcao("feito"); }}><Check className="h-3 w-3 mr-1" />Feito</Button>
      <Button size="sm" variant="outline" className={cls} onClick={(e) => { e.stopPropagation(); onAcao("reagendar"); }}><CalendarClock className="h-3 w-3 mr-1" />Reagendar</Button>
      <Button size="sm" variant="ghost" className={`${cls} text-destructive`} onClick={(e) => { e.stopPropagation(); onAcao("cancelar"); }}><X className="h-3 w-3 mr-1" />Cancelar</Button>
    </div>
  );
}

export default function AcoesAtividade({ atividade, onDone, compacto }: { atividade: AtividadeAcao; onDone: () => void; compacto?: boolean }) {
  const [acao, setAcao] = useState<AcaoAtividade | null>(null);
  return (
    <>
      <BotoesAcaoAtividade onAcao={setAcao} compacto={compacto} />
      <AcaoAtividadeDialog atividade={acao ? atividade : null} acao={acao} onClose={() => setAcao(null)} onDone={() => { setAcao(null); onDone(); }} />
    </>
  );
}
