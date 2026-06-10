import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ArrowLeft, FileSearch, AlertTriangle, Search } from "lucide-react";

interface DossieRow {
  id: string;
  nome_fantasia: string | null;
  cidade: string | null;
  estado: string | null;
  maturidade_lead: string | null;
  prioridade: string | null;
  precisa_revisao: boolean | null;
  ultima_interacao_em: string | null;
}

const maturidadeColor: Record<string, string> = {
  quente: "bg-red-100 text-red-700 border-red-200",
  morno: "bg-amber-100 text-amber-700 border-amber-200",
  frio: "bg-slate-100 text-slate-700 border-slate-200",
};

const prioridadeColor: Record<string, string> = {
  alta: "bg-red-100 text-red-700 border-red-200",
  media: "bg-amber-100 text-amber-700 border-amber-200",
  baixa: "bg-slate-100 text-slate-700 border-slate-200",
};

export default function Dossies() {
  const navigate = useNavigate();
  const [busca, setBusca] = useState("");
  const [uf, setUf] = useState<string>("__all");
  const [soRevisao, setSoRevisao] = useState(false);

  const { data = [], isLoading } = useQuery({
    queryKey: ["dossies-list", busca, soRevisao],
    queryFn: async () => {
      let q = (supabase as any)
        .from("dossies_sementeiras")
        .select(
          "id, nome_fantasia, cidade, estado, maturidade_lead, prioridade, precisa_revisao, ultima_interacao_em"
        )
        .order("ultima_interacao_em", { ascending: false, nullsFirst: false })
        .limit(500);
      if (busca.trim()) q = q.ilike("nome_fantasia", `%${busca.trim()}%`);
      if (soRevisao) q = q.eq("precisa_revisao", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as DossieRow[];
    },
  });

  const ufs = useMemo(() => {
    const s = new Set<string>();
    data.forEach((d) => d.estado && s.add(d.estado));
    return Array.from(s).sort();
  }, [data]);

  const rows = useMemo(
    () => (uf === "__all" ? data : data.filter((d) => d.estado === uf)),
    [data, uf]
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className="flex items-center gap-2">
              <FileSearch className="w-5 h-5" style={{ color: "#1F4E8C" }} />
              <h1 className="text-lg font-semibold" style={{ color: "#1F4E8C" }}>
                Dossiês
              </h1>
            </div>
          </div>
          <AppHeader />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-4">
        <Card className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[220px]">
              <Label className="text-xs text-muted-foreground">Buscar por nome</Label>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-2 top-2.5 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Nome fantasia…"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
              </div>
            </div>
            <div className="min-w-[160px]">
              <Label className="text-xs text-muted-foreground">UF</Label>
              <Select value={uf} onValueChange={setUf}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">Todas</SelectItem>
                  {ufs.map((u) => (
                    <SelectItem key={u} value={u}>
                      {u}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pb-2">
              <Switch id="rev" checked={soRevisao} onCheckedChange={setSoRevisao} />
              <Label htmlFor="rev" className="text-sm cursor-pointer">
                Somente pendentes de revisão
              </Label>
            </div>
          </div>
        </Card>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <Card className="p-12 text-center text-muted-foreground">
            Nenhum dossiê no seu território ainda.
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2">Nome</th>
                  <th className="text-left px-4 py-2">Cidade/UF</th>
                  <th className="text-left px-4 py-2">Maturidade</th>
                  <th className="text-left px-4 py-2">Prioridade</th>
                  <th className="text-left px-4 py-2">Última interação</th>
                  <th className="text-left px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => (
                  <tr
                    key={d.id}
                    onClick={() => navigate(`/dossie/${d.id}`)}
                    className="border-b hover:bg-slate-50 cursor-pointer"
                  >
                    <td className="px-4 py-3 font-medium">{d.nome_fantasia ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {[d.cidade, d.estado].filter(Boolean).join(" / ") || "—"}
                    </td>
                    <td className="px-4 py-3">
                      {d.maturidade_lead ? (
                        <Badge
                          variant="outline"
                          className={maturidadeColor[d.maturidade_lead] ?? ""}
                        >
                          {d.maturidade_lead}
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {d.prioridade ? (
                        <Badge
                          variant="outline"
                          className={prioridadeColor[d.prioridade] ?? ""}
                        >
                          {d.prioridade}
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {d.ultima_interacao_em
                        ? formatDistanceToNow(new Date(d.ultima_interacao_em), {
                            addSuffix: true,
                            locale: ptBR,
                          })
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {d.precisa_revisao && (
                        <Badge className="bg-amber-100 text-amber-800 border-amber-200 gap-1">
                          <AlertTriangle className="w-3 h-3" /> Revisar
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </main>
    </div>
  );
}
