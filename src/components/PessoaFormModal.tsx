import { useEffect, useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Loader2, Check, ChevronsUpDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import OrganizacaoFormModal from "./OrganizacaoFormModal";

const schema = z.object({
  nome: z.string().trim().min(1, "Obrigatório"),
  organizacao_id: z.string().optional().or(z.literal("")),
  cargo: z.string().optional().or(z.literal("")),
  email: z.string().email("E-mail inválido").optional().or(z.literal("")),
  telefone: z.string().optional().or(z.literal("")),
  celular: z.string().optional().or(z.literal("")),
  linkedin: z.string().optional().or(z.literal("")),
  e_decisor: z.boolean().default(false),
  responsavel_id: z.string().optional().or(z.literal("")),
  observacoes: z.string().optional().or(z.literal("")),
});

type FormValues = z.infer<typeof schema>;

export interface PessoaRow {
  id: string;
  created_at: string;
  updated_at: string;
  nome: string;
  organizacao_id: string | null;
  cargo: string | null;
  email: string | null;
  telefone: string | null;
  celular: string | null;
  linkedin: string | null;
  e_decisor: boolean;
  responsavel_id: string | null;
  observacoes: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pessoa?: PessoaRow | null;
  defaultOrganizacaoId?: string;
}

export default function PessoaFormModal({ open, onOpenChange, pessoa, defaultOrganizacaoId }: Props) {
  const qc = useQueryClient();
  const isEdit = !!pessoa?.id;
  const [orgPopoverOpen, setOrgPopoverOpen] = useState(false);
  const [novaOrgOpen, setNovaOrgOpen] = useState(false);

  const { data: orgs = [] } = useQuery({
    queryKey: ["organizacoes"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("organizacoes").select("id, nome").order("nome");
      return (data ?? []) as { id: string; nome: string }[];
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-lite"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, nome, email");
      return (data ?? []) as { id: string; nome: string | null; email: string }[];
    },
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { nome: "", e_decisor: false } as any,
  });

  useEffect(() => {
    if (open) {
      form.reset({
        nome: pessoa?.nome ?? "",
        organizacao_id: pessoa?.organizacao_id ?? defaultOrganizacaoId ?? "",
        cargo: pessoa?.cargo ?? "",
        email: pessoa?.email ?? "",
        telefone: pessoa?.telefone ?? "",
        celular: pessoa?.celular ?? "",
        linkedin: pessoa?.linkedin ?? "",
        e_decisor: pessoa?.e_decisor ?? false,
        responsavel_id: pessoa?.responsavel_id ?? "",
        observacoes: pessoa?.observacoes ?? "",
      });
    }
  }, [open, pessoa, defaultOrganizacaoId]);

  const mutation = useMutation({
    mutationFn: async (v: FormValues) => {
      const payload: any = {
        nome: v.nome.trim(),
        organizacao_id: v.organizacao_id || null,
        cargo: v.cargo?.trim() || null,
        email: v.email?.trim() || null,
        telefone: v.telefone?.trim() || null,
        celular: v.celular?.trim() || null,
        linkedin: v.linkedin?.trim() || null,
        e_decisor: v.e_decisor,
        responsavel_id: v.responsavel_id || null,
        observacoes: v.observacoes?.trim() || null,
      };
      if (isEdit && pessoa) {
        const { error } = await (supabase as any).from("pessoas").update(payload).eq("id", pessoa.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("pessoas").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(isEdit ? "Pessoa atualizada" : "Pessoa criada");
      qc.invalidateQueries({ queryKey: ["pessoas"] });
      onOpenChange(false);
    },
    onError: (err: any) => toast.error("Erro ao salvar", { description: err?.message }),
  });

  const orgId = form.watch("organizacao_id");
  const orgSelected = orgs.find((o) => o.id === orgId);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEdit ? "Editar Pessoa" : "Nova Pessoa"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2 space-y-1">
              <Label>Nome *</Label>
              <Input {...form.register("nome")} />
              {form.formState.errors.nome && <p className="text-xs text-destructive">{form.formState.errors.nome.message}</p>}
            </div>

            <div className="sm:col-span-2 space-y-1">
              <Label>Organização</Label>
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
                        <CommandItem
                          value="__none__"
                          onSelect={() => { form.setValue("organizacao_id", ""); setOrgPopoverOpen(false); }}
                        >
                          <Check className={cn("mr-2 h-4 w-4", !orgId ? "opacity-100" : "opacity-0")} />
                          <span className="text-muted-foreground">Nenhuma</span>
                        </CommandItem>
                        {orgs.map((o) => (
                          <CommandItem
                            key={o.id}
                            value={o.nome}
                            onSelect={() => { form.setValue("organizacao_id", o.id); setOrgPopoverOpen(false); }}
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
            </div>

            <div className="space-y-1">
              <Label>Cargo</Label>
              <Input {...form.register("cargo")} />
            </div>
            <div className="space-y-1">
              <Label>E-mail</Label>
              <Input type="email" {...form.register("email")} />
              {form.formState.errors.email && <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>}
            </div>
            <div className="space-y-1">
              <Label>Telefone</Label>
              <Input {...form.register("telefone")} />
            </div>
            <div className="space-y-1">
              <Label>Celular</Label>
              <Input {...form.register("celular")} />
            </div>
            <div className="sm:col-span-2 space-y-1">
              <Label>LinkedIn</Label>
              <Input {...form.register("linkedin")} placeholder="https://linkedin.com/in/..." />
            </div>
            <div className="space-y-1">
              <Label>Responsável</Label>
              <Select value={form.watch("responsavel_id") || "none"} onValueChange={(v) => form.setValue("responsavel_id", v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome || p.email}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <Checkbox
                id="e_decisor"
                checked={form.watch("e_decisor")}
                onCheckedChange={(v) => form.setValue("e_decisor", !!v)}
              />
              <Label htmlFor="e_decisor" className="cursor-pointer">É decisor</Label>
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

      <OrganizacaoFormModal open={novaOrgOpen} onOpenChange={setNovaOrgOpen} />
    </>
  );
}
