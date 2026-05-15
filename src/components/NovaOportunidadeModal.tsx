import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { CalendarIcon, Check, ChevronsUpDown, Loader2, Plus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import OrganizacaoFormModal from "./OrganizacaoFormModal";

const PAPEIS = ["decisor", "influenciador", "técnico", "comprador"] as const;
type Papel = typeof PAPEIS[number];

const schema = z.object({
  titulo: z.string().trim().min(1, "Obrigatório"),
  pipeline_id: z.string().uuid("Selecione um pipeline"),
  etapa_id: z.string().uuid("Selecione uma etapa"),
  organizacao_id: z.string().uuid("Selecione uma organização"),
  valor_estimado: z.number().min(0).default(0),
  probabilidade: z.number().min(0).max(100).default(50),
  data_fechamento_prevista: z.date().optional().nullable(),
  responsavel_id: z.string().optional().or(z.literal("")),
  observacoes: z.string().optional().or(z.literal("")),
});

type FormValues = z.infer<typeof schema>;

interface PessoaSel {
  id: string;
  nome: string;
  papel: Papel;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultOrganizacaoId?: string;
  defaultPipelineId?: string;
  defaultTitulo?: string;
  defaultValor?: number;
  onCreated?: (id: string) => void;
}

const formatBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function NovaOportunidadeModal({
  open,
  onOpenChange,
  defaultOrganizacaoId,
  defaultPipelineId,
}: Props) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [orgPopoverOpen, setOrgPopoverOpen] = useState(false);
  const [pessoasPopoverOpen, setPessoasPopoverOpen] = useState(false);
  const [novaOrgOpen, setNovaOrgOpen] = useState(false);
  const [valorRaw, setValorRaw] = useState("");
  const [pessoasSel, setPessoasSel] = useState<PessoaSel[]>([]);

  const { data: pipelines = [] } = useQuery({
    queryKey: ["pipelines-ativos"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("pipelines")
        .select("id, nome, ativo")
        .eq("ativo", true)
        .order("ordem");
      if (error) throw error;
      return data as { id: string; nome: string }[];
    },
  });

  const { data: etapas = [] } = useQuery({
    queryKey: ["etapas-pipeline-all"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("etapas_pipeline")
        .select("*")
        .order("ordem");
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: orgs = [] } = useQuery({
    queryKey: ["organizacoes-combobox"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("organizacoes").select("id, nome").order("nome");
      return (data ?? []) as { id: string; nome: string }[];
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-approved-lite"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, user_id, nome, email").eq("status", "approved");
      return (data ?? []) as { id: string; user_id: string; nome: string | null; email: string }[];
    },
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema) as any,
    defaultValues: {
      titulo: "",
      pipeline_id: "",
      etapa_id: "",
      organizacao_id: "",
      valor_estimado: 0,
      probabilidade: 50,
      data_fechamento_prevista: null,
      responsavel_id: "",
      observacoes: "",
    },
  });

  const pipelineId = form.watch("pipeline_id");
  const etapaId = form.watch("etapa_id");
  const orgId = form.watch("organizacao_id");

  const etapasDoPipeline = useMemo(
    () => etapas.filter((e) => e.pipeline_id === pipelineId),
    [etapas, pipelineId]
  );

  const { data: pessoasOrg = [] } = useQuery({
    queryKey: ["pessoas-org", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("pessoas")
        .select("id, nome, e_decisor")
        .eq("organizacao_id", orgId)
        .order("nome");
      return (data ?? []) as { id: string; nome: string; e_decisor: boolean }[];
    },
  });

  // Reset on open
  useEffect(() => {
    if (open) {
      const meProfile = profiles.find((p) => p.user_id === user?.id);
      const firstPipeline = defaultPipelineId || pipelines[0]?.id || "";
      form.reset({
        titulo: "",
        pipeline_id: firstPipeline,
        etapa_id: "",
        organizacao_id: defaultOrganizacaoId ?? "",
        valor_estimado: 0,
        probabilidade: 50,
        data_fechamento_prevista: null,
        responsavel_id: meProfile?.id ?? "",
        observacoes: "",
      });
      setValorRaw("");
      setPessoasSel([]);
    }
  }, [open]); // eslint-disable-line

  // Default etapa = first of pipeline
  useEffect(() => {
    if (pipelineId && etapasDoPipeline.length && !etapasDoPipeline.find((e) => e.id === etapaId)) {
      form.setValue("etapa_id", etapasDoPipeline[0].id);
    }
  }, [pipelineId, etapasDoPipeline]); // eslint-disable-line

  // Default probabilidade from etapa
  useEffect(() => {
    const etapa = etapas.find((e) => e.id === etapaId);
    if (etapa) form.setValue("probabilidade", etapa.probabilidade_default ?? 50);
  }, [etapaId]); // eslint-disable-line

  // Pré-popular pessoas ao trocar org
  useEffect(() => {
    if (!orgId) return;
    setPessoasSel((curr) => {
      const existing = new Set(curr.map((p) => p.id));
      const additions = pessoasOrg
        .filter((p) => !existing.has(p.id))
        .map((p) => ({ id: p.id, nome: p.nome, papel: (p.e_decisor ? "decisor" : "influenciador") as Papel }));
      return [...curr, ...additions];
    });
  }, [orgId, pessoasOrg]);

  const togglePessoa = (id: string, nome: string) => {
    setPessoasSel((curr) =>
      curr.find((p) => p.id === id)
        ? curr.filter((p) => p.id !== id)
        : [...curr, { id, nome, papel: "influenciador" }]
    );
  };

  const handleValorChange = (raw: string) => {
    const digits = raw.replace(/\D/g, "");
    const num = digits ? Number(digits) / 100 : 0;
    setValorRaw(digits ? formatBRL(num) : "");
    form.setValue("valor_estimado", num);
  };

  const mutation = useMutation({
    mutationFn: async (v: FormValues) => {
      const payload: any = {
        titulo: v.titulo.trim(),
        pipeline_id: v.pipeline_id,
        etapa_id: v.etapa_id,
        organizacao_id: v.organizacao_id,
        valor_estimado: v.valor_estimado,
        probabilidade: v.probabilidade,
        data_fechamento_prevista: v.data_fechamento_prevista
          ? format(v.data_fechamento_prevista, "yyyy-MM-dd")
          : null,
        responsavel_id: v.responsavel_id || null,
        observacoes: v.observacoes?.trim() || null,
      };
      const { data, error } = await (supabase as any)
        .from("oportunidades")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;

      if (pessoasSel.length) {
        const rows = pessoasSel.map((p) => ({
          oportunidade_id: data.id,
          pessoa_id: p.id,
          papel: p.papel,
        }));
        const { error: e2 } = await (supabase as any).from("oportunidade_pessoas").insert(rows);
        if (e2) throw e2;
      }
      return data.id as string;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["oportunidades"] });
      toast.success("Oportunidade criada", {
        action: { label: "Ver detalhes", onClick: () => (window.location.href = `/crm/deal/${id}`) },
      });
      onOpenChange(false);
    },
    onError: (err: any) => toast.error("Erro ao salvar", { description: err?.message }),
  });

  const orgSelected = orgs.find((o) => o.id === orgId);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova Oportunidade</DialogTitle>
          </DialogHeader>

          <form
            onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
            className="grid grid-cols-1 sm:grid-cols-2 gap-3"
          >
            {/* Título */}
            <div className="sm:col-span-2 space-y-1">
              <Label>Título *</Label>
              <Input {...form.register("titulo")} placeholder="Ex: SmartCycle Centro 200t/h" />
              {form.formState.errors.titulo && (
                <p className="text-xs text-destructive">{form.formState.errors.titulo.message}</p>
              )}
            </div>

            {/* Pipeline */}
            <div className="space-y-1">
              <Label>Pipeline *</Label>
              <Select value={pipelineId} onValueChange={(v) => form.setValue("pipeline_id", v, { shouldValidate: true })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {pipelines.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.pipeline_id && (
                <p className="text-xs text-destructive">{form.formState.errors.pipeline_id.message}</p>
              )}
            </div>

            {/* Etapa */}
            <div className="space-y-1">
              <Label>Etapa inicial *</Label>
              <Select
                value={etapaId}
                onValueChange={(v) => form.setValue("etapa_id", v, { shouldValidate: true })}
                disabled={!pipelineId}
              >
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {etapasDoPipeline.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Organização */}
            <div className="sm:col-span-2 space-y-1">
              <Label>Organização *</Label>
              <Popover open={orgPopoverOpen} onOpenChange={setOrgPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" role="combobox" className="w-full justify-between font-normal">
                    {orgSelected?.nome ?? <span className="text-muted-foreground">Selecione…</span>}
                    <ChevronsUpDown className="w-4 h-4 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar organização..." />
                    <CommandList>
                      <CommandEmpty>Nenhuma encontrada</CommandEmpty>
                      <CommandGroup>
                        {orgs.map((o) => (
                          <CommandItem
                            key={o.id}
                            value={o.nome}
                            onSelect={() => {
                              form.setValue("organizacao_id", o.id, { shouldValidate: true });
                              setOrgPopoverOpen(false);
                            }}
                          >
                            <Check className={cn("mr-2 h-4 w-4", orgId === o.id ? "opacity-100" : "opacity-0")} />
                            {o.nome}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                      <div className="border-t p-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="w-full justify-start gap-2"
                          onClick={() => { setOrgPopoverOpen(false); setNovaOrgOpen(true); }}
                        >
                          <Plus className="w-4 h-4" /> Criar nova organização
                        </Button>
                      </div>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {form.formState.errors.organizacao_id && (
                <p className="text-xs text-destructive">{form.formState.errors.organizacao_id.message}</p>
              )}
            </div>

            {/* Pessoas envolvidas */}
            <div className="sm:col-span-2 space-y-1">
              <Label>Pessoas envolvidas</Label>
              <Popover open={pessoasPopoverOpen} onOpenChange={setPessoasPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" className="w-full justify-between font-normal" disabled={!orgId}>
                    {pessoasSel.length ? `${pessoasSel.length} selecionada(s)` : <span className="text-muted-foreground">Selecione pessoas…</span>}
                    <ChevronsUpDown className="w-4 h-4 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar pessoa..." />
                    <CommandList>
                      <CommandEmpty>Nenhuma encontrada</CommandEmpty>
                      <CommandGroup>
                        {pessoasOrg.map((p) => {
                          const checked = !!pessoasSel.find((x) => x.id === p.id);
                          return (
                            <CommandItem key={p.id} value={p.nome} onSelect={() => togglePessoa(p.id, p.nome)}>
                              <Check className={cn("mr-2 h-4 w-4", checked ? "opacity-100" : "opacity-0")} />
                              {p.nome}
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>

              {pessoasSel.length > 0 && (
                <div className="space-y-2 mt-2">
                  {pessoasSel.map((p) => (
                    <div key={p.id} className="flex items-center gap-2 rounded-md border p-2">
                      <Badge variant="secondary" className="shrink-0">{p.nome}</Badge>
                      <Select
                        value={p.papel}
                        onValueChange={(v) =>
                          setPessoasSel((curr) => curr.map((x) => (x.id === p.id ? { ...x, papel: v as Papel } : x)))
                        }
                      >
                        <SelectTrigger className="h-8 ml-auto w-44"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {PAPEIS.map((pp) => (
                            <SelectItem key={pp} value={pp} className="capitalize">{pp}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setPessoasSel((c) => c.filter((x) => x.id !== p.id))}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Valor */}
            <div className="space-y-1">
              <Label>Valor estimado</Label>
              <Input
                inputMode="numeric"
                value={valorRaw}
                placeholder="R$ 0,00"
                onChange={(e) => handleValorChange(e.target.value)}
              />
            </div>

            {/* Data */}
            <div className="space-y-1">
              <Label>Data prevista de fechamento</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" className={cn("w-full justify-start text-left font-normal", !form.watch("data_fechamento_prevista") && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {form.watch("data_fechamento_prevista")
                      ? format(form.watch("data_fechamento_prevista") as Date, "dd/MM/yyyy")
                      : "Selecione"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={form.watch("data_fechamento_prevista") ?? undefined}
                    onSelect={(d) => form.setValue("data_fechamento_prevista", d ?? null)}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Probabilidade */}
            <div className="sm:col-span-2 space-y-2">
              <div className="flex items-center justify-between">
                <Label>Probabilidade</Label>
                <span className="text-sm text-muted-foreground tabular-nums">{form.watch("probabilidade")}%</span>
              </div>
              <Slider
                min={0}
                max={100}
                step={1}
                value={[form.watch("probabilidade")]}
                onValueChange={(v) => form.setValue("probabilidade", v[0])}
              />
            </div>

            {/* Responsável */}
            <div className="sm:col-span-2 space-y-1">
              <Label>Responsável</Label>
              <Select
                value={form.watch("responsavel_id") || "none"}
                onValueChange={(v) => form.setValue("responsavel_id", v === "none" ? "" : v)}
              >
                <SelectTrigger><SelectValue placeholder="Sem responsável" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem responsável</SelectItem>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.nome ?? p.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Observações */}
            <div className="sm:col-span-2 space-y-1">
              <Label>Observações</Label>
              <Textarea rows={3} {...form.register("observacoes")} />
            </div>

            <DialogFooter className="sm:col-span-2 gap-2 mt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Criar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <OrganizacaoFormModal
        open={novaOrgOpen}
        onOpenChange={setNovaOrgOpen}
      />
    </>
  );
}
