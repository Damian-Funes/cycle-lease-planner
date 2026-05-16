import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { useBrasilApiCnpj } from "@/hooks/useBrasilApiCnpj";
import { formatCnpj, onlyDigits } from "@/lib/cnpj";
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
import { Loader2 } from "lucide-react";

const STATUS = ["lead", "prospect", "ativo", "inativo", "perdido"] as const;
const PORTE = ["pequeno", "medio", "grande"] as const;

const schema = z.object({
  nome: z.string().trim().min(1, "Obrigatório"),
  nome_fantasia: z.string().optional().or(z.literal("")),
  cnpj: z.string().optional().or(z.literal("")),
  segmento: z.string().optional().or(z.literal("")),
  porte: z.string().optional().or(z.literal("")),
  regiao: z.string().optional().or(z.literal("")),
  endereco: z.string().optional().or(z.literal("")),
  cidade: z.string().optional().or(z.literal("")),
  estado: z.string().optional().or(z.literal("")),
  estado_id: z.string().optional().or(z.literal("")),
  site: z.string().optional().or(z.literal("")),
  telefone_principal: z.string().optional().or(z.literal("")),
  email_principal: z.string().email("E-mail inválido").optional().or(z.literal("")),
  status: z.enum(STATUS),
  responsavel_id: z.string().optional().or(z.literal("")),
  tags: z.string().optional().or(z.literal("")),
  observacoes: z.string().optional().or(z.literal("")),
});

type FormValues = z.infer<typeof schema>;

export interface OrganizacaoRow {
  id: string;
  created_at: string;
  updated_at: string;
  nome: string;
  nome_fantasia: string | null;
  cnpj: string | null;
  segmento: string | null;
  porte: string | null;
  regiao: string | null;
  endereco: string | null;
  cidade: string | null;
  estado: string | null;
  site: string | null;
  telefone_principal: string | null;
  email_principal: string | null;
  status: typeof STATUS[number];
  responsavel_id: string | null;
  tags: string[] | null;
  observacoes: string | null;
  estado_id?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  organizacao?: OrganizacaoRow | null;
}

export default function OrganizacaoFormModal({ open, onOpenChange, organizacao }: Props) {
  const qc = useQueryClient();
  const isEdit = !!organizacao?.id;

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-lite"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, nome, email").eq("status", "approved");
      return (data ?? []) as { user_id: string; nome: string | null; email: string }[];
    },
  });

  const { data: estados = [] } = useQuery({
    queryKey: ["estados-lite"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("estados").select("id, sigla, nome").eq("ativo", true).order("sigla");
      return (data ?? []) as { id: string; sigla: string; nome: string }[];
    },
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { nome: "", status: "lead" } as any,
  });

  useEffect(() => {
    if (open) {
      form.reset({
        nome: organizacao?.nome ?? "",
        nome_fantasia: organizacao?.nome_fantasia ?? "",
        cnpj: formatCnpj(organizacao?.cnpj ?? ""),
        segmento: organizacao?.segmento ?? "",
        porte: organizacao?.porte ?? "",
        regiao: organizacao?.regiao ?? "",
        endereco: organizacao?.endereco ?? "",
        cidade: organizacao?.cidade ?? "",
        estado: organizacao?.estado ?? "",
        estado_id: organizacao?.estado_id ?? "",
        site: organizacao?.site ?? "",
        telefone_principal: organizacao?.telefone_principal ?? "",
        email_principal: organizacao?.email_principal ?? "",
        status: organizacao?.status ?? "lead",
        responsavel_id: organizacao?.responsavel_id ?? "",
        tags: (organizacao?.tags ?? []).join(", "),
        observacoes: organizacao?.observacoes ?? "",
      });
    }
  }, [open, organizacao]);

  // Autocomplete CNPJ via BrasilAPI
  const cnpjValue = form.watch("cnpj") || "";
  const { data: cnpjData, loading: cnpjLoading, status: cnpjStatus, situacao: cnpjSituacao } =
    useBrasilApiCnpj(cnpjValue);
  const lastAppliedCnpj = useRef<string>("");
  const lastToastedStatus = useRef<string>("");

  useEffect(() => {
    if (cnpjStatus === "not_found") {
      if (lastToastedStatus.current !== "not_found") {
        toast("CNPJ não encontrado, preencha manualmente");
        lastToastedStatus.current = "not_found";
      }
      return;
    }
    if (cnpjStatus === "network_error") {
      if (lastToastedStatus.current !== "network_error") {
        toast("Não foi possível buscar agora");
        lastToastedStatus.current = "network_error";
      }
      return;
    }
    if (cnpjStatus !== "success" || !cnpjData) {
      if (cnpjStatus === "idle" || cnpjStatus === "loading") {
        lastToastedStatus.current = "";
      }
      return;
    }

    const digits = onlyDigits(cnpjData.cnpj);
    if (lastAppliedCnpj.current === digits) return;
    lastAppliedCnpj.current = digits;

    const setIfEmpty = (field: keyof FormValues, value: string | null | undefined) => {
      const current = (form.getValues(field) as string | undefined)?.trim();
      if (!current && value) form.setValue(field, value as any, { shouldDirty: true });
    };

    setIfEmpty("nome", cnpjData.razao_social);
    setIfEmpty("nome_fantasia", cnpjData.nome_fantasia);

    const enderecoParts = [
      cnpjData.logradouro,
      cnpjData.numero,
      cnpjData.complemento,
      cnpjData.bairro,
    ]
      .map((p) => (p ?? "").toString().trim())
      .filter(Boolean);
    if (enderecoParts.length) setIfEmpty("endereco", enderecoParts.join(", "));

    setIfEmpty("cidade", cnpjData.municipio);
    setIfEmpty("telefone_principal", cnpjData.ddd_telefone_1);
    setIfEmpty("email_principal", cnpjData.email);

    if (cnpjData.uf) {
      const uf = cnpjData.uf.toUpperCase();
      const match = estados.find((e) => e.sigla.toUpperCase() === uf);
      if (match) {
        const currentEstadoId = (form.getValues("estado_id") as string | undefined)?.trim();
        if (!currentEstadoId) {
          form.setValue("estado_id", match.id, { shouldDirty: true });
          form.setValue("estado", match.sigla, { shouldDirty: true });
        }
      }
    }

    if (lastToastedStatus.current !== "success") {
      toast.success("Dados encontrados");
      if (cnpjSituacao && cnpjSituacao.toUpperCase() !== "ATIVA") {
        toast.warning(`⚠️ Situação cadastral: ${cnpjSituacao}`);
      }
      lastToastedStatus.current = "success";
    }
  }, [cnpjStatus, cnpjData, cnpjSituacao]);

  const onSubmit = (v: FormValues) => {
    const cnpjDigits = onlyDigits(v.cnpj);
    if (cnpjDigits && cnpjDigits.length !== 14) {
      form.setError("cnpj", { message: "CNPJ deve ter 14 dígitos" });
      return;
    }
    mutation.mutate(v);
  };

  const mutation = useMutation({
    mutationFn: async (v: FormValues) => {
      const payload: any = {
        nome: v.nome.trim(),
        nome_fantasia: v.nome_fantasia?.trim() || null,
        cnpj: onlyDigits(v.cnpj) || null,
        segmento: v.segmento?.trim() || null,
        porte: v.porte || null,
        regiao: v.regiao?.trim() || null,
        endereco: v.endereco?.trim() || null,
        cidade: v.cidade?.trim() || null,
        estado: v.estado?.trim() || (v.estado_id ? (estados.find(e => e.id === v.estado_id)?.sigla ?? null) : null),
        estado_id: v.estado_id || null,
        site: v.site?.trim() || null,
        telefone_principal: v.telefone_principal?.trim() || null,
        email_principal: v.email_principal?.trim() || null,
        status: v.status,
        responsavel_id: v.responsavel_id || null,
        tags: v.tags ? v.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
        observacoes: v.observacoes?.trim() || null,
      };
      if (isEdit && organizacao) {
        const { error } = await (supabase as any).from("organizacoes").update(payload).eq("id", organizacao.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("organizacoes").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(isEdit ? "Organização atualizada" : "Organização criada");
      qc.invalidateQueries({ queryKey: ["organizacoes"] });
      onOpenChange(false);
    },
    onError: (err: any) => toast.error("Erro ao salvar", { description: err?.message }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Organização" : "Nova Organização"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2 space-y-1">
            <Label>Nome *</Label>
            <Input {...form.register("nome")} />
            {form.formState.errors.nome && <p className="text-xs text-destructive">{form.formState.errors.nome.message}</p>}
          </div>
          <div className="space-y-1">
            <Label>Nome Fantasia</Label>
            <Input {...form.register("nome_fantasia")} />
          </div>
          <div className="space-y-1">
            <Label>CNPJ</Label>
            <div className="relative">
              <Input
                value={form.watch("cnpj") || ""}
                onChange={(e) => {
                  form.setValue("cnpj", formatCnpj(e.target.value));
                  if (form.formState.errors.cnpj) form.clearErrors("cnpj");
                }}
                placeholder="00.000.000/0000-00"
                maxLength={18}
                inputMode="numeric"
                className={cnpjLoading ? "pr-9" : ""}
              />
              {cnpjLoading && (
                <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
              )}
            </div>
            {form.formState.errors.cnpj && (
              <p className="text-xs text-destructive">{form.formState.errors.cnpj.message as string}</p>
            )}
          </div>
          <div className="space-y-1">
            <Label>Segmento</Label>
            <Input {...form.register("segmento")} />
          </div>
          <div className="space-y-1">
            <Label>Porte</Label>
            <Select value={form.watch("porte") || ""} onValueChange={(v) => form.setValue("porte", v)}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {PORTE.map((p) => <SelectItem key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Status *</Label>
            <Select value={form.watch("status")} onValueChange={(v) => form.setValue("status", v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS.map((s) => <SelectItem key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Responsável</Label>
            <Select value={form.watch("responsavel_id") || "none"} onValueChange={(v) => form.setValue("responsavel_id", v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhum</SelectItem>
                {profiles.map((p) => <SelectItem key={p.user_id} value={p.user_id}>{p.nome || p.email}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Região</Label>
            <Input {...form.register("regiao")} placeholder="MT, PR, RS..." />
          </div>
          <div className="sm:col-span-2 space-y-1">
            <Label>Endereço</Label>
            <Input {...form.register("endereco")} />
          </div>
          <div className="space-y-1">
            <Label>Cidade</Label>
            <Input {...form.register("cidade")} />
          </div>
          <div className="space-y-1">
            <Label>Estado</Label>
            <Select
              value={form.watch("estado_id") || "none"}
              onValueChange={(v) => {
                const id = v === "none" ? "" : v;
                form.setValue("estado_id", id);
                const sigla = estados.find((e) => e.id === id)?.sigla ?? "";
                form.setValue("estado", sigla);
              }}
            >
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {estados.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.sigla} — {e.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Site</Label>
            <Input {...form.register("site")} />
          </div>
          <div className="space-y-1">
            <Label>Telefone Principal</Label>
            <Input {...form.register("telefone_principal")} />
          </div>
          <div className="sm:col-span-2 space-y-1">
            <Label>E-mail Principal</Label>
            <Input type="email" {...form.register("email_principal")} />
            {form.formState.errors.email_principal && <p className="text-xs text-destructive">{form.formState.errors.email_principal.message}</p>}
          </div>
          <div className="sm:col-span-2 space-y-1">
            <Label>Tags (separadas por vírgula)</Label>
            <Input {...form.register("tags")} placeholder="vip, parceiro" />
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
