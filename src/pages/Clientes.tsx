import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Plus, Search, Pencil, Trash2, Loader2 } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import ClienteFormModal, { ClienteRow } from "@/components/ClienteFormModal";

const STATUS_STYLES: Record<ClienteRow["status"], string> = {
  lead: "bg-gray-200 text-gray-800 hover:bg-gray-200",
  prospect: "bg-blue-100 text-blue-800 hover:bg-blue-100",
  ativo: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100",
  inativo: "bg-red-100 text-red-800 hover:bg-red-100",
};

const STATUS_LABEL: Record<ClienteRow["status"], string> = {
  lead: "Lead",
  prospect: "Prospect",
  ativo: "Ativo",
  inativo: "Inativo",
};

interface ProfileLite { id: string; nome: string | null; email: string }

export default function Clientes() {
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState<string>("todos");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ClienteRow | null>(null);
  const [toDelete, setToDelete] = useState<ClienteRow | null>(null);

  const { data: clientes = [], isLoading } = useQuery({
    queryKey: ["clientes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clientes")
        .select("*")
        .order("razao_social");
      if (error) throw error;
      return (data ?? []) as ClienteRow[];
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-lite"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, nome, email");
      return (data ?? []) as ProfileLite[];
    },
  });

  const profileMap = useMemo(() => {
    const m = new Map<string, ProfileLite>();
    profiles.forEach((p) => m.set(p.id, p));
    return m;
  }, [profiles]);

  const filtered = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return clientes.filter((c) => {
      if (statusFiltro !== "todos" && c.status !== statusFiltro) return false;
      if (!q) return true;
      return (
        c.razao_social.toLowerCase().includes(q) ||
        (c.cnpj ?? "").toLowerCase().includes(q) ||
        (c.nome_fantasia ?? "").toLowerCase().includes(q)
      );
    });
  }, [clientes, busca, statusFiltro]);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("clientes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cliente excluído");
      qc.invalidateQueries({ queryKey: ["clientes"] });
      setToDelete(null);
    },
    onError: (err: any) => {
      toast.error("Erro ao excluir", { description: err?.message });
    },
  });

  function openNew() {
    setEditing(null);
    setModalOpen(true);
  }
  function openEdit(c: ClienteRow) {
    setEditing(c);
    setModalOpen(true);
  }

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="bg-background border-b sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/">
              <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
            </Link>
            <h1 className="text-lg font-bold">Clientes</h1>
          </div>
          <AppHeader />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por razão social ou CNPJ..."
              className="pl-9"
            />
          </div>
          <Select value={statusFiltro} onValueChange={setStatusFiltro}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              <SelectItem value="lead">Lead</SelectItem>
              <SelectItem value="prospect">Prospect</SelectItem>
              <SelectItem value="ativo">Ativo</SelectItem>
              <SelectItem value="inativo">Inativo</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={openNew} className="gap-1">
            <Plus className="w-4 h-4" /> Novo Cliente
          </Button>
        </div>

        <div className="bg-background border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Razão Social</TableHead>
                <TableHead>CNPJ</TableHead>
                <TableHead>Segmento</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12">
                    <Loader2 className="w-5 h-5 animate-spin inline text-primary" />
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                    Nenhum cliente encontrado
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((c) => {
                  const resp = (c as any).responsavel_id
                    ? profileMap.get((c as any).responsavel_id)
                    : null;
                  return (
                    <TableRow key={c.id}>
                      <TableCell>
                        <div className="font-medium">{c.razao_social}</div>
                        {c.nome_fantasia && (
                          <div className="text-xs text-muted-foreground">{c.nome_fantasia}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{c.cnpj || "—"}</TableCell>
                      <TableCell className="text-sm">{c.segmento || "—"}</TableCell>
                      <TableCell>
                        <Badge className={STATUS_STYLES[c.status]} variant="secondary">
                          {STATUS_LABEL[c.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{resp?.nome || resp?.email || "—"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" onClick={() => openEdit(c)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setToDelete(c)}
                          >
                            <Trash2 className="w-4 h-4" />
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

      <ClienteFormModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        cliente={editing}
      />

      <AlertDialog open={!!toDelete} onOpenChange={(v) => !v && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O cliente <strong>{toDelete?.razao_social}</strong> será removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => toDelete && deleteMutation.mutate(toDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
