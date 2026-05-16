import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Plus, Search, Pencil, Loader2, User, Star, Mail, Phone } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import PessoaFormModal, { PessoaRow } from "@/components/PessoaFormModal";
import { useResponsavelFilterOptions } from "@/hooks/useResponsavelFilterOptions";

interface ProfileLite { user_id: string; nome: string | null; email: string }
interface OrgLite { id: string; nome: string }

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
}

export default function Pessoas() {
  const qc = useQueryClient();
  const { profiles: respFilterProfiles } = useResponsavelFilterOptions();
  const [busca, setBusca] = useState("");
  const [orgFiltro, setOrgFiltro] = useState("todos");
  const [respFiltro, setRespFiltro] = useState("todos");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PessoaRow | null>(null);

  const { data: pessoas = [], isLoading } = useQuery({
    queryKey: ["pessoas"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("pessoas")
        .select("*")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as PessoaRow[];
    },
  });

  const { data: orgs = [] } = useQuery({
    queryKey: ["organizacoes-lite"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("organizacoes").select("id, nome").order("nome");
      return (data ?? []) as OrgLite[];
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-lite"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, nome, email").eq("status", "approved");
      return (data ?? []) as ProfileLite[];
    },
  });

  const orgMap = useMemo(() => new Map(orgs.map((o) => [o.id, o])), [orgs]);
  const profileMap = useMemo(() => new Map(profiles.map((p) => [p.user_id, p])), [profiles]);

  const filtered = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return pessoas.filter((p) => {
      if (orgFiltro !== "todos" && p.organizacao_id !== orgFiltro) return false;
      if (respFiltro !== "todos" && p.responsavel_id !== respFiltro) return false;
      if (!q) return true;
      return p.nome.toLowerCase().includes(q) || (p.email ?? "").toLowerCase().includes(q);
    });
  }, [pessoas, busca, orgFiltro, respFiltro]);

  function openNew() { setEditing(null); setModalOpen(true); }
  function openEdit(p: PessoaRow) { setEditing(p); setModalOpen(true); }

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="bg-background border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/"><Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button></Link>
            <User className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-bold">Pessoas</h1>
          </div>
          <AppHeader />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-4">
        <div className="flex flex-col lg:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou e-mail..." className="pl-9" />
          </div>
          <Select value={orgFiltro} onValueChange={setOrgFiltro}>
            <SelectTrigger className="w-full lg:w-[200px]"><SelectValue placeholder="Organização" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas organizações</SelectItem>
              {orgs.map((o) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={respFiltro} onValueChange={setRespFiltro}>
            <SelectTrigger className="w-full lg:w-[180px]"><SelectValue placeholder="Responsável" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos responsáveis</SelectItem>
              {respFilterProfiles.map((p) => <SelectItem key={p.user_id} value={p.user_id}>{p.nome || p.email}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={openNew} className="gap-1"><Plus className="w-4 h-4" /> Nova Pessoa</Button>
        </div>

        <div className="bg-background border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Cargo</TableHead>
                <TableHead>Organização</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead className="text-center">Decisor</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={8} className="text-center py-12"><Loader2 className="w-5 h-5 animate-spin inline text-primary" /></TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-12 text-muted-foreground">Nenhuma pessoa encontrada</TableCell></TableRow>
              ) : (
                filtered.map((p) => {
                  const org = p.organizacao_id ? orgMap.get(p.organizacao_id) : null;
                  const resp = p.responsavel_id ? profileMap.get(p.responsavel_id) : null;
                  const respName = resp?.nome || resp?.email || "";
                  const tel = p.celular || p.telefone;
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.nome}</TableCell>
                      <TableCell className="text-sm">{p.cargo || "—"}</TableCell>
                      <TableCell>
                        {org ? (
                          <Link to={`/organizacoes/${org.id}`} className="text-primary hover:underline text-sm">
                            {org.nome}
                          </Link>
                        ) : <span className="text-sm text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-sm">{p.email || "—"}</TableCell>
                      <TableCell className="text-sm">{tel || "—"}</TableCell>
                      <TableCell className="text-center">
                        {p.e_decisor && <Star className="w-4 h-4 inline text-amber-500 fill-amber-500" />}
                      </TableCell>
                      <TableCell>
                        {respName ? (
                          <div className="flex items-center gap-2">
                            <Avatar className="w-6 h-6"><AvatarFallback className="text-xs">{initials(respName)}</AvatarFallback></Avatar>
                            <span className="text-sm">{respName}</span>
                          </div>
                        ) : <span className="text-sm text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {p.email && (
                            <a href={`mailto:${p.email}`} title="Enviar e-mail">
                              <Button size="icon" variant="ghost"><Mail className="w-4 h-4" /></Button>
                            </a>
                          )}
                          {tel && (
                            <a href={`tel:${tel}`} title="Ligar">
                              <Button size="icon" variant="ghost"><Phone className="w-4 h-4" /></Button>
                            </a>
                          )}
                          <Button size="icon" variant="ghost" onClick={() => openEdit(p)} title="Editar">
                            <Pencil className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </main>

      <PessoaFormModal open={modalOpen} onOpenChange={setModalOpen} pessoa={editing} />
    </div>
  );
}
