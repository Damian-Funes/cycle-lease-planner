import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AcaoAtividadeDialog, BotoesAcaoAtividade, type AcaoAtividade, type AtividadeAcao } from "./AcoesAtividade";

interface Vencida extends AtividadeAcao { data_inicio: string; org?: string | null }

const chaveSessao = (uid: string) => `aviso-vencidas:${uid}:${format(new Date(), "yyyy-MM-dd")}`;

/** Aviso ao abrir o CRM (1x por sessão e por dia) com as atividades vencidas desde ontem. Não trava nada. */
export default function AvisoAtividadesVencidas() {
  const { user, loading } = useAuth();
  const { pathname } = useLocation();
  const [itens, setItens] = useState<Vencida[]>([]);
  const [aberto, setAberto] = useState(false);
  const [acao, setAcao] = useState<{ a: Vencida; tipo: AcaoAtividade } | null>(null);

  const carregar = async (uid: string) => {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const { data } = await (supabase as any)
      .from("atividades")
      .select("id, titulo, data_inicio, organizacoes(nome, nome_fantasia)")
      .eq("responsavel_id", uid).eq("concluida", false)
      .lt("data_inicio", hoje.toISOString())
      .order("data_inicio", { ascending: true }).limit(50);
    const lista = (data ?? []).map((r: any) => ({ id: r.id, titulo: r.titulo, data_inicio: r.data_inicio, org: r.organizacoes?.nome_fantasia || r.organizacoes?.nome }));
    setItens(lista);
    return lista;
  };

  useEffect(() => {
    if (loading || !user || pathname === "/auth" || pathname === "/pendente") return;
    const k = chaveSessao(user.id);
    if (sessionStorage.getItem(k)) return;
    sessionStorage.setItem(k, "1");
    carregar(user.id).then((l) => { if (l.length) setAberto(true); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, loading, pathname]);

  if (!user) return null;
  return (
    <>
      <Dialog open={aberto && !acao} onOpenChange={setAberto}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Você tem {itens.length} {itens.length === 1 ? "atividade vencida" : "atividades vencidas"}</DialogTitle>
            <DialogDescription>Resolva cada uma: feito, reagendar ou cancelar. Este aviso volta no próximo acesso enquanto houver vencidas.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto divide-y border rounded-md">
            {itens.map((a) => (
              <div key={a.id} className="flex items-center gap-3 p-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{a.titulo}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    venceu em {format(new Date(a.data_inicio), "dd/MM", { locale: ptBR })}{a.org ? ` · ${a.org}` : ""}
                  </div>
                </div>
                <BotoesAcaoAtividade compacto onAcao={(tipo) => setAcao({ a, tipo })} />
              </div>
            ))}
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setAberto(false)}>Fechar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <AcaoAtividadeDialog
        atividade={acao?.a ?? null} acao={acao?.tipo ?? null}
        onClose={() => setAcao(null)}
        onDone={async () => { setAcao(null); const l = await carregar(user.id); if (!l.length) setAberto(false); }}
      />
    </>
  );
}
