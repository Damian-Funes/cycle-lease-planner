import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Loader2, Check, ChevronsUpDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import OrganizacaoFormModal from "./OrganizacaoFormModal";

const schema = z.object({
  organizacao_id: z.string().uuid("Selecione uma organização"),
  titulo: z.string().trim().min(1, "Obrigatório"),
  etapa_id: z.string().uuid("Selecione uma etapa"),
  valor_estimado: z.string().optional().or(z.literal("")),
  probabilidade: z.coerce.number().min(0).max(100).default(50),
  data_fechamento_prevista: z.string().optional().or(z.literal("")),
  responsavel_id: z.string().optional().or(z.literal("")),
  observacoes: z.string().optional().or(z.literal("")),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  oportunidade?: any | null;
  defaultEtapaId?: string;
  defaultOrganizacaoId?: string;
}

export default function OportunidadeFormModal({ open, onOpenChange, oportunidade, defaultEtapaId, defaultOrganizacaoId }: Props) {
  const qc = useQueryClient();
  const isEdit = !!oportunidade?.id;
  const [orgOpen, setOrgOpen] = useState(false);
  const [novaOrgOpen, setNovaOrgOpen] = useState(false);

  const { data: organizacoes = [] } = useQuery({
    queryKey: ["organizacoes-combobox"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("organizacoes")
        .select("id, nome, nome_fantasia")
        .neq("status", "inativo")
        .order("nome");
      if (error) throw error;
      return data as { id: string; nome: string; nome_fantasia: string | null }[];
    },
  });

  const { data: etapas = [] } = useQuery({
    queryKey: ["etapas-pipeline"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("etapas_pipeline")
        .select("*")
        .order("ordem");
      if (error) throw error;
      return data;
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-approved"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, nome, email").eq("status", "approved");
      return data ?? [];
    },
  });

  const defaultEtapa = useMemo(() => {
    if (defaultEtapaId) return defaultEtapaId;
    return etapas.find((e: any) => e.ordem === 1)?.id ?? "";
  }, [etapas, defaultEtapaId]);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      organizacao_id: "",
      titulo: "",
      etapa_id: "",
      valor_estimado: "",
      probabilidade: 50,
      data_fechamento_prevista: "",
      responsavel_id: "",
      observacoes: "",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        organizacao_id: oportunidade?.organizacao_id ?? defaultOrganizacaoId ?? "",
        titulo: oportunidade?.titulo ?? "",
        etapa_id: oportunidade?.etapa_id ?? defaultEtapa,
        valor_estimado: oportunidade?.valor_estimado != null ? String(oportunidade.valor_estimado) : "",
        probabilidade: oportunidade?.probabilidade ?? 50,
        data_fechamento_prevista: oportunidade?.data_fechamento_prevista ?? "",
        responsavel_id: oportunidade?.responsavel_id ?? "",
        observacoes: oportunidade?.observacoes ?? "",
      });
    }
  }, [open, oportunidade, defaultEtapa, defaultOrganizacaoId]);

  const mutation = useMutation({
    mutationFn: async (v: FormValues) => {
      const payload: any = {
        organizacao_id: v.organizacao_id,
        titulo: v.titulo.trim(),
        etapa_id: v.etapa_id,
        valor_estimado: v.valor_estimado ? Number(v.valor_estimado) : null,
        probabilidade: v.probabilidade,
        data_fechamento_prevista: v.data_fechamento_prevista || null,
        responsavel_id: v.responsavel_id || null,
        observacoes: v.observacoes?.trim() || null,
      };
      if (isEdit) {
        const { error } = await (supabase as any).from("oportunidades").update(payload).eq("id", oportunidade.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("oportunidades").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(isEdit ? "Oportunidade atualizada" : "Oportunidade criada");
      qc.invalidateQueries({ queryKey: ["oportunidades"] });
      onOpenChange(false);
    },
    onError: (err: any) => toast.error("Erro ao salvar", { description: err?.message }),
  });

  const selectedOrg = organizacoes.find((o) => o.id === form.watch("organizacao_id"));

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEdit ? "Editar Oportunidade" : "Nova Oportunidade"}</DialogTitle>
          </DialogHeader>

          <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2 space-y-1">
              <Label>Organização *</Label>
              <Popover open={orgOpen} onOpenChange={setOrgOpen}>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" role="combobox" className="w-full justify-between font-normal">
                    {selectedOrg ? selectedOrg.nome : "Selecione uma organização..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar organização..." />
                    <CommandList>
                      <CommandEmpty>Nenhuma organização encontrada.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          onSelect={() => {
                            setOrgOpen(false);
                            setNovaOrgOpen(true);
                          }}
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Criar nova organização
                        </CommandItem>
                        {organizacoes.map((o) => (
                          <CommandItem
                            key={o.id}
                            value={`${o.nome} ${o.nome_fantasia ?? ""}`}
                            onSelect={() => {
                              form.setValue("organizacao_id", o.id, { shouldValidate: true });
                              setOrgOpen(false);
                            }}
                          >
                            <Check className={cn("mr-2 h-4 w-4", form.watch("organizacao_id") === o.id ? "opacity-100" : "opacity-0")} />
                            <span className="truncate">{o.nome}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {form.formState.errors.organizacao_id && (
                <p className="text-xs text-destructive">{form.formState.errors.organizacao_id.message}</p>
              )}
            </div>

            <div className="sm:col-span-2 space-y-1">
              <Label>Título *</Label>
              <Input {...form.register("titulo")} placeholder="Ex: SmartCycle Centro 200t/h" />
              {form.formState.errors.titulo && (
                <p className="text-xs text-destructive">{form.formState.errors.titulo.message}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label>Etapa *</Label>
              <Select value={form.watch("etapa_id")} onValueChange={(v) => form.setValue("etapa_id", v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {etapas.map((e: any) => (
                    <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Responsável</Label>
              <Select value={form.watch("responsavel_id") || "none"} onValueChange={(v) => form.setValue("responsavel_id", v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Sem responsável" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem responsável</SelectItem>
                  {profiles.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.nome ?? p.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Valor estimado (R$)</Label>
              <Input type="number" step="0.01" {...form.register("valor_estimado")} />
            </div>

            <div className="space-y-1">
              <Label>Probabilidade (%)</Label>
              <Input type="number" min={0} max={100} {...form.register("probabilidade")} />
            </div>

            <div className="sm:col-span-2 space-y-1">
              <Label>Data prevista de fechamento</Label>
              <Input type="date" {...form.register("data_fechamento_prevista")} />
            </div>

            <div className="sm:col-span-2 space-y-1">
              <Label>Observações</Label>
              <Textarea rows={3} {...form.register("observacoes")} />
            </div>

            <DialogFooter className="sm:col-span-2 gap-2 mt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {isEdit ? "Salvar" : "Criar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <OrganizacaoFormModal
        open={novaOrgOpen}
        onOpenChange={(v) => {
          setNovaOrgOpen(v);
          if (!v) qc.invalidateQueries({ queryKey: ["organizacoes-combobox"] });
        }}
      />
    </>
  );
}
