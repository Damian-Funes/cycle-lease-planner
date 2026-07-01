import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import InlineEdit from "@/components/InlineEdit";
import PessoaFormModal, { PessoaRow } from "@/components/PessoaFormModal";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import {
  ArrowLeft, Trash2, Loader2, Building2, ChevronDown, Plus, Star, Mail, Phone, Pencil, ChevronsUpDown, Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { OrganizacaoRow } from "@/components/OrganizacaoFormModal";
import ActivityFeed from "@/components/ActivityFeed";
import OrgPropostas from "@/components/OrgPropostas";
import OrgOrcamentos from "@/components/OrgOrcamentos";
import OrgLayouts from "@/components/OrgLayouts";
import OrgKpis from "@/components/OrgKpis";
import SemPermissao from "@/components/SemPermissao";
import { InformacoesImportantes } from "@/components/IaInsights";

const STATUS = ["lead", "prospect", "ativo", "inativo", "perdido"] as const;
const STATUS_STYLES: Record<string, string> = {
  lead: "bg-gray-200 text-gray-800",
  prospect: "bg-blue-100 text-blue-800",
  ativo: "bg-emerald-100 text-emerald-800",
  inativo: "bg-gray-700 text-gray-100",
  perdido: "bg-red-100 text-red-800",
};
const STATUS_LABEL: Record<string, string> = {
  lead: "Lead", prospect: "Prospect", ativo: "Ativo", inativo: "Inativo", perdido: "Perdido",
};

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
}

export default function OrganizacaoDetalhe() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [pessoaModalOpen, setPessoaModalOpen] = useState(false);
  const [editingPessoa, setEditingPessoa] = useState<PessoaRow | null>(null);
  const [vincularOpen, setVincularOpen] = useState(false);

  const { data: org, isLoading, isError } = useQuery({
    queryKey: ["organizacao", id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("organizacoes").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return (data ?? null) as OrganizacaoRow | null;
    },
    enabled: !!id,
    retry: false,
  });

  const orgExiste = !!org;

  const { data: pessoas = [] } = useQuery({
    queryKey: ["pessoas", "org", id],
    queryFn: async () => {
      const { data } = await (supabase as any).from("pessoas").select("*").eq("organizacao_id", id).order("nome");
      return (data ?? []) as PessoaRow[];
    },
    enabled: !!id && orgExiste,
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-lite"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, nome, email").eq("status", "approved");
      return (data ?? []) as { user_id: string; nome: string | null; email: string }[];
    },
    enabled: orgExiste,
  });
  const profileMap = useMemo(() => new Map(profiles.map((p) => [p.user_id, p])), [profiles]);

  const updateMutation = useMutation({
    mutationFn: async (patch: Partial<OrganizacaoRow>) => {
      const { error } = await (supabase as any).from("organizacoes").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["organizacao", id] });
      qc.invalidateQueries({ queryKey: ["organizacoes"] });
    },
    onError: (err: any) => toast.error("Erro ao salvar", { description: err?.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("organizacoes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Organização excluída");
      navigate("/organizacoes");
    },
    onError: (err: any) => toast.error("Erro ao excluir", { description: err?.message }),
  });

  async function patchField(field: keyof OrganizacaoRow, value: any) {
    await updateMutation.mutateAsync({ [field]: value } as any);
    toast.success("Salvo");
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !org) {
    return (
      <SemPermissao
        titulo="Organização não encontrada"
        mensagem="Esta organização não existe ou você não tem permissão para visualizá-la."
        ctaText="Voltar para Organizações"
        ctaHref="/organizacoes"
        icone="search"
      />
    );
  }

  const resp = org.responsavel_id ? profileMap.get(org.responsavel_id) : null;

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="bg-background border-b sticky top-0 z-20">
        <div className="max-w-[1400px] mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Link to="/organizacoes"><Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button></Link>
            <div className="text-sm text-muted-foreground flex items-center gap-1 min-w-0">
              <Building2 className="w-4 h-4 shrink-0" />
              <Link to="/organizacoes" className="hover:underline">Organizações</Link>
              <span>/</span>
              <span className="font-semibold text-foreground truncate">{org.nome}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-destructive hover:text-destructive gap-1">
                  <Trash2 className="w-4 h-4" /> Excluir
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir organização?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta ação não pode ser desfeita. <strong>{org.nome}</strong> será removida permanentemente.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => deleteMutation.mutate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    {deleteMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Excluir
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <AppHeader />
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-[320px_1fr_320px] gap-4">
        {/* ESQUERDA */}
        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">Dados da Organização</h3>
              <Badge className={cn(STATUS_STYLES[org.status])} variant="secondary">
                {STATUS_LABEL[org.status]}
              </Badge>
            </div>

            <Field label="Nome">
              <InlineEdit value={org.nome} onSave={(v) => patchField("nome", v || org.nome)} />
            </Field>
            <Field label="Nome Fantasia">
              <InlineEdit value={org.nome_fantasia} onSave={(v) => patchField("nome_fantasia", v)} />
            </Field>
            <Field label="CNPJ">
              <InlineEdit value={org.cnpj} onSave={(v) => patchField("cnpj", v)} />
            </Field>
            <Field label="Status">
              <Select value={org.status} onValueChange={(v) => patchField("status", v)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS.map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Responsável">
              <Select
                value={org.responsavel_id || "none"}
                onValueChange={(v) => patchField("responsavel_id", v === "none" ? null : v)}
              >
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Nenhum" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {profiles.map((p) => <SelectItem key={p.user_id} value={p.user_id}>{p.nome || p.email}</SelectItem>)}
                </SelectContent>
              </Select>
              {resp && (
                <div className="flex items-center gap-2 mt-1 px-2">
                  <Avatar className="w-5 h-5"><AvatarFallback className="text-[10px]">{initials(resp.nome || resp.email)}</AvatarFallback></Avatar>
                  <span className="text-xs text-muted-foreground">{resp.nome || resp.email}</span>
                </div>
              )}
            </Field>
            <Field label="Segmento"><InlineEdit value={org.segmento} onSave={(v) => patchField("segmento", v)} /></Field>
            <Field label="Porte">
              <Select value={org.porte || "none"} onValueChange={(v) => patchField("porte", v === "none" ? null : v)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  <SelectItem value="pequeno">Pequeno</SelectItem>
                  <SelectItem value="medio">Médio</SelectItem>
                  <SelectItem value="grande">Grande</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Região"><InlineEdit value={org.regiao} onSave={(v) => patchField("regiao", v)} /></Field>
            <Field label="Endereço"><InlineEdit value={org.endereco} onSave={(v) => patchField("endereco", v)} /></Field>
            <Field label="Cidade"><InlineEdit value={org.cidade} onSave={(v) => patchField("cidade", v)} /></Field>
            <Field label="Estado"><InlineEdit value={org.estado} onSave={(v) => patchField("estado", v)} /></Field>
            <Field label="Site"><InlineEdit value={org.site} onSave={(v) => patchField("site", v)} /></Field>
            <Field label="Telefone"><InlineEdit value={org.telefone_principal} onSave={(v) => patchField("telefone_principal", v)} /></Field>
            <Field label="E-mail"><InlineEdit value={org.email_principal} onSave={(v) => patchField("email_principal", v)} type="email" /></Field>
          </Card>

          <Collapsible>
            <Card className="p-4">
              <CollapsibleTrigger className="w-full flex items-center justify-between">
                <h3 className="font-semibold text-sm">Histórico de Status</h3>
                <ChevronDown className="w-4 h-4" />
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-3 space-y-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Badge className={cn(STATUS_STYLES[org.status])} variant="secondary">{STATUS_LABEL[org.status]}</Badge>
                  <span className="text-xs">atualizado em {new Date(org.updated_at).toLocaleDateString("pt-BR")}</span>
                </div>
                <div className="text-xs">Histórico detalhado disponível em sprints futuros.</div>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        </aside>

        {/* CENTRO */}
        <section>
          <Tabs defaultValue="visao">
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="visao">Visão Geral</TabsTrigger>
              <TabsTrigger value="pessoas">Pessoas ({pessoas.length})</TabsTrigger>
              <TabsTrigger value="propostas">Propostas SmartCycle</TabsTrigger>
              <TabsTrigger value="orcamentos">Orçamentos</TabsTrigger>
              <TabsTrigger value="layouts">Layouts</TabsTrigger>
              <TabsTrigger value="oportunidades">Oportunidades</TabsTrigger>
              <TabsTrigger value="atividades">Atividades</TabsTrigger>
              <TabsTrigger value="notas">Notas</TabsTrigger>
            </TabsList>

            <TabsContent value="visao" className="mt-4 space-y-4">
              <InformacoesImportantes texto={(org as any).informacoes_importantes} />
              <Card className="p-4 space-y-2">
                <h3 className="font-semibold text-sm">Observações</h3>
                <InlineEdit
                  value={org.observacoes}
                  onSave={(v) => patchField("observacoes", v)}
                  multiline
                  placeholder="Clique para adicionar observações..."
                />
              </Card>
              <Card className="p-4">
                <h3 className="font-semibold text-sm mb-2">Últimas Atividades</h3>
                <ActivityFeed entityType="organizacao" entityId={org.id} />
              </Card>
            </TabsContent>

            <TabsContent value="pessoas" className="mt-4">
              <Card className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm">Pessoas vinculadas</h3>
                  <div className="flex gap-2">
                    <VincularPessoaButton
                      orgId={id}
                      open={vincularOpen}
                      onOpenChange={setVincularOpen}
                    />
                    <Button size="sm" onClick={() => { setEditingPessoa(null); setPessoaModalOpen(true); }} className="gap-1">
                      <Plus className="w-4 h-4" /> Nova Pessoa
                    </Button>
                  </div>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Cargo</TableHead>
                      <TableHead>E-mail</TableHead>
                      <TableHead>Telefone</TableHead>
                      <TableHead className="text-center">Decisor</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pessoas.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-sm">Nenhuma pessoa vinculada</TableCell></TableRow>
                    ) : pessoas.map((p) => {
                      const tel = p.celular || p.telefone;
                      return (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">{p.nome}</TableCell>
                          <TableCell className="text-sm">{p.cargo || "—"}</TableCell>
                          <TableCell className="text-sm">{p.email || "—"}</TableCell>
                          <TableCell className="text-sm">{tel || "—"}</TableCell>
                          <TableCell className="text-center">
                            {p.e_decisor && <Star className="w-4 h-4 inline text-amber-500 fill-amber-500" />}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              {p.email && <a href={`mailto:${p.email}`}><Button size="icon" variant="ghost"><Mail className="w-4 h-4" /></Button></a>}
                              {tel && <a href={`tel:${tel}`}><Button size="icon" variant="ghost"><Phone className="w-4 h-4" /></Button></a>}
                              <Button size="icon" variant="ghost" onClick={() => { setEditingPessoa(p); setPessoaModalOpen(true); }}>
                                <Pencil className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Card>
            </TabsContent>

            <TabsContent value="propostas" className="mt-4">
              <OrgPropostas organizacaoId={id} />
            </TabsContent>
            <TabsContent value="orcamentos" className="mt-4">
              <OrgOrcamentos organizacaoId={id} />
            </TabsContent>
            <TabsContent value="layouts" className="mt-4">
              <OrgLayouts organizacaoId={id} organizacaoNome={org.nome} />
            </TabsContent>

            <TabsContent value="oportunidades" className="mt-4">
              <Card className="p-8 text-center text-muted-foreground text-sm">Em breve</Card>
            </TabsContent>
            <TabsContent value="atividades" className="mt-4">
              {org && <ActivityFeed entityType="organizacao" entityId={org.id} />}
            </TabsContent>
            <TabsContent value="notas" className="mt-4">
              <Card className="p-8 text-center text-muted-foreground text-sm">Em breve</Card>
            </TabsContent>
          </Tabs>
        </section>

        {/* DIREITA */}
        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <Card className="p-4">
            <h3 className="font-semibold text-sm mb-2">Próximas Atividades</h3>
            <p className="text-sm text-muted-foreground">Nenhuma agendada.</p>
          </Card>
          <OrgKpis organizacaoId={id} />
        </aside>
      </main>

      <PessoaFormModal
        open={pessoaModalOpen}
        onOpenChange={setPessoaModalOpen}
        pessoa={editingPessoa}
        defaultOrganizacaoId={id}
      />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground px-2">{label}</div>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

/** Botão para vincular uma pessoa existente (sem org ou de outra org) a esta organização */
function VincularPessoaButton({ orgId, open, onOpenChange }: { orgId: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [popOpen, setPopOpen] = useState(false);

  const { data: candidatas = [] } = useQuery({
    queryKey: ["pessoas-vinculaveis", orgId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("pessoas")
        .select("id, nome, email, organizacao_id")
        .neq("organizacao_id", orgId)
        .order("nome");
      return (data ?? []) as { id: string; nome: string; email: string | null; organizacao_id: string | null }[];
    },
    enabled: open,
  });

  const vincular = useMutation({
    mutationFn: async (pessoaId: string) => {
      const { error } = await (supabase as any).from("pessoas").update({ organizacao_id: orgId }).eq("id", pessoaId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pessoa vinculada");
      qc.invalidateQueries({ queryKey: ["pessoas", "org", orgId] });
      qc.invalidateQueries({ queryKey: ["pessoas-vinculaveis", orgId] });
      qc.invalidateQueries({ queryKey: ["pessoas"] });
      onOpenChange(false);
    },
    onError: (err: any) => toast.error("Erro", { description: err?.message }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Button size="sm" variant="outline" className="gap-1" onClick={() => onOpenChange(true)}>
        <Plus className="w-4 h-4" /> Vincular Pessoa
      </Button>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Vincular Pessoa Existente</DialogTitle></DialogHeader>
        <Popover open={popOpen} onOpenChange={setPopOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" role="combobox" className="w-full justify-between font-normal">
              Selecione uma pessoa…
              <ChevronsUpDown className="w-4 h-4 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
            <Command>
              <CommandInput placeholder="Buscar..." />
              <CommandList>
                <CommandEmpty>Nenhuma pessoa</CommandEmpty>
                <CommandGroup>
                  {candidatas.map((p) => (
                    <CommandItem key={p.id} value={p.nome} onSelect={() => { setPopOpen(false); vincular.mutate(p.id); }}>
                      <Check className="mr-2 h-4 w-4 opacity-0" />
                      <div className="flex flex-col">
                        <span>{p.nome}</span>
                        {p.email && <span className="text-xs text-muted-foreground">{p.email}</span>}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
