import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import OrganizacaoFormModal from "@/components/OrganizacaoFormModal";
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
import { Label } from "@/components/ui/label";
import { ArrowLeft, FileSearch, Search, Plus, MessageSquare } from "lucide-react";

interface DossiePendenteRow {
  id: string;
  nome_fantasia: string | null;
  cidade: string | null;
  estado: string | null;
  maturidade_lead: string | null;
  total_interacoes: number | null;
  ultima_interacao: string | null;
}

const maturidadeColor: Record<string, string> = {
  quente: "bg-red-100 text-red-700 border-red-200",
  morno: "bg-amber-100 text-amber-700 border-amber-200",
  frio: "bg-slate-100 text-slate-700 border-slate-200",
};

export default function Dossies() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [uf, setUf] = useState<string>("__all");
  const [modalOpen, setModalOpen] = useState(false);
  const [dossieAtual, setDossieAtual] = useState<DossiePendenteRow | null>(null);
  const [initialValues, setInitialValues] = useState<any>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ["dossies-pendentes", busca],
    queryFn: async () => {
      let q = (supabase as any)
        .from("vw_dossies_pendentes")
        .select("*")
        .order("ultima_interacao", { ascending: false, nullsFirst: false })
        .limit(500);
      if (busca.trim()) q = q.ilike("nome_fantasia", `%${busca.trim()}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as DossiePendenteRow[];
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

  const abrirCadastro = (d: DossiePendenteRow) => {
    setDossieAtual(d);
    setInitialValues({
      nome: d.nome_fantasia ?? "",
      nome_fantasia: d.nome_fantasia ?? "",
      cidade: d.cidade ?? "",
      estado: d.estado ?? "",
      status: "lead",
    });
    setModalOpen(true);
  };

  const onCreated = async (novaOrgId: string) => {
    if (!dossieAtual) return;
    const { error } = await (supabase as any)
      .from("dossies_sementeiras")
      .update({ organizacao_id: novaOrgId })
      .eq("id", dossieAtual.id);
    if (error) {
      toast.error("Organização criada, mas falha ao vincular o dossiê", {
        description: error.message,
      });
    } else {
      toast.success("Dossiê vinculado à nova organização");
    }
    qc.invalidateQueries({ queryKey: ["dossies-pendentes"] });
    setDossieAtual(null);
    setInitialValues(null);
  };

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
                Dossiês — leads a cadastrar
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
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Leads relatados em campo ainda não cadastrados como organização. Cadastre para
            que passem a aparecer no CRM com aba "Interações de campo".
          </p>
        </Card>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <Card className="p-12 text-center text-muted-foreground">
            Nenhum lead pendente. Todos os dossiês já foram vinculados a organizações.
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2">Nome</th>
                  <th className="text-left px-4 py-2">Cidade/UF</th>
                  <th className="text-left px-4 py-2">Maturidade</th>
                  <th className="text-left px-4 py-2">Interações</th>
                  <th className="text-left px-4 py-2">Última interação</th>
                  <th className="text-right px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.id} className="border-b hover:bg-slate-50">
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
                    <td className="px-4 py-3 text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <MessageSquare className="w-3.5 h-3.5" />
                        {d.total_interacoes ?? 0}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {d.ultima_interacao
                        ? formatDistanceToNow(new Date(d.ultima_interacao), {
                            addSuffix: true,
                            locale: ptBR,
                          })
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" variant="outline" onClick={() => abrirCadastro(d)}>
                        <Plus className="w-3.5 h-3.5 mr-1" />
                        Cadastrar como organização
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </main>

      <OrganizacaoFormModal
        open={modalOpen}
        onOpenChange={(v) => {
          setModalOpen(v);
          if (!v) {
            setDossieAtual(null);
            setInitialValues(null);
          }
        }}
        initialValues={initialValues}
        onCreated={onCreated}
      />
    </div>
  );
}
