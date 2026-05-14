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
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";

const schema = z.object({
  nome: z.string().trim().min(1, "Obrigatório"),
  cargo: z.string().optional().or(z.literal("")),
  email: z.string().email("E-mail inválido").optional().or(z.literal("")),
  telefone: z.string().optional().or(z.literal("")),
  e_decisor: z.boolean().default(false),
  observacoes: z.string().optional().or(z.literal("")),
});

type FormValues = z.infer<typeof schema>;

export interface ContatoRow {
  id: string;
  cliente_id: string;
  nome: string;
  cargo: string | null;
  email: string | null;
  telefone: string | null;
  e_decisor: boolean;
  observacoes: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clienteId: string;
  contato?: ContatoRow | null;
}

export default function ContatoFormModal({ open, onOpenChange, clienteId, contato }: Props) {
  const qc = useQueryClient();
  const isEdit = !!contato?.id;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { nome: "", cargo: "", email: "", telefone: "", e_decisor: false, observacoes: "" },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        nome: contato?.nome ?? "",
        cargo: contato?.cargo ?? "",
        email: contato?.email ?? "",
        telefone: contato?.telefone ?? "",
        e_decisor: contato?.e_decisor ?? false,
        observacoes: contato?.observacoes ?? "",
      });
    }
  }, [open, contato]);

  const mutation = useMutation({
    mutationFn: async (v: FormValues) => {
      const payload = {
        cliente_id: clienteId,
        nome: v.nome.trim(),
        cargo: v.cargo?.trim() || null,
        email: v.email?.trim() || null,
        telefone: v.telefone?.trim() || null,
        e_decisor: v.e_decisor,
        observacoes: v.observacoes?.trim() || null,
      };
      if (isEdit && contato) {
        const { error } = await (supabase as any).from("contatos").update(payload).eq("id", contato.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("contatos").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(isEdit ? "Contato atualizado" : "Contato criado");
      qc.invalidateQueries({ queryKey: ["contatos", clienteId] });
      onOpenChange(false);
    },
    onError: (err: any) => toast.error("Erro ao salvar", { description: err?.message }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Contato" : "Novo Contato"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2 space-y-1">
            <Label>Nome *</Label>
            <Input {...form.register("nome")} />
            {form.formState.errors.nome && <p className="text-xs text-destructive">{form.formState.errors.nome.message}</p>}
          </div>
          <div className="space-y-1">
            <Label>Cargo</Label>
            <Input {...form.register("cargo")} />
          </div>
          <div className="space-y-1">
            <Label>Telefone</Label>
            <Input {...form.register("telefone")} />
          </div>
          <div className="sm:col-span-2 space-y-1">
            <Label>E-mail</Label>
            <Input type="email" {...form.register("email")} />
            {form.formState.errors.email && <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>}
          </div>
          <div className="sm:col-span-2 flex items-center gap-2">
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
  );
}
