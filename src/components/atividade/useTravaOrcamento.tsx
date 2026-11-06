import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { buscarTravaOrcamento, type AtividadeTravando } from "@/lib/atividadesAcoes";
import { AcaoAtividadeDialog, BotoesAcaoAtividade, type AcaoAtividade } from "./AcoesAtividade";

/**
 * Trava do Novo orçamento: atividades vencidas há mais de 1 dia útil precisam ser resolvidas antes.
 * O banco também bloqueia o insert; isto é só a experiência na tela. Admin nunca é travado.
 */
export function useTravaOrcamento() {
  const { isAdmin } = useAuth();
  const [itens, setItens] = useState<AtividadeTravando[]>([]);
  const [aberto, setAberto] = useState(false);
  const [acao, setAcao] = useState<{ a: AtividadeTravando; tipo: AcaoAtividade } | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const terminar = (ok: boolean) => {
    setAberto(false); setAcao(null);
    resolver.current?.(ok); resolver.current = null;
  };

  /** Resolve true quando pode abrir o orçamento; false se o vendedor fechar sem resolver. */
  const checar = async (): Promise<boolean> => {
    if (isAdmin) return true;
    const r = await buscarTravaOrcamento();
    if (!r.travado) return true;
    setItens(r.itens); setAberto(true);
    return new Promise<boolean>((res) => { resolver.current = res; });
  };

  const aposAcao = async () => {
    setAcao(null);
    const r = await buscarTravaOrcamento();
    if (!r.travado) terminar(true); else setItens(r.itens);
  };

  const dialogo = (
    <>
      <Dialog open={aberto && !acao} onOpenChange={(o) => { if (!o) terminar(false); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Antes de criar o orçamento, resolva estas atividades vencidas</DialogTitle>
            <DialogDescription>Quando não sobrar nenhuma vencida há mais de 1 dia útil, o orçamento abre na hora.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto divide-y border rounded-md">
            {itens.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-2 p-2">
                <div className="flex-1 min-w-[180px]">
                  <div className="text-sm font-medium truncate">{a.titulo}</div>
                  <div className="text-xs text-muted-foreground truncate">venceu em {format(new Date(a.data_inicio), "dd/MM")}{a.organizacao ? ` · ${a.organizacao}` : ""}</div>
                </div>
                <BotoesAcaoAtividade compacto onAcao={(tipo) => setAcao({ a, tipo })} />
              </div>
            ))}
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => terminar(false)}>Voltar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <AcaoAtividadeDialog atividade={acao?.a ?? null} acao={acao?.tipo ?? null} onClose={() => setAcao(null)} onDone={aposAcao} />
    </>
  );

  return { checar, dialogo };
}
