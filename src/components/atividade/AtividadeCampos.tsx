import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import * as Icons from "lucide-react";
import { Building2, Handshake, Search, User, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ATALHOS_DATA, AtalhoData, dataAtalho, toLocalInput, tituloAutomatico } from "@/lib/atividadeRapida";

export interface TipoAtividade { id: string; nome: string; icone: string | null; cor: string | null; }
export interface PessoaOpt { id: string; nome: string; organizacao_id?: string | null; }
export interface OrgOpt { id: string; nome: string; }
export interface DealOpt { id: string; titulo: string; organizacao_id: string | null; status?: string | null; }

export interface Vinculos { dealId: string; orgId: string; pesId: string; }

/** Carrega tipos ativos e as listas de vínculo (deals, organizações, pessoas). */
export function useAtividadeListas() {
  const [tipos, setTipos] = useState<TipoAtividade[]>([]);
  const [deals, setDeals] = useState<DealOpt[]>([]);
  const [orgs, setOrgs] = useState<OrgOpt[]>([]);
  const [pessoas, setPessoas] = useState<PessoaOpt[]>([]);
  useEffect(() => {
    (async () => {
      const [tps, ds, os, ps] = await Promise.all([
        (supabase as any).from("tipos_atividade").select("*").eq("ativo", true).order("ordem"),
        (supabase as any).from("oportunidades").select("id, titulo, organizacao_id, status").order("created_at", { ascending: false }).limit(500),
        (supabase as any).from("organizacoes").select("id, nome").order("nome").limit(1000),
        (supabase as any).from("pessoas").select("id, nome, organizacao_id").order("nome").limit(1000),
      ]);
      setTipos((tps.data as any) || []);
      setDeals((ds.data as any) || []);
      setOrgs((os.data as any) || []);
      setPessoas((ps.data as any) || []);
    })();
  }, []);
  return { tipos, deals, orgs, pessoas };
}

export const iconeTipo = (nome?: string | null): any =>
  (nome && (Icons as any)[nome]) || Icons.Sparkles;

export function TipoChips({ tipos, value, onChange }: { tipos: TipoAtividade[]; value: string; onChange: (id: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Tipo">
      {tipos.map((t) => {
        const Icon = iconeTipo(t.icone);
        const sel = t.id === value;
        const cor = t.cor || "#888";
        return (
          <button key={t.id} type="button" role="radio" aria-checked={sel} onClick={() => onChange(t.id)}
            className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 h-7 text-xs transition",
              sel ? "font-medium" : "bg-background hover:bg-accent text-muted-foreground")}
            style={sel ? { borderColor: cor, background: cor + "22", color: cor } : undefined}>
            <Icon className="h-3.5 w-3.5" style={{ color: cor }} />
            {t.nome}
          </button>
        );
      })}
    </div>
  );
}

export function DataComAtalhos({ value, onChange, ativo }: { value: string; onChange: (v: string) => void; ativo?: AtalhoData | null }) {
  const [sel, setSel] = useState<AtalhoData | null>(ativo ?? null);
  return (
    <div className="space-y-1.5 flex-1">
      <div className="flex flex-wrap gap-1">
        {ATALHOS_DATA.map((a) => (
          <button key={a.id} type="button"
            onClick={() => { setSel(a.id); onChange(toLocalInput(dataAtalho(a.id))); }}
            className={cn("rounded-md border px-2 h-6 text-xs transition",
              sel === a.id ? "border-primary bg-primary/10 text-primary font-medium" : "hover:bg-accent text-muted-foreground")}>
            {a.label}
          </button>
        ))}
      </div>
      <Input type="datetime-local" value={value} onChange={(e) => { setSel(null); onChange(e.target.value); }} />
    </div>
  );
}

export function VinculoPicker({ value, onChange, deals, orgs, pessoas }: {
  value: Vinculos; onChange: (v: Vinculos) => void;
  deals: DealOpt[]; orgs: OrgOpt[]; pessoas: PessoaOpt[];
}) {
  const [open, setOpen] = useState(false);
  const orgNome = (id?: string | null) => (id ? orgs.find((o) => o.id === id)?.nome || null : null);
  const deal = deals.find((d) => d.id === value.dealId);
  const org = orgs.find((o) => o.id === value.orgId);
  const pes = pessoas.find((p) => p.id === value.pesId);
  const orgLocked = Boolean(deal?.organizacao_id && deal.organizacao_id === value.orgId);

  const escolher = (tipo: "deal" | "org" | "pes", id: string) => {
    const v = { ...value };
    if (tipo === "deal") {
      v.dealId = id;
      const d = deals.find((x) => x.id === id);
      if (d?.organizacao_id) v.orgId = d.organizacao_id;
    } else if (tipo === "org") {
      v.orgId = id;
    } else {
      v.pesId = id;
      const p = pessoas.find((x) => x.id === id);
      if (p?.organizacao_id) v.orgId = p.organizacao_id;
    }
    onChange(v);
    setOpen(false);
  };

  const chip = (icon: any, label: string, onRemove?: () => void) => {
    const I = icon;
    return (
      <span className="inline-flex items-center gap-1 rounded-full border bg-muted/50 pl-2 pr-1 h-6 text-xs max-w-full">
        <I className="h-3 w-3 shrink-0 text-muted-foreground" />
        <span className="truncate">{label}</span>
        {onRemove && (
          <button type="button" onClick={onRemove} className="rounded-full p-0.5 hover:bg-background" aria-label={`Remover ${label}`}>
            <X className="h-3 w-3" />
          </button>
        )}
      </span>
    );
  };

  return (
    <div className="space-y-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" className="w-full justify-start font-normal h-9 text-muted-foreground">
            <Search className="h-4 w-4 mr-2 opacity-60" />Vincular a deal, organização ou pessoa
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder="Buscar..." />
            <CommandList className="max-h-72">
              <CommandEmpty>Nada encontrado.</CommandEmpty>
              <CommandGroup heading="Deals">
                {deals.map((d) => (
                  <CommandItem key={d.id} value={`deal ${d.titulo} ${orgNome(d.organizacao_id) || ""} ${d.id}`} onSelect={() => escolher("deal", d.id)}>
                    <Handshake className="mr-2 h-4 w-4 shrink-0" />
                    <div className="min-w-0"><div className="truncate">{d.titulo}</div>
                      {orgNome(d.organizacao_id) && <div className="text-xs text-muted-foreground truncate">{orgNome(d.organizacao_id)}</div>}</div>
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandGroup heading="Organizações">
                {orgs.map((o) => (
                  <CommandItem key={o.id} value={`org ${o.nome} ${o.id}`} onSelect={() => escolher("org", o.id)}>
                    <Building2 className="mr-2 h-4 w-4 shrink-0" /><span className="truncate">{o.nome}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandGroup heading="Pessoas">
                {pessoas.map((p) => (
                  <CommandItem key={p.id} value={`pessoa ${p.nome} ${orgNome(p.organizacao_id) || ""} ${p.id}`} onSelect={() => escolher("pes", p.id)}>
                    <User className="mr-2 h-4 w-4 shrink-0" />
                    <div className="min-w-0"><div className="truncate">{p.nome}</div>
                      {orgNome(p.organizacao_id) && <div className="text-xs text-muted-foreground truncate">{orgNome(p.organizacao_id)}</div>}</div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {(deal || org || pes) && (
        <div className="flex flex-wrap gap-1">
          {deal && chip(Handshake, deal.titulo, () => onChange({ ...value, dealId: "" }))}
          {org && chip(Building2, orgLocked ? `${org.nome} (do deal)` : org.nome, orgLocked ? undefined : () => onChange({ ...value, orgId: "" }))}
          {pes && chip(User, pes.nome, () => onChange({ ...value, pesId: "" }))}
        </div>
      )}
    </div>
  );
}

export function nomesVinculo(v: Vinculos, l: { deals: DealOpt[]; orgs: OrgOpt[]; pessoas: PessoaOpt[] }) {
  return {
    deal: l.deals.find((d) => d.id === v.dealId)?.titulo || null,
    org: l.orgs.find((o) => o.id === v.orgId)?.nome || null,
    pessoa: l.pessoas.find((p) => p.id === v.pesId)?.nome || null,
  };
}

/** Insere atividade com o mesmo payload do quick form e dispara sync Google quando aplicável. */
export async function inserirAtividade(opts: {
  tipo: TipoAtividade | undefined; titulo: string; descricao?: string; dataLocal: string; duracao: number;
  concluida: boolean; resultado?: string; vinculos: Vinculos; responsavelId: string | null | undefined;
  criarMeet: boolean; isConnected: boolean; deals: DealOpt[]; orgs: OrgOpt[]; pessoas: PessoaOpt[];
  syncAtividade: (id: string, a: "create") => Promise<any>;
}): Promise<string | null> {
  const { tipo, vinculos } = opts;
  let finalOrgId = vinculos.orgId || null;
  if (vinculos.dealId && !finalOrgId) {
    const d = opts.deals.find((x) => x.id === vinculos.dealId);
    if (d?.organizacao_id) finalOrgId = d.organizacao_id;
  }
  const titulo = opts.titulo.trim() || tituloAutomatico(tipo?.nome || "Atividade", nomesVinculo(vinculos, opts));
  const payload: any = {
    tipo_id: tipo?.id,
    titulo,
    descricao: opts.descricao?.trim() || null,
    data_inicio: new Date(opts.dataLocal).toISOString(),
    duracao_minutos: opts.duracao || 30,
    concluida: opts.concluida,
    data_conclusao: opts.concluida ? new Date().toISOString() : null,
    resultado: opts.concluida ? (opts.resultado?.trim() || null) : null,
    oportunidade_id: vinculos.dealId || null,
    organizacao_id: finalOrgId,
    pessoa_id: vinculos.pesId || null,
    responsavel_id: opts.responsavelId,
    tipo: tipo?.nome.toLowerCase() || "nota",
    data_atividade: new Date(opts.dataLocal).toISOString(),
    criar_meet: opts.criarMeet && opts.isConnected,
  };
  const { data: inserted, error } = await (supabase as any).from("atividades").insert(payload).select("id").single();
  if (error) { toast.error(error.message); return null; }
  if (inserted?.id && opts.isConnected && (opts.criarMeet || tipo?.nome.toLowerCase() === "reunião")) {
    opts.syncAtividade(inserted.id, "create").then((r: any) => {
      if (r?.google_meet_link) toast.success("Reunião criada no Google Meet");
      else if (r?.error) toast.error("Falha ao sincronizar Google", { description: r.error });
    });
  }
  return inserted?.id ?? null;
}
