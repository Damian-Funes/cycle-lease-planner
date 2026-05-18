import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { ArrowLeft, Check, X, Loader2, Shield, Trash2 } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/hooks/useAuth";
import UserPermissionsDialog from "@/components/UserPermissionsDialog";

interface ProfileRow {
  id: string;
  user_id: string;
  email: string;
  nome: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
}

export default function AdminUsuarios() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [rows, setRows] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [permRow, setPermRow] = useState<ProfileRow | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error("Erro ao carregar usuários");
    else setRows((data || []) as ProfileRow[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (row: ProfileRow) => {
    const ok = window.confirm(
      `Excluir definitivamente "${row.nome || row.email}"? Esta ação não pode ser desfeita.`
    );
    if (!ok) return;
    setBusy(row.id);
    const { data, error } = await supabase.functions.invoke("admin-delete-user", {
      body: { user_id: row.user_id },
    });
    setBusy(null);

    // functions.invoke retorna FunctionsHttpError para qualquer non-2xx (ex: 409),
    // com data=null. Precisamos ler o corpo da resposta de erro.
    let errBody: any = null;
    if (error && (error as any).context && typeof (error as any).context.json === "function") {
      try { errBody = await (error as any).context.json(); } catch { /* noop */ }
    }
    const payload = errBody || data;

    if (error || (payload as any)?.error) {
      const msg = (payload as any)?.error || error?.message || "Erro ao excluir";
      const vinc = (payload as any)?.vinculos;
      if (vinc) {
        const det = Object.entries(vinc).map(([k, v]) => `${k}: ${v}`).join(", ");
        toast.error(`${msg} (${det})`);
      } else {
        toast.error(msg);
      }
      return;
    }
    const orfaos = (data as any)?.orfaos;
    if (orfaos && Object.keys(orfaos).length > 0) {
      const det = Object.entries(orfaos).map(([k, v]) => `${k}: ${v}`).join(", ");
      toast.success(`Usuário excluído. Registros sem responsável: ${det}`);
    } else {
      toast.success("Usuário excluído");
    }
    load();
  };

  const setStatus = async (row: ProfileRow, status: "approved" | "rejected") => {
    setBusy(row.id);
    const { error } = await supabase
      .from("profiles")
      .update({
        status,
        approved_at: status === "approved" ? new Date().toISOString() : null,
        approved_by: user?.id,
      })
      .eq("id", row.id);
    setBusy(null);
    if (error) {
      toast.error("Erro ao atualizar");
    } else {
      toast.success(status === "approved" ? "Usuário aprovado" : "Usuário rejeitado");
      load();
    }
  };

  const statusBadge = (s: string) => {
    if (s === "approved") return <Badge className="bg-primary">Aprovado</Badge>;
    if (s === "rejected") return <Badge variant="destructive">Rejeitado</Badge>;
    return <Badge variant="secondary">Pendente</Badge>;
  };

  const pending = rows.filter((r) => r.status === "pending");
  const others = rows.filter((r) => r.status !== "pending");

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="bg-background border-b">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="gap-2">
            <ArrowLeft className="w-4 h-4" /> Voltar
          </Button>
          <AppHeader />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-1">Gerenciar Usuários</h1>
        <p className="text-sm text-muted-foreground mb-6">Aprove ou rejeite cadastros pendentes</p>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : (
          <>
            <Card className="mb-6">
              <div className="p-4 border-b bg-amber-50">
                <h2 className="font-semibold">Pendentes ({pending.length})</h2>
              </div>
              {pending.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">Nenhum cadastro pendente</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Cadastro</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pending.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>{r.nome || "—"}</TableCell>
                        <TableCell>{r.email}</TableCell>
                        <TableCell>{new Date(r.created_at).toLocaleDateString("pt-BR")}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-2 justify-end">
                            <Button size="sm" disabled={busy === r.id} onClick={() => setStatus(r, "approved")} className="gap-1">
                              <Check className="w-3 h-3" /> Aprovar
                            </Button>
                            <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => setStatus(r, "rejected")} className="gap-1">
                              <X className="w-3 h-3" /> Rejeitar
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>

            <Card>
              <div className="p-4 border-b">
                <h2 className="font-semibold">Outros usuários ({others.length})</h2>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {others.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.nome || "—"}</TableCell>
                      <TableCell>{r.email}</TableCell>
                      <TableCell>{statusBadge(r.status)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end">
                          {r.status === "approved" && (
                            <Button size="sm" variant="outline" onClick={() => setPermRow(r)} className="gap-1">
                              <Shield className="w-3 h-3" /> Permissões
                            </Button>
                          )}
                          {r.status !== "approved" && (
                            <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => setStatus(r, "approved")}>Aprovar</Button>
                          )}
                          {r.status !== "rejected" && (
                            <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => setStatus(r, "rejected")}>Rejeitar</Button>
                          )}
                          {r.user_id !== user?.id && (
                            <Button size="sm" variant="destructive" disabled={busy === r.id} onClick={() => handleDelete(r)} className="gap-1">
                              <Trash2 className="w-3 h-3" /> Excluir
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </>
        )}
      </main>

      {permRow && (
        <UserPermissionsDialog
          open={!!permRow}
          onOpenChange={(v) => !v && setPermRow(null)}
          userId={permRow.user_id}
          userLabel={permRow.nome || permRow.email}
        />
      )}
    </div>
  );
}
