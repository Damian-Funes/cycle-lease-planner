import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { useBrasilApiCnpj } from "@/hooks/useBrasilApiCnpj";
import { formatCnpj, formatCpfCnpj, onlyDigits } from "@/lib/cnpj";
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
import { Loader2 } from "lucide-react";

const STATUS = ["lead", "prospect", "ativo", "inativo", "perdido"] as const;
const PORTE = ["pequeno", "medio", "grande"] as const;
const SEGMENTOS = ["COOPERATIVAS", "MULTINACIONAIS", "SEMENTEIRA PRIVADA", "PRODUTOR RURAL", "REVENDA"] as const;

const schema = z.object({
  nome: z.string().trim().min(1, "Obrigatório"),
  nome_fantasia: z.string().optional().or(z.literal("")),
  cnpj: z.string().optional().or(z.literal("")),
  segmento: z.enum(SEGMENTOS, { message: "Selecione o segmento da organização" }),
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
  contato_nome: z.string().optional().or(z.literal("")),
  contato_cargo: z.string().optional().or(z.literal("")),
  contato_email: z.string().email("E-mail inválido").optional().or(z.literal("")),
  contato_telefone: z.string().optional().or(z.literal("")),
  contato_celular: z.string().optional().or(z.literal("")),
  contato_decisor: z.boolean().optional(),
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
    defaultValues: { nome: "", status: "lead", segmento: "" as any } as any,
  });

  useEffect(() => {
    if (open) {
      form.reset({
        nome: organizacao?.nome ?? "",
        nome_fantasia: organizacao?.nome_fantasia ?? "",
        cnpj: formatCpfCnpj(organizacao?.cnpj ?? ""),
        segmento: (organizacao?.segmento ?? "") as any,
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
        contato_nome: "",
        contato_cargo: "",
        contato_email: "",
        contato_telefone: "",
        contato_celular: "",
        contato_decisor: false,
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
    // Se for CPF (11 dígitos), não buscamos em API — o comercial preenche manualmente
    const digitsNow = onlyDigits(cnpjValue);
    if (digitsNow.length === 11) {
      if (lastToastedStatus.current !== "cpf") {
        toast("CPF detectado — preencha os dados manualmente");
        lastToastedStatus.current = "cpf";
      }
      return;
    }
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
    if (!isEdit) {
      const nome = (v.contato_nome || "").trim();
      const email = (v.contato_email || "").trim();
      const tel = (v.contato_telefone || "").trim();
      const cel = (v.contato_celular || "").trim();
      if (!nome) {
        form.setError("contato_nome", { message: "Informe o contato principal" });
        return;
      }
      if (!email && !tel && !cel) {
        form.setError("contato_telefone", { message: "Informe e-mail, telefone ou celular" });
        return;
      }
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
        return;
      }
      const { data: orgIns, error } = await (supabase as any)
        .from("organizacoes")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;

      const orgId = orgIns.id as string;
      const pessoaPayload = {
        organizacao_id: orgId,
        nome: (v.contato_nome || "").trim(),
        cargo: v.contato_cargo?.trim() || null,
        email: v.contato_email?.trim() || null,
        telefone: v.contato_telefone?.trim() || null,
        celular: v.contato_celular?.trim() || null,
        e_decisor: !!v.contato_decisor,
        responsavel_id: v.responsavel_id || null,
      };
      const { error: pErr } = await (supabase as any).from("pessoas").insert(pessoaPayload);
      if (pErr) {
        await (supabase as any).from("organizacoes").delete().eq("id", orgId);
        throw new Error(`Falha ao salvar contato: ${pErr.message}`);
      }
    },
    onSuccess: () => {
      toast.success(isEdit ? "Organização atualizada" : "Organização e contato criados");
      qc.invalidateQueries({ queryKey: ["organizacoes"] });
      qc.invalidateQueries({ queryKey: ["pessoas"] });
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
            <Label>Segmento *</Label>
            <Select value={form.watch("segmento") || ""} onValueChange={(v) => form.setValue("segmento", v as any, { shouldValidate: true })}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {SEGMENTOS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            {form.formState.errors.segmento && <p className="text-xs text-destructive">{form.formState.errors.segmento.message}</p>}
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
          {!isEdit && (
            <div className="sm:col-span-2 border rounded-md p-3 space-y-3 bg-muted/30">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-sm">Contato principal *</h4>
                <span className="text-xs text-muted-foreground">Obrigatório ao criar</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Nome *</Label>
                  <Input {...form.register("contato_nome")} />
                  {form.formState.errors.contato_nome && <p className="text-xs text-destructive">{form.formState.errors.contato_nome.message as string}</p>}
                </div>
                <div className="space-y-1">
                  <Label>Cargo</Label>
                  <Input {...form.register("contato_cargo")} />
                </div>
                <div className="space-y-1">
                  <Label>E-mail</Label>
                  <Input type="email" {...form.register("contato_email")} />
                  {form.formState.errors.contato_email && <p className="text-xs text-destructive">{form.formState.errors.contato_email.message as string}</p>}
                </div>
                <div className="space-y-1">
                  <Label>Telefone</Label>
                  <Input {...form.register("contato_telefone")} />
                  {form.formState.errors.contato_telefone && <p className="text-xs text-destructive">{form.formState.errors.contato_telefone.message as string}</p>}
                </div>
                <div className="space-y-1">
                  <Label>Celular</Label>
                  <Input {...form.register("contato_celular")} />
                </div>
                <label className="flex items-center gap-2 text-sm cursor-pointer pt-6">
                  <Checkbox
                    checked={!!form.watch("contato_decisor")}
                    onCheckedChange={(c) => form.setValue("contato_decisor", !!c)}
                  />
                  <span>É decisor</span>
                </label>
              </div>
              <p className="text-xs text-muted-foreground">Informe ao menos e-mail, telefone ou celular.</p>
            </div>
          )}
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
