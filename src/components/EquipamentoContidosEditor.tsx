import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Equipamento } from "@/lib/equipamentos";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, X, Plus, Search } from "lucide-react";

/**
 * Gerenciador da regra "este equipamento já inclui no desenho":
 * lista filhos atuais, permite adicionar/remover, e mostra em quais
 * pais este equipamento aparece como filho (informativo).
 */
export function EquipamentoContidosEditor({
  paiId,
  paiCodigo,
  todosEquipamentos,
}: {
  paiId: string;
  paiCodigo: string;
  todosEquipamentos: Equipamento[];
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [filhosIds, setFilhosIds] = useState<string[]>([]);
  const [paisIds, setPaisIds] = useState<string[]>([]);
  const [busca, setBusca] = useState("");
  const [mostrarSeletor, setMostrarSeletor] = useState(false);

  async function refresh() {
    setLoading(true);
    const [filhosRes, paisRes] = await Promise.all([
      supabase.from("equipamento_contidos").select("equipamento_filho_id").eq("equipamento_pai_id", paiId),
      supabase.from("equipamento_contidos").select("equipamento_pai_id").eq("equipamento_filho_id", paiId),
    ]);
    setFilhosIds((filhosRes.data ?? []).map((r: any) => r.equipamento_filho_id));
    setPaisIds((paisRes.data ?? []).map((r: any) => r.equipamento_pai_id));
    setLoading(false);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paiId]);

  async function adicionarFilho(filhoId: string) {
    const { error } = await supabase
      .from("equipamento_contidos")
      .insert({ equipamento_pai_id: paiId, equipamento_filho_id: filhoId });
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Item incluso na regra" });
    setMostrarSeletor(false);
    setBusca("");
    refresh();
  }

  async function removerFilho(filhoId: string) {
    const { error } = await supabase
      .from("equipamento_contidos")
      .delete()
      .eq("equipamento_pai_id", paiId)
      .eq("equipamento_filho_id", filhoId);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    refresh();
  }

  const eqMap = new Map(todosEquipamentos.map((e) => [e.id, e]));
  const filhos = filhosIds.map((id) => eqMap.get(id)).filter(Boolean) as Equipamento[];
  const pais = paisIds.map((id) => eqMap.get(id)).filter(Boolean) as Equipamento[];

  const candidatos = todosEquipamentos.filter((e) => {
    if (e.id === paiId) return false;
    if (filhosIds.includes(e.id)) return false;
    const q = busca.trim().toLowerCase();
    if (!q) return true;
    return e.codigo.toLowerCase().includes(q) || e.descricao.toLowerCase().includes(q);
  });

  return (
    <div className="mt-4 pt-4 border-t space-y-2">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Itens já inclusos no desenho</h3>
        <p className="text-xs text-muted-foreground">
          Quando este equipamento estiver no layout, os itens abaixo serão ocultados do desenho (continuam no orçamento normalmente).
        </p>
      </div>

      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      ) : (
        <>
          <div className="flex flex-wrap gap-1">
            {filhos.length === 0 ? (
              <span className="text-xs text-muted-foreground italic">Nenhum item configurado.</span>
            ) : (
              filhos.map((f) => (
                <span
                  key={f.id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-muted text-xs"
                  title={f.descricao}
                >
                  <span className="font-medium">{f.codigo}</span>
                  <span className="text-muted-foreground truncate max-w-[140px]">{f.descricao}</span>
                  <button
                    type="button"
                    onClick={() => removerFilho(f.id)}
                    className="hover:text-destructive"
                    title="Remover"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))
            )}
          </div>

          {!mostrarSeletor ? (
            <Button type="button" size="sm" variant="outline" onClick={() => setMostrarSeletor(true)} className="gap-1">
              <Plus className="w-3.5 h-3.5" /> Adicionar item
            </Button>
          ) : (
            <div className="border rounded-md p-2 space-y-2 bg-muted/30">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  autoFocus
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar por código ou descrição..."
                  className="w-full h-8 pl-7 pr-2 rounded border bg-background text-xs"
                />
              </div>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {candidatos.slice(0, 20).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => adicionarFilho(c.id)}
                    className="w-full text-left p-1.5 rounded hover:bg-background text-xs flex items-center gap-2"
                  >
                    <span className="font-medium">{c.codigo}</span>
                    <span className="text-muted-foreground truncate">{c.descricao}</span>
                  </button>
                ))}
                {candidatos.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-2">Nada encontrado.</p>
                )}
              </div>
              <Button type="button" size="sm" variant="ghost" onClick={() => { setMostrarSeletor(false); setBusca(""); }}>
                Cancelar
              </Button>
            </div>
          )}

          {pais.length > 0 && (
            <p className="text-xs text-muted-foreground pt-1">
              <span className="font-medium">{paiCodigo}</span> também está contido em:{" "}
              {pais.map((p) => p.codigo).join(", ")}
            </p>
          )}
        </>
      )}
    </div>
  );
}
