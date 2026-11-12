import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Globe2, Undo2, Send, FileText } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useListaMultinacionais } from "@/hooks/useMultinacionais";
import { SITUACOES_ENVIO, dataCobrancaPadrao, envioAberto, nomeCurto, rotuloSituacao } from "@/lib/multinacional";

type Envio = {
  id: string; orcamento_id: string; numero_base: string; multinacional_id: string; enviado_em: string;
  cobrar_em: string | null; situacao: string; motivo: string | null; orcamentos: { numero_orcamento: string } | null;
};
type Orc = { id: string; numero_orcamento: string; created_at: string; status: string };

const fmtData = (d?: string | null) => d ? new Date(d.length === 10 ? `${d}T12:00:00` : d).toLocaleDateString("pt-BR") : "—";
const erro = (e: { message?: string } | null) => (e?.message ?? "").replace(/^.*?ERROR:\s*/, "") || "Não foi possível concluir.";

export default function EnviosMultinacional({ dealId, noFunilMultinacionais, onChange }: {
  dealId: string; noFunilMultinacionais: boolean; onChange: () => void;
}) {
  const qc = useQueryClient();
  const multis = useListaMultinacionais();
  const chave = ["envios-negocio", dealId];
  const { data, isLoading } = useQuery({
    queryKey: chave,
    queryFn: async () => {
      const [env, orcs] = await Promise.all([
        supabase.from("orcamento_envios")
          .select("id, orcamento_id, numero_base, multinacional_id, enviado_em, cobrar_em, situacao, motivo, orcamentos(numero_orcamento)")
          .eq("oportunidade_id", dealId).order("enviado_em", { ascending: false }),
        supabase.from("orcamentos").select("id, numero_orcamento, created_at, status")
          .eq("oportunidade_id", dealId).order("created_at", { ascending: false }),
      ]);
      return { envios: (env.data ?? []) as unknown as Envio[], orcs: (orcs.data ?? []) as Orc[] };
    },
  });
  const nomes = useMemo(() => new Map((multis.data ?? []).map(m => [m.id, m.nome])), [multis.data]);
  const envios = data?.envios ?? [];
  const orcs = data?.orcs ?? [];
  const abertos = envios.filter(e => envioAberto(e.situacao));

  const [dlg, setDlg] = useState(false);
  const [voltar, setVoltar] = useState(false);
  const [multi, setMulti] = useState("");
  const [orcSel, setOrcSel] = useState("");
  const [cobrar, setCobrar] = useState(dataCobrancaPadrao());
  const [busy, setBusy] = useState(false);

  const recarregar = () => { qc.invalidateQueries({ queryKey: chave }); qc.invalidateQueries({ queryKey: ["multinacionais-via"] }); qc.invalidateQueries({ queryKey: ["comissao-card"] }); onChange(); };

  const abrirEnviar = () => { setMulti(""); setOrcSel(orcs[0]?.id ?? ""); setCobrar(dataCobrancaPadrao()); setDlg(true); };
  const enviar = async () => {
    if (!multi || !orcSel) return;
    setBusy(true);
    const { error } = await supabase.rpc("fn_enviar_multinacional", { _orcamento_id: orcSel, _multinacional_id: multi, _cobrar_em: cobrar });
    setBusy(false);
    if (error) { toast.error(erro(error)); return; }
    toast.success(`Enviado à ${nomeCurto(nomes.get(multi))}. Tarefa de cobrança criada para ${fmtData(cobrar)}.`);
    setDlg(false); recarregar();
  };
  const mudarSituacao = async (e: Envio, s: string) => {
    const { error } = await supabase.rpc("fn_envio_situacao", { _envio_id: e.id, _situacao: s });
    if (error) { toast.error(erro(error)); return; }
    toast.success(s === "venceu" ? "Negócio ganho. Os outros envios foram fechados como perdidos." : "Situação atualizada");
    recarregar();
  };
  const voltarDireto = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("fn_voltar_negociacao_direta", { _oportunidade_id: dealId });
    setBusy(false); setVoltar(false);
    if (error) { toast.error(erro(error)); return; }
    toast.success("Voltou para negociação direta"); recarregar();
  };

  const jaAberto = new Set(abertos.map(e => e.multinacional_id));
  if (isLoading) return null;
  if (envios.length === 0 && orcs.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2 flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base flex items-center gap-2"><Globe2 className="w-4 h-4" />Multinacionais</CardTitle>
        <div className="flex gap-2">
          {(abertos.length > 0 || noFunilMultinacionais) && (
            <Button size="sm" variant="outline" onClick={() => setVoltar(true)}><Undo2 className="w-4 h-4 mr-1" />Negociação direta</Button>
          )}
          <Button size="sm" onClick={abrirEnviar} disabled={orcs.length === 0}><Send className="w-4 h-4 mr-1" />Enviar para multinacional</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {envios.length === 0 && <p className="text-sm text-muted-foreground">Nenhum envio. Use o botão quando uma multinacional levar este orçamento ao cliente final.</p>}
        {envios.map(e => (
          <div key={e.id} className="rounded-md border p-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate">{nomes.get(e.multinacional_id) ?? "Multinacional"}</p>
              <p className="text-xs text-muted-foreground">
                {e.orcamentos?.numero_orcamento ?? e.numero_base} · enviado {fmtData(e.enviado_em)}{e.cobrar_em ? ` · cobrar ${fmtData(e.cobrar_em)}` : ""}
                {e.motivo ? ` · ${e.motivo}` : ""}
              </p>
            </div>
            <Button asChild size="sm" variant="ghost" title="Abrir a versão enviada (PDF endereçado à multinacional)">
              <Link to={`/orcamento?load=${e.orcamento_id}`}><FileText className="w-4 h-4" /></Link>
            </Button>
            {envioAberto(e.situacao) ? (
              <Select value={e.situacao} onValueChange={v => mudarSituacao(e, v)}>
                <SelectTrigger className="h-8 w-[130px] text-xs" aria-label="Situação do envio"><SelectValue /></SelectTrigger>
                <SelectContent>{SITUACOES_ENVIO.map(s => <SelectItem key={s.valor} value={s.valor}>{s.rotulo}</SelectItem>)}</SelectContent>
              </Select>
            ) : (
              <Badge variant={e.situacao === "venceu" ? "default" : "secondary"}>{rotuloSituacao(e.situacao)}</Badge>
            )}
          </div>
        ))}
      </CardContent>

      <Dialog open={dlg} onOpenChange={setDlg}>
        <DialogContent>
          <DialogHeader><DialogTitle>Enviar para multinacional</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Multinacional</Label>
              <Select value={multi} onValueChange={setMulti}>
                <SelectTrigger><SelectValue placeholder="Escolha a multinacional" /></SelectTrigger>
                <SelectContent>
                  {(multis.data ?? []).map(m => (
                    <SelectItem key={m.id} value={m.id} disabled={jaAberto.has(m.id)}>{m.nome}{jaAberto.has(m.id) ? " (já enviado)" : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Orçamento a enviar</Label>
              <Select value={orcSel} onValueChange={setOrcSel}>
                <SelectTrigger><SelectValue placeholder="Versão" /></SelectTrigger>
                <SelectContent>{orcs.map(o => <SelectItem key={o.id} value={o.id}>{o.numero_orcamento}</SelectItem>)}</SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Cria uma nova versão do mesmo número, para o mesmo cliente final, com o PDF endereçado à multinacional.</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="cobrar-em">Cobrar retorno em</Label>
              <Input id="cobrar-em" type="date" value={cobrar} onChange={e => setCobrar(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDlg(false)}>Cancelar</Button>
            <Button onClick={enviar} disabled={!multi || !orcSel || !cobrar || busy}>{busy ? "Enviando…" : "Enviar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={voltar} onOpenChange={setVoltar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Voltar para negociação direta?</AlertDialogTitle>
            <AlertDialogDescription>Os envios abertos ficam como perdidos ("voltou para negociação direta") e o negócio volta para o funil onde estava.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={voltarDireto} disabled={busy}>Voltar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
