import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";

const schema = z.object({
  razao_social: z.string().trim().min(1, "Obrigatório"),
  nome_fantasia: z.string().trim().optional().or(z.literal("")),
  cnpj: z.string().trim().optional().or(z.literal("")),
  segmento: z.string().trim().optional().or(z.literal("")),
  porte: z.string().optional().or(z.literal("")),
  regiao: z.string().trim().optional().or(z.literal("")),
  status: z.enum(["lead", "prospect", "ativo", "inativo"]),
  tags: z.string().optional().or(z.literal("")),
  observacoes: z.string().optional().or(z.literal("")),
});

export type ClienteFormValues = z.infer<typeof schema>;

export interface ClienteRow {
  id: string;
  razao_social: string;
  nome_fantasia: string | null;
  cnpj: string | null;
  segmento: string | null;
  porte: string | null;
  regiao: string | null;
  status: "lead" | "prospect" | "ativo" | "inativo";
  tags: string[] | null;
  observacoes: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  cliente?: ClienteRow | null;
  onSaved?: (cliente: ClienteRow) => void;
}

export default function ClienteFormModal({ open, onOpenChange, cliente, onSaved }: Props) {
  const qc = useQueryClient();
  const isEdit = !!cliente?.id;

  const form = useForm<ClienteFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      razao_social: "",
      nome_fantasia: "",
      cnpj: "",
      segmento: "",
      porte: "",
      regiao: "",
      status: "lead",
      tags: "",
      observacoes: "",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        razao_social: cliente?.razao_social ?? "",
        nome_fantasia: cliente?.nome_fantasia ?? "",
        cnpj: cliente?.cnpj ?? "",
        segmento: cliente?.segmento ?? "",
        porte: cliente?.porte ?? "",
        regiao: cliente?.regiao ?? "",
        status: cliente?.status ?? "lead",
        tags: (cliente?.tags ?? []).join(", "),
        observacoes: cliente?.observacoes ?? "",
      });
    }
  }, [open, cliente]);

  const mutation = useMutation({
    mutationFn: async (values: ClienteFormValues) => {
      const payload = {
        razao_social: values.razao_social.trim(),
        nome_fantasia: values.nome_fantasia?.trim() || null,
        cnpj: values.cnpj?.trim() || null,
        segmento: values.segmento?.trim() || null,
        porte: values.porte || null,
        regiao: values.regiao?.trim() || null,
        status: values.status,
        tags: values.tags
          ? values.tags.split(",").map((t) => t.trim()).filter(Boolean)
          : [],
        observacoes: values.observacoes?.trim() || null,
      };
      if (isEdit && cliente) {
        const { data, error } = await supabase
          .from("clientes")
          .update(payload)
          .eq("id", cliente.id)
          .select()
          .single();
        if (error) throw error;
        return data as ClienteRow;
      } else {
        const { data, error } = await supabase
          .from("clientes")
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        return data as ClienteRow;
      }
    },
    onSuccess: (data) => {
      toast.success(isEdit ? "Cliente atualizado" : "Cliente criado");
      qc.invalidateQueries({ queryKey: ["clientes"] });
      onOpenChange(false);
      onSaved?.(data);
    },
    onError: (err: any) => {
      toast.error("Erro ao salvar", { description: err?.message });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Cliente" : "Novo Cliente"}</DialogTitle>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
          className="grid grid-cols-1 sm:grid-cols-2 gap-3"
        >
          <div className="sm:col-span-2 space-y-1">
            <Label>Razão Social *</Label>
            <Input {...form.register("razao_social")} />
            {form.formState.errors.razao_social && (
              <p className="text-xs text-destructive">{form.formState.errors.razao_social.message}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label>Nome Fantasia</Label>
            <Input {...form.register("nome_fantasia")} />
          </div>

          <div className="space-y-1">
            <Label>CNPJ</Label>
            <Input {...form.register("cnpj")} placeholder="00.000.000/0000-00" />
          </div>

          <div className="space-y-1">
            <Label>Segmento</Label>
            <Input {...form.register("segmento")} placeholder="Sementeira, cooperativa..." />
          </div>

          <div className="space-y-1">
            <Label>Porte</Label>
            <Select
              value={form.watch("porte") || ""}
              onValueChange={(v) => form.setValue("porte", v)}
            >
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pequeno">Pequeno</SelectItem>
                <SelectItem value="medio">Médio</SelectItem>
                <SelectItem value="grande">Grande</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Região / Estado</Label>
            <Input {...form.register("regiao")} placeholder="MT, PR, RS..." />
          </div>

          <div className="space-y-1">
            <Label>Status *</Label>
            <Select
              value={form.watch("status")}
              onValueChange={(v) => form.setValue("status", v as any)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="lead">Lead</SelectItem>
                <SelectItem value="prospect">Prospect</SelectItem>
                <SelectItem value="ativo">Ativo</SelectItem>
                <SelectItem value="inativo">Inativo</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="sm:col-span-2 space-y-1">
            <Label>Tags (separadas por vírgula)</Label>
            <Input {...form.register("tags")} placeholder="vip, nordeste, parceiro" />
          </div>

          <div className="sm:col-span-2 space-y-1">
            <Label>Observações</Label>
            <Textarea rows={3} {...form.register("observacoes")} />
          </div>

          <DialogFooter className="sm:col-span-2 gap-2 mt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {isEdit ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
