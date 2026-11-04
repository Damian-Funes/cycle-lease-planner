import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileText, Plus, Receipt, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatBRL } from "@/lib/smartcycle";
import { parseValorBR } from "@/lib/viagem";
import { CATEGORIAS_GASTO, type CategoriaGasto } from "@/lib/viagemDiario";
import { excluirGasto, salvarGasto, urlsAssinadas, type Gasto } from "@/lib/viagemDados";
import { hojeRota } from "@/lib/rotasFluxo";

const nomeCat = (c: string) => CATEGORIAS_GASTO.find((x) => x.id === c)?.nome ?? c;

export default function GastosViagem({ rotaId, gastos, editavel }: { rotaId: string; gastos: Gasto[]; editavel: boolean }) {
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [categoria, setCategoria] = useState<CategoriaGasto>("combustivel");
  const [valor, setValor] = useState("");
  const [data, setData] = useState(hojeRota());
  const [descricao, setDescricao] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [salvando, setSalvando] = useState(false);
  const paths = gastos.map((g) => g.arquivo_path).filter(Boolean) as string[];
  const { data: urls = {} } = useQuery({ queryKey: ["viagens-urls", paths.join("|")], queryFn: () => urlsAssinadas(paths), enabled: paths.length > 0, staleTime: 30 * 60 * 1000 });
  const atualizar = () => qc.invalidateQueries({ queryKey: ["rota-gastos", rotaId] });

  async function salvar() {
    const v = parseValorBR(valor);
    if (!(v > 0)) { toast.error("Informe o valor"); return; }
    if (!data) { toast.error("Informe a data"); return; }
    setSalvando(true);
    try {
      await salvarGasto({ rotaId, categoria, valor: v, data, descricao, arquivo });
      toast.success("Gasto lançado");
      setValor(""); setDescricao(""); setArquivo(null); setAberto(false); atualizar();
    } catch (e) { toast.error((e as Error).message); } finally { setSalvando(false); }
  }

  const total = gastos.reduce((s, g) => s + g.valor, 0);
  return (
    <Card className="p-3 space-y-3" aria-label="Gastos reais">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold flex items-center gap-1"><Receipt className="w-4 h-4" />Gastos reais: {formatBRL(total)}</p>
        {editavel && !aberto && <Button size="sm" onClick={() => setAberto(true)}><Plus className="w-4 h-4 mr-1" />Lançar gasto</Button>}
      </div>
      {aberto && <div className="space-y-3 rounded-md border p-3">
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Categoria">
          {CATEGORIAS_GASTO.map((c) => <Button key={c.id} type="button" role="radio" aria-checked={categoria === c.id} variant={categoria === c.id ? "default" : "outline"} className="h-11" onClick={() => setCategoria(c.id)}>{c.nome}</Button>)}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><Label htmlFor="g-valor">Valor (R$) *</Label><Input id="g-valor" inputMode="decimal" className="h-11 text-base" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" /></div>
          <div><Label htmlFor="g-data">Data *</Label><Input id="g-data" type="date" className="h-11" value={data} onChange={(e) => setData(e.target.value)} /></div>
        </div>
        <div><Label htmlFor="g-desc">Descrição</Label><Input id="g-desc" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: Posto Ipiranga BR-153" /></div>
        <label className="flex h-12 items-center justify-center gap-2 rounded-md border-2 border-dashed border-input text-sm font-medium cursor-pointer">
          <FileText className="w-4 h-4" />{arquivo ? arquivo.name : "Foto ou PDF da nota"}
          <input type="file" accept="image/*,application/pdf" capture="environment" className="sr-only" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
        </label>
        <div className="flex gap-2"><Button className="flex-1 h-11" onClick={salvar} disabled={salvando}>{salvando ? "Enviando..." : "Salvar gasto"}</Button><Button variant="outline" className="h-11" onClick={() => setAberto(false)} disabled={salvando}>Cancelar</Button></div>
      </div>}
      {gastos.length ? <ul className="divide-y text-sm">{gastos.map((g) => (
        <li key={g.id} className="py-2 flex items-center gap-2">
          <div className="flex-1 min-w-0"><div className="font-medium">{nomeCat(g.categoria)} · {formatBRL(g.valor)}</div>
            <div className="text-xs text-muted-foreground truncate">{g.data.split("-").reverse().join("/")}{g.descricao ? ` · ${g.descricao}` : ""}</div></div>
          {g.arquivo_path && (urls[g.arquivo_path] ? <a className="text-xs underline" href={urls[g.arquivo_path]} target="_blank" rel="noreferrer">Nota</a> : <span className="text-xs text-muted-foreground">Nota</span>)}
          {editavel && <Button size="icon" variant="ghost" aria-label="Excluir gasto" onClick={async () => { if (!confirm("Excluir este gasto?")) return; try { await excluirGasto(g.id); atualizar(); } catch (e) { toast.error((e as Error).message); } }}><Trash2 className="w-4 h-4" /></Button>}
        </li>))}</ul> : <p className="text-sm text-muted-foreground">Nenhum gasto lançado.</p>}
    </Card>
  );
}
