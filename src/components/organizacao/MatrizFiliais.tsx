import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Org = { id: string; nome: string; nome_fantasia: string | null; cidade: string | null; matriz_id: string | null };
const db = supabase as unknown as { from: (t: string) => any };
const nome = (o: Org) => o.nome_fantasia || o.nome;

export default function MatrizFiliais({ organizacaoId }: { organizacaoId: string }) {
  const { hasAnyRole } = useAuth(); const qc = useQueryClient();
  const pode = hasAnyRole(["admin", "gerente_comercial"]);
  const [editando, setEditando] = useState(false); const [busca, setBusca] = useState("");
  const q = useQuery({
    queryKey: ["matriz-filiais", organizacaoId], retry: false,
    queryFn: async () => {
      const atual = await db.from("organizacoes").select("id,nome,nome_fantasia,cidade,matriz_id").eq("id", organizacaoId).maybeSingle();
      if (atual.error) throw atual.error;
      const org = atual.data as Org | null;
      const matriz = org?.matriz_id ? (await db.from("organizacoes").select("id,nome,nome_fantasia,cidade,matriz_id").eq("id", org.matriz_id).maybeSingle()).data as Org | null : null;
      const fil = await db.from("organizacoes").select("id,nome,nome_fantasia,cidade,matriz_id").eq("matriz_id", organizacaoId).order("nome");
      return { org, matriz, filiais: (fil.data ?? []) as Org[] };
    },
  });
  const opcoes = useQuery({
    queryKey: ["matriz-opcoes", busca], enabled: editando && busca.trim().length >= 3,
    queryFn: async () => (await db.from("organizacoes").select("id,nome,nome_fantasia,cidade,matriz_id").is("matriz_id", null).neq("id", organizacaoId).ilike("nome", `%${busca.trim()}%`).limit(8)).data as Org[] ?? [],
  });
  const definir = async (matrizId: string | null) => {
    const r = await db.from("organizacoes").update({ matriz_id: matrizId }).eq("id", organizacaoId);
    if (r.error) { toast.error(r.error.message); return; }
    toast.success(matrizId ? "Matriz definida" : "Matriz removida"); setEditando(false); setBusca("");
    qc.invalidateQueries({ queryKey: ["matriz-filiais"] }); qc.invalidateQueries({ queryKey: ["levantamentos"] });
  };
  if (q.isError || !q.data) return null;
  const { matriz, filiais } = q.data;
  if (!matriz && !filiais.length && !pode) return null;
  return (
    <Card className="p-4 space-y-2">
      <h3 className="font-semibold text-sm">Matriz e filiais</h3>
      {matriz && <p className="text-sm">Filial de <Link className="text-primary underline" to={`/organizacoes/${matriz.id}`}>{nome(matriz)}</Link>{matriz.cidade ? ` (${matriz.cidade})` : ""}</p>}
      {filiais.length > 0 && <div className="text-sm"><p className="text-xs text-muted-foreground">Filiais</p><ul className="space-y-0.5">{filiais.map(f => <li key={f.id}><Link className="text-primary underline" to={`/organizacoes/${f.id}`}>{nome(f)}</Link>{f.cidade ? ` — ${f.cidade}` : ""}</li>)}</ul></div>}
      {!matriz && !filiais.length && <p className="text-xs text-muted-foreground">Sem matriz ou filiais.</p>}
      {pode && !filiais.length && (editando ? (
        <div className="space-y-2">
          <Input autoFocus placeholder="Buscar matriz (mín. 3 letras)" value={busca} onChange={e => setBusca(e.target.value)} />
          {opcoes.data?.map(o => <Button key={o.id} variant="ghost" size="sm" className="w-full justify-start" onClick={() => definir(o.id)}>{nome(o)}{o.cidade ? ` — ${o.cidade}` : ""}</Button>)}
          <div className="flex gap-2">{matriz && <Button size="sm" variant="outline" onClick={() => definir(null)}>Remover matriz</Button>}<Button size="sm" variant="ghost" onClick={() => setEditando(false)}>Cancelar</Button></div>
        </div>
      ) : <Button size="sm" variant="outline" onClick={() => setEditando(true)}>{matriz ? "Trocar matriz" : "Definir matriz"}</Button>)}
    </Card>
  );
}
