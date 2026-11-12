import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ChevronDown, PackageX } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { idsCandidatos, itensSemCusto, type ItemSemCusto, type OrcItens } from "@/lib/itensSemCusto";

/** Só para admin/gerente: lê itens (descrição/código) das últimas versões; nunca custo. */
export default function ItensSemCustoBloco({ orcamentos }: { orcamentos: { id: string; numero: string }[] }) {
  const [aberto, setAberto] = useState(false);
  const navigate = useNavigate();
  const ids = orcamentos.map(o => o.id).sort();
  const q = useQuery({
    queryKey: ["comissao-itens-sem-custo", ids.join(",")],
    enabled: aberto && ids.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const orcs: OrcItens[] = [];
      for (let i = 0; i < ids.length; i += 100) {
        const { data, error } = await supabase.from("orcamentos").select("id,numero_orcamento,itens").in("id", ids.slice(i, i + 100));
        if (error) throw error;
        for (const o of data ?? []) orcs.push({ id: o.id, numero: o.numero_orcamento ?? o.id, itens: o.itens });
      }
      const candidatos = idsCandidatos(orcs), cadastrados = new Set<string>();
      for (let i = 0; i < candidatos.length; i += 200) {
        const { data, error } = await supabase.from("equipamentos").select("id").in("id", candidatos.slice(i, i + 200));
        if (error) throw error;
        for (const e of data ?? []) cadastrados.add(String(e.id).toLowerCase());
      }
      return itensSemCusto(orcs, cadastrados);
    },
  });

  const grupo = (titulo: string, lista: ItemSemCusto[]) => lista.length > 0 && (
    <div className="space-y-2">
      <p className="text-sm font-medium">{titulo} <span className="text-muted-foreground font-normal">({lista.length})</span></p>
      {lista.map(it => (
        <div key={it.chave} className="rounded-md border p-2 text-sm space-y-1">
          <p className="font-medium break-words">{it.descricao}</p>
          {it.codigo && <p className="text-xs text-muted-foreground break-words">Código: {it.codigo}</p>}
          <p className="text-xs text-muted-foreground">Em {it.orcamentos.length} orçamento(s):</p>
          <div className="flex flex-wrap gap-1">
            {it.orcamentos.map(o => (
              <button key={o.id} onClick={() => navigate(`/orcamento?load=${o.id}`)}
                className="text-xs rounded bg-primary/10 text-primary px-2 py-0.5 hover:bg-primary/20">{o.numero}</button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  const itens = q.data ?? [];
  return (
    <Collapsible open={aberto} onOpenChange={setAberto} className="rounded-md border border-destructive/30">
      <CollapsibleTrigger className="w-full flex items-center justify-between gap-2 p-3 text-sm text-left">
        <span className="flex items-center gap-2 text-destructive"><PackageX className="w-4 h-4" />Itens sem custo nos orçamentos</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${aberto ? "rotate-180" : ""}`} />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-3 pb-3 space-y-3">
        <p className="text-xs text-muted-foreground">Contam R$ 0 na comissão. Considera a última versão de cada orçamento + cliente (rascunho, enviado e ganho).</p>
        {q.isLoading && <p className="text-sm text-muted-foreground">Carregando itens…</p>}
        {q.isError && <p className="text-sm text-muted-foreground">Não foi possível carregar os itens agora.</p>}
        {q.isSuccess && itens.length === 0 && <p className="text-sm text-muted-foreground">Nenhum item sem custo.</p>}
        {grupo("Produtos para cadastrar", itens.filter(i => !i.servico))}
        {grupo("Serviços/frete", itens.filter(i => i.servico))}
      </CollapsibleContent>
    </Collapsible>
  );
}
