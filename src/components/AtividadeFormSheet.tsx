import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, Check, ChevronsUpDown, Loader2, Video } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useReadTables } from "@/lib/tables";
import { useGoogleIntegration } from "@/hooks/useGoogleIntegration";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

const TIPOS = [
  { value: "ligacao", label: "Ligação" },
  { value: "reuniao", label: "Reunião" },
  { value: "email", label: "E-mail" },
  { value: "nota", label: "Nota" },
  { value: "visita", label: "Visita" },
  { value: "tarefa", label: "Tarefa" },
] as const;

const schema = z.object({
  tipo: z.enum(["ligacao", "reuniao", "email", "nota", "visita", "tarefa"]),
  titulo: z.string().trim().min(1, "Obrigatório"),
  conteudo: z.string().optional().or(z.literal("")),
  data_atividade: z.date(),
  oportunidade_id: z.string().optional().or(z.literal("")),
  criar_meet: z.boolean().optional(),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  organizacaoId: string;
}

export default function AtividadeFormSheet({ open, onOpenChange, organizacaoId }: Props) {
  const qc = useQueryClient();
  const [opOpen, setOpOpen] = useState(false);
  const { isConnected, syncAtividade } = useGoogleIntegration();
  const tables = useReadTables();

  const { data: oportunidades = [] } = useQuery({
    queryKey: ["oportunidades-org", organizacaoId, tables.oportunidades],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from(tables.oportunidades)
        .select("id, titulo")
        .eq("organizacao_id", organizacaoId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as { id: string; titulo: string }[];
    },
    enabled: !!organizacaoId && open,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { tipo: "nota", titulo: "", conteudo: "", data_atividade: new Date(), oportunidade_id: "", criar_meet: false },
  });

  useEffect(() => {
    if (open) {
      form.reset({ tipo: "nota", titulo: "", conteudo: "", data_atividade: new Date(), oportunidade_id: "", criar_meet: false });
    }
  }, [open]);

  const mutation = useMutation({
    mutationFn: async (v: FormValues) => {
      const { data: { user } } = await supabase.auth.getUser();
      const responsavel_id: string | null = user?.id ?? null;
      const payload: any = {
        organizacao_id: organizacaoId,
        oportunidade_id: v.oportunidade_id || null,
        tipo: v.tipo,
        titulo: v.titulo.trim(),
        conteudo: v.conteudo?.trim() || null,
        data_atividade: v.data_atividade.toISOString(),
        data_inicio: v.data_atividade.toISOString(),
        responsavel_id,
        concluida: true,
        criar_meet: !!v.criar_meet && isConnected,
      };
      const { data: inserted, error } = await (supabase as any)
        .from("atividades").insert(payload).select("id").single();
      if (error) throw error;

      if (inserted?.id && isConnected && (v.criar_meet || v.tipo === "reuniao")) {
        const r: any = await syncAtividade(inserted.id, "create");
        if (r?.google_meet_link) toast.success("Reunião criada no Google Meet");
        else if (r?.error) toast.error("Falha ao sincronizar Google", { description: r.error });
      }
    },
    onSuccess: () => {
      toast.success("Atividade registrada");
      qc.invalidateQueries({ queryKey: ["atividades", organizacaoId] });
      onOpenChange(false);
    },
    onError: (err: any) => toast.error("Erro", { description: err?.message }),
  });

  const selectedOp = oportunidades.find((o) => o.id === form.watch("oportunidade_id"));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Registrar Atividade</SheetTitle>
        </SheetHeader>

        <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4 mt-4">
          <div className="space-y-1">
            <Label>Tipo *</Label>
            <Select
              value={form.watch("tipo")}
              onValueChange={(v) => form.setValue("tipo", v as any, { shouldDirty: true })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIPOS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Título *</Label>
            <Input {...form.register("titulo")} placeholder="Ex: Ligação de follow-up" />
            {form.formState.errors.titulo && (
              <p className="text-xs text-destructive">{form.formState.errors.titulo.message}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label>Conteúdo</Label>
            <Textarea rows={4} {...form.register("conteudo")} placeholder="Detalhes, anotações..." />
          </div>

          <div className="space-y-1">
            <Label>Data</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className={cn("w-full justify-start text-left font-normal", !form.watch("data_atividade") && "text-muted-foreground")}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {form.watch("data_atividade")
                    ? format(form.watch("data_atividade"), "PPP 'às' HH:mm", { locale: ptBR })
                    : "Selecionar"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={form.watch("data_atividade")}
                  onSelect={(d) => d && form.setValue("data_atividade", d)}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-1">
            <Label>Vincular a oportunidade (opcional)</Label>
            <Popover open={opOpen} onOpenChange={setOpOpen}>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" role="combobox" className="w-full justify-between font-normal">
                  {selectedOp ? selectedOp.titulo : "Nenhuma"}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Buscar..." />
                  <CommandList>
                    <CommandEmpty>Nenhuma oportunidade.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem onSelect={() => { form.setValue("oportunidade_id", ""); setOpOpen(false); }}>
                        <Check className={cn("mr-2 h-4 w-4", !form.watch("oportunidade_id") ? "opacity-100" : "opacity-0")} />
                        Nenhuma
                      </CommandItem>
                      {oportunidades.map((o) => (
                        <CommandItem
                          key={o.id}
                          value={o.titulo}
                          onSelect={() => { form.setValue("oportunidade_id", o.id); setOpOpen(false); }}
                        >
                          <Check className={cn("mr-2 h-4 w-4", form.watch("oportunidade_id") === o.id ? "opacity-100" : "opacity-0")} />
                          <span className="truncate">{o.titulo}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {isConnected && (
            <div className="flex items-center gap-2 pt-2">
              <Switch
                id="criar-meet-sheet"
                checked={!!form.watch("criar_meet")}
                onCheckedChange={(v) => {
                  form.setValue("criar_meet", v);
                  if (v && form.getValues("tipo") !== "reuniao") {
                    form.setValue("tipo", "reuniao");
                    toast.info("Tipo alterado para Reunião automaticamente", { duration: 2000 });
                  }
                }}
              />
              <Label htmlFor="criar-meet-sheet" className="text-sm cursor-pointer flex items-center gap-1">
                <Video className="h-3.5 w-3.5 text-primary" /> Criar reunião Google Meet
              </Label>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
