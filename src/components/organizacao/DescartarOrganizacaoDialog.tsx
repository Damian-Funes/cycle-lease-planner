import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { MOTIVOS_DESCARTE, descartarOrganizacao, descarteValido, type MotivoDescarte } from "@/lib/organizacaoDescarte";

export default function DescartarOrganizacaoDialog({ org, onClose, onDone }: {
  org: { id: string; nome: string } | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [motivo, setMotivo] = useState<MotivoDescarte | "">("");
  const [obs, setObs] = useState("");
  const [salvando, setSalvando] = useState(false);

  const fechar = () => { setMotivo(""); setObs(""); onClose(); };
  const salvar = async () => {
    if (!org || !motivo) return toast.error("Escolha o motivo.");
    setSalvando(true);
    try {
      await descartarOrganizacao(org.id, motivo, obs);
      toast.success(`${org.nome} descartada`);
      setMotivo(""); setObs(""); onDone();
    } catch (e: any) { toast.error(e?.message); } finally { setSalvando(false); }
  };

  return (
    <Dialog open={!!org} onOpenChange={(o) => !o && fechar()}>
      <DialogContent className="max-w-md" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Descartar {org?.nome}</DialogTitle>
          <DialogDescription>Nada é apagado: a organização sai das listas e das cobranças e fica no histórico.</DialogDescription>
        </DialogHeader>
        <RadioGroup value={motivo} onValueChange={(v) => setMotivo(v as MotivoDescarte)} className="space-y-1">
          {MOTIVOS_DESCARTE.map((m) => (
            <div key={m.value} className="flex items-center gap-2">
              <RadioGroupItem value={m.value} id={`desc-${m.value}`} />
              <Label htmlFor={`desc-${m.value}`}>{m.label}</Label>
            </div>
          ))}
        </RadioGroup>
        <Textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} placeholder={motivo === "outro" ? "Explique o motivo *" : "Observação (opcional)"} />
        <DialogFooter>
          <Button variant="ghost" onClick={fechar}>Voltar</Button>
          <Button variant="destructive" onClick={salvar} disabled={salvando || !descarteValido(motivo, obs)}>Descartar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
