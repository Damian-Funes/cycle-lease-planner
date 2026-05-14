import { useState, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft, Pencil, Plus, Trash2, Eye, Loader2, FileText,
  CheckCircle2, DollarSign, Clock, Mail, Phone, Star,
} from "lucide-react";
import AppHeader from "@/components/AppHeader";
import ClienteFormModal, { ClienteRow } from "@/components/ClienteFormModal";
import ContatoFormModal, { ContatoRow } from "@/components/ContatoFormModal";

const STATUS_STYLES: Record<string, string> = {
  lead: "bg-gray-200 text-gray-800 hover:bg-gray-200",
  prospect: "bg-blue-100 text-blue-800 hover:bg-blue-100",
  ativo: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100",
  inativo: "bg-red-100 text-red-800 hover:bg-red-100",
};

const PROPOSTA_STATUS_STYLES: Record<string, string> = {
  rascunho: "bg-gray-200 text-gray-800",
  enviada: "bg-blue-100 text-blue-800",
  aprovada: "bg-emerald-100 text-emerald-800",
  rejeitada: "bg-red-100 text-red-800",
  cancelada: "bg-gray-300 text-gray-700",
};

const STATUS_LABEL: Record<string, string> = {
  lead: "Lead", prospect: "Prospect", ativo: "Ativo", inativo: "Inativo",
};

function formatBRL(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);
}

function diasAtras(data: string | null) {
  if (!data) return "—";
  const diff = Math.floor((Date.now() - new Date(data).getTime()) / (1000 * 60 * 60 * 24));
  if (diff <= 0) return "hoje";
  if (diff === 1) return "ontem";
  return `há ${diff} dias`;
}

export default function Dossie() {
  const { clienteId } = useParams<{ clienteId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [editClienteOpen, setEditClienteOpen] = useState(false);
  const [contatoModalOpen, setContatoModalOpen] = useState(false);
  const [editingContato, setEditingContato] = useState<ContatoRow | null>(null);
  const [contatoToDelete, setContatoToDelete] = useState<ContatoRow | null>(null);

  const { data: cliente, isLoading } = useQuery({
    queryKey: ["cliente", clienteId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("clientes").select("*").eq("id", clienteId).maybeSingle();
      if (error) throw error;
      return data as (ClienteRow & { responsavel_id: string | null }) | null;
    },
    enabled: !!clienteId,
  });

  const { data: responsavel } = useQuery({
    queryKey: ["profile", cliente?.responsavel_id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles")
        .select("id, nome, email").eq("id", cliente!.responsavel_id!).maybeSingle();
      return data;
    },
    enabled: !!cliente?.responsavel_id,
  });

  const { data: contatos = [] } = useQuery({
    queryKey: ["contatos", clienteId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("contatos").select("*").eq("cliente_id", clienteId).order("nome");
      if (error) throw error;
      return (data ?? []) as ContatoRow[];
    },
    enabled: !!clienteId,
  });

  const { data: propostas = [] } = useQuery({
    queryKey: ["propostas-cliente", clienteId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("propostas").select("*").eq("cliente_id", clienteId).order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!clienteId,
  });

  const kpis = useMemo(() => {
    const ativas = propostas.filter((p) => p.status === "enviada").length;
    const aprovadas = propostas.filter((p) => p.status === "aprovada");
    const valorAprovado = aprovadas.reduce((s, p) => s + (Number(p.total_10_anos) || 0), 0);
    const ultima = propostas[0]?.updated_at ?? null;
    return { ativas, aprovadas: aprovadas.length, valorAprovado, ultima };
  }, [propostas]);

  const deleteContatoMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("contatos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Contato excluído");
      qc.invalidateQueries({ queryKey: ["contatos", clienteId] });
      setContatoToDelete(null);
    },
    onError: (err: any) => toast.error("Erro ao excluir", { description: err?.message }),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!cliente) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Cliente não encontrado</p>
        <Link to="/clientes"><Button variant="outline">Voltar</Button></Link>
      </div>
    );
  }

  const respInitials = (responsavel?.nome || responsavel?.email || "?")
    .split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="bg-background border-b sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/clientes">
              <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
            </Link>
            <h1 className="text-lg font-bold">Dossiê do Cliente</h1>
          </div>
          <AppHeader />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Cabeçalho */}
        <Card>
          <CardContent className="p-6 flex flex-col md:flex-row gap-6 md:items-start">
            <div className="flex-1 space-y-3">
              <div>
                <h2 className="text-2xl font-bold leading-tight">{cliente.razao_social}</h2>
                {cliente.nome_fantasia && (
                  <p className="text-muted-foreground">{cliente.nome_fantasia}</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {cliente.cnpj && <Badge variant="outline">CNPJ: {cliente.cnpj}</Badge>}
                {cliente.segmento && <Badge variant="outline">{cliente.segmento}</Badge>}
                {cliente.regiao && <Badge variant="outline">{cliente.regiao}</Badge>}
                <Badge className={STATUS_STYLES[cliente.status]} variant="secondary">
                  {STATUS_LABEL[cliente.status]}
                </Badge>
              </div>
              {responsavel && (
                <div className="flex items-center gap-2 pt-2">
                  <Avatar className="w-8 h-8">
                    <AvatarFallback className="bg-primary/10 text-primary text-xs">{respInitials}</AvatarFallback>
                  </Avatar>
                  <div className="text-sm">
                    <div className="text-xs text-muted-foreground">Responsável comercial</div>
                    <div className="font-medium">{responsavel.nome || responsavel.email}</div>
                  </div>
                </div>
              )}
            </div>
            <Button onClick={() => setEditClienteOpen(true)} className="gap-2">
              <Pencil className="w-4 h-4" /> Editar Cliente
            </Button>
          </CardContent>
        </Card>

        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard icon={FileText} label="Propostas Ativas" value={String(kpis.ativas)} color="text-blue-600 bg-blue-100" />
          <KpiCard icon={CheckCircle2} label="Propostas Aprovadas" value={String(kpis.aprovadas)} color="text-emerald-600 bg-emerald-100" />
          <KpiCard icon={DollarSign} label="Valor Total Aprovado" value={formatBRL(kpis.valorAprovado)} color="text-amber-600 bg-amber-100" />
          <KpiCard icon={Clock} label="Última Interação" value={diasAtras(kpis.ultima)} color="text-purple-600 bg-purple-100" />
        </div>

        {/* Tabs */}
        <Tabs defaultValue="overview">
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-5">
            <TabsTrigger value="overview">Visão Geral</TabsTrigger>
            <TabsTrigger value="contatos">Contatos</TabsTrigger>
            <TabsTrigger value="propostas">Propostas</TabsTrigger>
            <TabsTrigger value="layouts">Layouts</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
          </TabsList>

          {/* Visão Geral */}
          <TabsContent value="overview" className="space-y-4">
            <Card>
              <CardContent className="p-6">
                <h3 className="font-semibold mb-2">Observações</h3>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {cliente.observacoes || "Nenhuma observação cadastrada."}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold">Contatos ({contatos.length})</h3>
                </div>
                {contatos.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum contato cadastrado.</p>
                ) : (
                  <div className="grid sm:grid-cols-2 gap-3">
                    {contatos.slice(0, 4).map((c) => (
                      <div key={c.id} className="p-3 rounded-md border bg-muted/20">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{c.nome}</span>
                          {c.e_decisor && <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />}
                        </div>
                        {c.cargo && <div className="text-xs text-muted-foreground">{c.cargo}</div>}
                        <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
                          {c.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{c.email}</span>}
                          {c.telefone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{c.telefone}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Contatos */}
          <TabsContent value="contatos">
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex justify-end">
                  <Button size="sm" className="gap-1" onClick={() => { setEditingContato(null); setContatoModalOpen(true); }}>
                    <Plus className="w-4 h-4" /> Novo Contato
                  </Button>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Cargo</TableHead>
                      <TableHead>E-mail</TableHead>
                      <TableHead>Telefone</TableHead>
                      <TableHead>Decisor</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contatos.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhum contato.</TableCell></TableRow>
                    ) : contatos.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.nome}</TableCell>
                        <TableCell className="text-sm">{c.cargo || "—"}</TableCell>
                        <TableCell className="text-sm">{c.email || "—"}</TableCell>
                        <TableCell className="text-sm">{c.telefone || "—"}</TableCell>
                        <TableCell>{c.e_decisor ? <Star className="w-4 h-4 text-amber-500 fill-amber-500" /> : "—"}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="icon" variant="ghost" onClick={() => { setEditingContato(c); setContatoModalOpen(true); }}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button size="icon" variant="ghost" className="text-destructive" onClick={() => setContatoToDelete(c)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Propostas */}
          <TabsContent value="propostas">
            <Card>
              <CardContent className="p-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Nº</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {propostas.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhuma proposta vinculada.</TableCell></TableRow>
                    ) : propostas.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="text-sm">{new Date(p.updated_at).toLocaleDateString("pt-BR")}</TableCell>
                        <TableCell className="text-sm">{p.numero_proposta || "—"}</TableCell>
                        <TableCell>
                          <Badge className={PROPOSTA_STATUS_STYLES[p.status] || "bg-gray-200"} variant="secondary">
                            {p.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-sm">{formatBRL(Number(p.total_10_anos) || 0)}</TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="ghost" onClick={() => navigate(`/orcamento/${p.id}`)}>
                            <Eye className="w-4 h-4 mr-1" /> Ver
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="layouts">
            <Card><CardContent className="p-12 text-center text-muted-foreground">Em breve</CardContent></Card>
          </TabsContent>

          <TabsContent value="timeline">
            <Card><CardContent className="p-12 text-center text-muted-foreground">Em breve</CardContent></Card>
          </TabsContent>
        </Tabs>
      </main>

      <ClienteFormModal
        open={editClienteOpen}
        onOpenChange={setEditClienteOpen}
        cliente={cliente as any}
        onSaved={() => qc.invalidateQueries({ queryKey: ["cliente", clienteId] })}
      />

      <ContatoFormModal
        open={contatoModalOpen}
        onOpenChange={setContatoModalOpen}
        clienteId={clienteId!}
        contato={editingContato}
      />

      <AlertDialog open={!!contatoToDelete} onOpenChange={(v) => !v && setContatoToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir contato?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{contatoToDelete?.nome}</strong> será removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => contatoToDelete && deleteContatoMutation.mutate(contatoToDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="font-semibold text-lg leading-tight truncate">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}
