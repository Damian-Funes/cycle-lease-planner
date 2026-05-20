import { useEffect, useMemo, useState, KeyboardEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronDown, ChevronUp, ChevronsUpDown, Loader2, Video, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useGoogleIntegration } from "@/hooks/useGoogleIntegration";

interface TipoAtividade { id: string; nome: string; icone: string | null; cor: string | null; }
interface Pessoa { id: string; nome: string; organizacao_id?: string | null; }
interface Org { id: string; nome: string; }
interface Deal { id: string; titulo: string; organizacao_id: string | null; }

interface Props {
  oportunidadeId?: string;
  organizacaoId?: string;
  pessoaId?: string;
  /** @deprecated mantido para compatibilidade */
  pessoasDisponiveis?: Pessoa[];
  onSaved?: () => void;
  onClose?: () => void;
}

function VincCombo({
  label, value, onChange, options, getLabel, getSub, disabled, placeholder = "— Nenhum —",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ id: string } & Record<string, any>>;
  getLabel: (o: any) => string;
  getSub?: (o: any) => string | null;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const sel = options.find((o) => o.id === value);
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Popover open={open} onOpenChange={(v) => !disabled && setOpen(v)}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" role="combobox" disabled={disabled}
            className="w-full justify-between font-normal h-9">
            <span className="truncate text-left">
              {sel ? getLabel(sel) : <span className="text-muted-foreground">{placeholder}</span>}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder="Buscar..." />
            <CommandList>
              <CommandEmpty>Nada encontrado.</CommandEmpty>
              <CommandGroup>
                <CommandItem onSelect={() => { onChange(""); setOpen(false); }}>
                  <Check className={cn("mr-2 h-4 w-4", !value ? "opacity-100" : "opacity-0")} />
                  — Nenhum —
                </CommandItem>
                {options.map((o) => (
                  <CommandItem key={o.id} value={getLabel(o)}
                    onSelect={() => { onChange(o.id); setOpen(false); }}>
                    <Check className={cn("mr-2 h-4 w-4", value === o.id ? "opacity-100" : "opacity-0")} />
                    <div className="min-w-0">
                      <div className="truncate">{getLabel(o)}</div>
                      {getSub?.(o) && <div className="text-xs text-muted-foreground truncate">{getSub(o)}</div>}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export default function NovaAtividadeQuickForm({
  oportunidadeId, organizacaoId, pessoaId, onSaved, onClose,
}: Props) {
  const [tipos, setTipos] = useState<TipoAtividade[]>([]);
  const [tipoId, setTipoId] = useState<string>("");
  const [titulo, setTitulo] = useState("");
  const [data, setData] = useState(() => {
    const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  });
  const [duracao, setDuracao] = useState("30");
  const [duracaoCustom, setDuracaoCustom] = useState("");
  const [descricao, setDescricao] = useState("");
  const [concluida, setConcluida] = useState(false);
  const [resultado, setResultado] = useState("");
  const [expanded, setExpanded] = useState(Boolean(oportunidadeId || organizacaoId || pessoaId));
  const [saving, setSaving] = useState(false);
  const [criarMeet, setCriarMeet] = useState(false);

  // Vínculos
  const [dealId, setDealId] = useState<string>(oportunidadeId || "");
  const [orgId, setOrgId] = useState<string>(organizacaoId || "");
  const [pesId, setPesId] = useState<string>(pessoaId || "");

  // Listas
  const [deals, setDeals] = useState<Deal[]>([]);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);

  const { isConnected, syncAtividade } = useGoogleIntegration();

  useEffect(() => {
    (async () => {
      const [tps, ds, os, ps] = await Promise.all([
        (supabase as any).from("tipos_atividade").select("*").eq("ativo", true).order("ordem"),
        (supabase as any).from("oportunidades").select("id, titulo, organizacao_id").order("created_at", { ascending: false }).limit(500),
        (supabase as any).from("organizacoes").select("id, nome").order("nome").limit(1000),
        (supabase as any).from("pessoas").select("id, nome, organizacao_id").order("nome").limit(1000),
      ]);
      const arr = (tps.data as any) || [];
      setTipos(arr);
      if (arr.length && !tipoId) setTipoId(arr[0].id);
      setDeals((ds.data as any) || []);
      setOrgs((os.data as any) || []);
      setPessoas((ps.data as any) || []);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Smart: deal selecionado → preenche org automaticamente
  useEffect(() => {
    if (!dealId) return;
    const d = deals.find((x) => x.id === dealId);
    if (d?.organizacao_id) setOrgId(d.organizacao_id);
  }, [dealId, deals]);

  // Filtro de pessoas pela organização (quando há org mas sem deal forçando)
  const pessoasFiltradas = useMemo(() => {
    if (orgId) return pessoas.filter((p) => p.organizacao_id === orgId);
    return pessoas;
  }, [pessoas, orgId]);

  const orgDoDealLocked = Boolean(dealId && deals.find((d) => d.id === dealId)?.organizacao_id);

  const handleTipoChange = (v: string) => setTipoId(v);

  const handleCriarMeetChange = (v: boolean) => {
    setCriarMeet(v);
    if (v) {
      const reuniao = tipos.find((t) => {
        const n = t.nome.toLowerCase();
        return n === "reunião" || n === "reuniao";
      });
      if (reuniao && tipoId !== reuniao.id) {
        setTipoId(reuniao.id);
        toast.info("Tipo alterado para Reunião automaticamente", { duration: 2000 });
      }
    }
  };

  const reset = () => {
    setTitulo(""); setDescricao(""); setResultado(""); setConcluida(false);
    setDuracao("30"); setDuracaoCustom(""); setCriarMeet(false);
    setDealId(oportunidadeId || ""); setOrgId(organizacaoId || ""); setPesId(pessoaId || "");
  };

  const salvar = async () => {
    if (!titulo.trim()) { toast.error("Informe o título"); return; }
    if (!tipoId) { toast.error("Selecione o tipo"); return; }
    setSaving(true);
    const { data: auth } = await supabase.auth.getUser();
    const dur = duracao === "custom" ? parseInt(duracaoCustom || "0", 10) : parseInt(duracao, 10);

    // Se tem deal e não tem org, herda do deal
    let finalOrgId = orgId || null;
    if (dealId && !finalOrgId) {
      const d = deals.find((x) => x.id === dealId);
      if (d?.organizacao_id) finalOrgId = d.organizacao_id;
    }

    const payload: any = {
      tipo_id: tipoId,
      titulo: titulo.trim(),
      descricao: descricao.trim() || null,
      data_inicio: new Date(data).toISOString(),
      duracao_minutos: dur || 30,
      concluida,
      data_conclusao: concluida ? new Date().toISOString() : null,
      resultado: concluida ? (resultado.trim() || null) : null,
      oportunidade_id: dealId || null,
      organizacao_id: finalOrgId,
      pessoa_id: pesId || null,
      responsavel_id: auth.user?.id,
      tipo: tipos.find(t => t.id === tipoId)?.nome.toLowerCase() || "nota",
      data_atividade: new Date(data).toISOString(),
      criar_meet: criarMeet && isConnected,
    };
    const { data: inserted, error } = await (supabase as any)
      .from("atividades").insert(payload).select("id").single();
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Atividade criada");

    if (inserted?.id && isConnected && (criarMeet || tipos.find(t => t.id === tipoId)?.nome.toLowerCase() === "reunião")) {
      syncAtividade(inserted.id, "create").then((r: any) => {
        if (r?.google_meet_link) toast.success("Reunião criada no Google Meet");
        else if (r?.error) toast.error("Falha ao sincronizar Google", { description: r.error });
      });
    }

    reset();
    onSaved?.();
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); salvar(); }
    if (e.key === "Escape") { e.preventDefault(); onClose?.(); }
  };

  return (
    <div className="border rounded-lg bg-card p-3 space-y-2" onKeyDown={onKey}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Nova atividade</span>
        {onClose && <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onClose}><X className="h-4 w-4" /></Button>}
      </div>

      <div className="flex gap-2">
        <Select value={tipoId} onValueChange={handleTipoChange}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            {tipos.map(t => (
              <SelectItem key={t.id} value={t.id}>
                <span className="inline-flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: t.cor || "#888" }} />
                  {t.nome}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input placeholder="Título" value={titulo} onChange={e => setTitulo(e.target.value)} autoFocus />
      </div>

      <div className="flex gap-2">
        <Input type="datetime-local" value={data} onChange={e => setData(e.target.value)} className="flex-1" />
        <Select value={duracao} onValueChange={setDuracao}>
          <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="15">15 min</SelectItem>
            <SelectItem value="30">30 min</SelectItem>
            <SelectItem value="60">1 hora</SelectItem>
            <SelectItem value="90">1h30</SelectItem>
            <SelectItem value="custom">Custom</SelectItem>
          </SelectContent>
        </Select>
        {duracao === "custom" && (
          <Input type="number" placeholder="min" value={duracaoCustom} onChange={e => setDuracaoCustom(e.target.value)} className="w-20" />
        )}
      </div>

      <Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)} className="text-xs h-7">
        {expanded ? <ChevronUp className="h-3 w-3 mr-1" /> : <ChevronDown className="h-3 w-3 mr-1" />}
        Mais opções
      </Button>

      {expanded && (
        <div className="space-y-2 pt-1 border-t">
          <Textarea placeholder="Descrição" rows={2} value={descricao} onChange={e => setDescricao(e.target.value)} />

          <div className="flex items-center gap-2 pt-1">
            <Switch id="concluida" checked={concluida} onCheckedChange={setConcluida} />
            <Label htmlFor="concluida" className="text-sm cursor-pointer">Já concluída?</Label>
          </div>
          {concluida && (
            <Textarea placeholder="Resultado" rows={2} value={resultado} onChange={e => setResultado(e.target.value)} />
          )}

          <div className="grid grid-cols-1 gap-2 pt-1">
            <VincCombo
              label="Vincular a deal (opcional)"
              value={dealId}
              onChange={(v) => { setDealId(v); if (!v) { /* mantém org/pessoa */ } }}
              options={deals}
              getLabel={(o: Deal) => o.titulo}
              getSub={(o: Deal) => {
                const org = orgs.find((x) => x.id === o.organizacao_id);
                return org?.nome || null;
              }}
            />
            <VincCombo
              label={orgDoDealLocked ? "Organização (do deal)" : "Vincular a organização (opcional)"}
              value={orgId}
              onChange={setOrgId}
              options={orgs}
              getLabel={(o: Org) => o.nome}
              disabled={orgDoDealLocked}
            />
            <VincCombo
              label="Vincular a pessoa (opcional)"
              value={pesId}
              onChange={setPesId}
              options={pessoasFiltradas}
              getLabel={(o: Pessoa) => o.nome}
              getSub={(o: Pessoa) => {
                const org = orgs.find((x) => x.id === o.organizacao_id);
                return org?.nome || null;
              }}
            />
          </div>
        </div>
      )}

      {isConnected && (
        <div className="flex items-center gap-2 pt-1">
          <Switch id="criar-meet" checked={criarMeet} onCheckedChange={handleCriarMeetChange} />
          <Label htmlFor="criar-meet" className="text-sm cursor-pointer flex items-center gap-1">
            <Video className="h-3.5 w-3.5 text-primary" /> Criar reunião Google Meet
          </Label>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <span className="text-xs text-muted-foreground self-center">Ctrl+Enter para salvar · Esc fecha</span>
        <Button size="sm" onClick={salvar} disabled={saving}>
          {saving && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}Salvar
        </Button>
      </div>
    </div>
  );
}
