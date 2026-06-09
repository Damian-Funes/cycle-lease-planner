import { useState, useMemo, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Plus, Search, Pencil, Loader2, Building2, ChevronLeft, ChevronRight, Upload, AlertTriangle } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import OrganizacaoFormModal, { OrganizacaoRow } from "@/components/OrganizacaoFormModal";
import ImportarOrganizacoesCsvModal from "@/components/ImportarOrganizacoesCsvModal";
import { useResponsavelFilterOptions } from "@/hooks/useResponsavelFilterOptions";
import { useOrganizacoesIncompletas } from "@/hooks/useOrganizacoesIncompletas";

const STATUS_STYLES: Record<string, string> = {
  lead: "bg-gray-200 text-gray-800 hover:bg-gray-200",
  prospect: "bg-blue-100 text-blue-800 hover:bg-blue-100",
  ativo: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100",
  inativo: "bg-gray-700 text-gray-100 hover:bg-gray-700",
  perdido: "bg-red-100 text-red-800 hover:bg-red-100",
};
const STATUS_LABEL: Record<string, string> = {
  lead: "Lead", prospect: "Prospect", ativo: "Ativo", inativo: "Inativo", perdido: "Perdido",
};

interface ProfileLite { user_id: string; nome: string | null; email: string }
const PAGE_SIZE = 25;

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
}

export default function Organizacoes() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { profiles: respFilterProfiles } = useResponsavelFilterOptions();
  const { data: incompletas } = useOrganizacoesIncompletas();
  const incompletasMap = incompletas?.map;
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState(searchParams.get("filtro") === "incompletas" ? "incompletas" : "todos");
  const [respFiltro, setRespFiltro] = useState("todos");
  const [segFiltro, setSegFiltro] = useState("todos");
  const [page, setPage] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<OrganizacaoRow | null>(null);

  useEffect(() => {
    if (searchParams.get("filtro") === "incompletas") setStatusFiltro("incompletas");
  }, [searchParams]);

  const { data: orgs = [], isLoading } = useQuery({
    queryKey: ["organizacoes"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("organizacoes")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as OrganizacaoRow[];
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-lite"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, nome, email").eq("status", "approved");
      return (data ?? []) as ProfileLite[];
    },
  });

  const profileMap = useMemo(() => {
    const m = new Map<string, ProfileLite>();
    profiles.forEach((p) => m.set(p.user_id, p));
    return m;
  }, [profiles]);

  const segmentos = useMemo(() => {
    const s = new Set<string>();
    orgs.forEach((o) => o.segmento && s.add(o.segmento));
    return Array.from(s).sort();
  }, [orgs]);

  const filtered = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return orgs.filter((o) => {
      if (statusFiltro !== "todos" && o.status !== statusFiltro) return false;
      if (respFiltro !== "todos" && o.responsavel_id !== respFiltro) return false;
      if (segFiltro !== "todos" && o.segmento !== segFiltro) return false;
      if (!q) return true;
      return o.nome.toLowerCase().includes(q) || (o.cnpj ?? "").toLowerCase().includes(q);
    });
  }, [orgs, busca, statusFiltro, respFiltro, segFiltro]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageData = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const kpis = useMemo(() => ({
    total: orgs.length,
    leads: orgs.filter((o) => o.status === "lead").length,
    prospects: orgs.filter((o) => o.status === "prospect").length,
    ativos: orgs.filter((o) => o.status === "ativo").length,
  }), [orgs]);

  function openNew() { setEditing(null); setModalOpen(true); }
  function openEdit(o: OrganizacaoRow, e: React.MouseEvent) {
    e.stopPropagation();
    setEditing(o); setModalOpen(true);
  }

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="bg-background border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/"><Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button></Link>
            <Building2 className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-bold">Organizações</h1>
          </div>
          <AppHeader />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="p-4"><div className="text-xs text-muted-foreground">Total</div><div className="text-2xl font-bold">{kpis.total}</div></Card>
          <Card className="p-4"><div className="text-xs text-muted-foreground">Leads</div><div className="text-2xl font-bold">{kpis.leads}</div></Card>
          <Card className="p-4"><div className="text-xs text-muted-foreground">Prospects</div><div className="text-2xl font-bold">{kpis.prospects}</div></Card>
          <Card className="p-4"><div className="text-xs text-muted-foreground">Ativos</div><div className="text-2xl font-bold text-emerald-600">{kpis.ativos}</div></Card>
        </div>

        <div className="flex flex-col lg:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={busca} onChange={(e) => { setBusca(e.target.value); setPage(0); }} placeholder="Buscar por nome ou CNPJ..." className="pl-9" />
          </div>
          <Select value={statusFiltro} onValueChange={(v) => { setStatusFiltro(v); setPage(0); }}>
            <SelectTrigger className="w-full lg:w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos status</SelectItem>
              {Object.entries(STATUS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={respFiltro} onValueChange={(v) => { setRespFiltro(v); setPage(0); }}>
            <SelectTrigger className="w-full lg:w-[180px]"><SelectValue placeholder="Responsável" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos responsáveis</SelectItem>
              {respFilterProfiles.map((p) => <SelectItem key={p.user_id} value={p.user_id}>{p.nome || p.email}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={segFiltro} onValueChange={(v) => { setSegFiltro(v); setPage(0); }}>
            <SelectTrigger className="w-full lg:w-[180px]"><SelectValue placeholder="Segmento" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos segmentos</SelectItem>
              {segmentos.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => setImportOpen(true)} className="gap-1"><Upload className="w-4 h-4" /> Importar CSV</Button>
          <Button onClick={openNew} className="gap-1"><Plus className="w-4 h-4" /> Nova</Button>
        </div>

        <div className="bg-background border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>CNPJ</TableHead>
                <TableHead>Segmento</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead>Atualizada em</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-12"><Loader2 className="w-5 h-5 animate-spin inline text-primary" /></TableCell></TableRow>
              ) : pageData.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">Nenhuma organização encontrada</TableCell></TableRow>
              ) : (
                pageData.map((o) => {
                  const resp = o.responsavel_id ? profileMap.get(o.responsavel_id) : null;
                  const respName = resp?.nome || resp?.email || "";
                  return (
                    <TableRow key={o.id} className="cursor-pointer" onClick={() => navigate(`/organizacoes/${o.id}`)}>
                      <TableCell>
                        <div className="font-medium">{o.nome}</div>
                        {o.nome_fantasia && <div className="text-xs text-muted-foreground">{o.nome_fantasia}</div>}
                      </TableCell>
                      <TableCell className="text-sm">{o.cnpj || "—"}</TableCell>
                      <TableCell className="text-sm">{o.segmento || "—"}</TableCell>
                      <TableCell>
                        <Badge className={STATUS_STYLES[o.status]} variant="secondary">{STATUS_LABEL[o.status]}</Badge>
                      </TableCell>
                      <TableCell>
                        {respName ? (
                          <div className="flex items-center gap-2">
                            <Avatar className="w-6 h-6"><AvatarFallback className="text-xs">{initials(respName)}</AvatarFallback></Avatar>
                            <span className="text-sm">{respName}</span>
                          </div>
                        ) : <span className="text-sm text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(o.updated_at).toLocaleDateString("pt-BR")}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="icon" variant="ghost" onClick={(e) => openEdit(o, e)} title="Editar">
                          <Pencil className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {filtered.length > PAGE_SIZE && (
          <div className="flex items-center justify-between text-sm">
            <div className="text-muted-foreground">
              {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} de {filtered.length}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="flex items-center px-2">Página {page + 1} de {totalPages}</div>
              <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </main>

      <OrganizacaoFormModal open={modalOpen} onOpenChange={setModalOpen} organizacao={editing} />
      <ImportarOrganizacoesCsvModal open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
