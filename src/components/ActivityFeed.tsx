import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Plus, Check, Pencil, Trash2, Loader2, Sparkles } from "lucide-react";
import * as Icons from "lucide-react";
import { formatDistanceToNow, isToday, isYesterday, startOfWeek, startOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import NovaAtividadeQuickForm from "./NovaAtividadeQuickForm";

type EntityType = "oportunidade" | "organizacao" | "pessoa";

interface Props {
  entityType: EntityType;
  entityId: string;
}

interface Atividade {
  id: string;
  titulo: string;
  descricao: string | null;
  data_inicio: string;
  concluida: boolean;
  evento_automatico: boolean;
  resultado: string | null;
  responsavel_id: string | null;
  tipo_id: string | null;
  oportunidade_id: string | null;
  organizacao_id: string | null;
  pessoa_id: string | null;
}

interface Tipo { id: string; nome: string; icone: string | null; cor: string | null; }
interface Profile { user_id: string; nome: string | null; email: string; }
interface Pessoa { id: string; nome: string; }

const groupKey = (d: Date): string => {
  const now = new Date();
  if (isToday(d)) return "Hoje";
  if (isYesterday(d)) return "Ontem";
  if (d >= startOfWeek(now, { weekStartsOn: 1 })) return "Esta semana";
  if (d >= startOfMonth(now)) return "Este mês";
  if (d >= subMonths(startOfMonth(now), 1)) return "Mês passado";
  return "Mais antigo";
};

const ORDER = ["Hoje", "Ontem", "Esta semana", "Este mês", "Mês passado", "Mais antigo"];

export default function ActivityFeed({ entityType, entityId }: Props) {
  const [loading, setLoading] = useState(true);
  const [atividades, setAtividades] = useState<Atividade[]>([]);
  const [tipos, setTipos] = useState<Record<string, Tipo>>({});
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editTitulo, setEditTitulo] = useState("");

  const carregar = async () => {
    setLoading(true);

    // Tipos & profiles
    const [{ data: tps }, { data: prs }] = await Promise.all([
      (supabase as any).from("tipos_atividade").select("*"),
      supabase.from("profiles").select("user_id, nome, email"),
    ]);
    const tMap: Record<string, Tipo> = {};
    (tps || []).forEach((t: Tipo) => { tMap[t.id] = t; });
    setTipos(tMap);
    const pMap: Record<string, Profile> = {};
    (prs || []).forEach((p: any) => { pMap[p.user_id] = p; });
    setProfiles(pMap);

    let query = (supabase as any).from("atividades").select("*").order("data_inicio", { ascending: false });

    if (entityType === "oportunidade") {
      query = query.eq("oportunidade_id", entityId);
      // pessoas vinculadas
      const { data: vincs } = await (supabase as any).from("oportunidade_pessoas").select("pessoa_id").eq("oportunidade_id", entityId);
      const ids = (vincs || []).map((v: any) => v.pessoa_id);
      if (ids.length) {
        const { data: ps } = await supabase.from("pessoas").select("id, nome").in("id", ids);
        setPessoas((ps as any) || []);
      }
    } else if (entityType === "organizacao") {
      const { data: opps } = await supabase.from("oportunidades").select("id").eq("organizacao_id", entityId);
      const { data: ps } = await supabase.from("pessoas").select("id, nome").eq("organizacao_id", entityId);
      const oppIds = (opps || []).map((o: any) => o.id);
      const pessoaIds = (ps || []).map((p: any) => p.id);
      setPessoas((ps as any) || []);
      const conds = [`organizacao_id.eq.${entityId}`];
      if (oppIds.length) conds.push(`oportunidade_id.in.(${oppIds.join(",")})`);
      if (pessoaIds.length) conds.push(`pessoa_id.in.(${pessoaIds.join(",")})`);
      query = query.or(conds.join(","));
    } else if (entityType === "pessoa") {
      query = query.eq("pessoa_id", entityId);
    }

    const { data, error } = await query.limit(500);
    if (error) toast.error(error.message);
    setAtividades((data as any) || []);
    setLoading(false);
  };

  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [entityType, entityId]);

  const grupos = useMemo(() => {
    const g: Record<string, Atividade[]> = {};
    atividades.forEach(a => {
      const k = groupKey(new Date(a.data_inicio));
      (g[k] ||= []).push(a);
    });
    return ORDER.filter(k => g[k]?.length).map(k => [k, g[k]] as const);
  }, [atividades]);

  const concluir = async (a: Atividade) => {
    const { error } = await (supabase as any).from("atividades").update({
      concluida: !a.concluida,
      data_conclusao: !a.concluida ? new Date().toISOString() : null,
    }).eq("id", a.id);
    if (error) return toast.error(error.message);
    carregar();
  };

  const excluir = async (id: string) => {
    if (!confirm("Excluir atividade?")) return;
    const { error } = await (supabase as any).from("atividades").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Excluída");
    carregar();
  };

  const salvarEdit = async (id: string) => {
    const { error } = await (supabase as any).from("atividades").update({ titulo: editTitulo }).eq("id", id);
    if (error) return toast.error(error.message);
    setEditing(null);
    carregar();
  };

  const iniciais = (s?: string | null) => (s || "?").split(" ").map(x => x[0]).slice(0, 2).join("").toUpperCase();

  const renderItem = (a: Atividade) => {
    const tipo = a.tipo_id ? tipos[a.tipo_id] : null;
    const prof = a.responsavel_id ? profiles[a.responsavel_id] : null;
    const IconComp: any = tipo?.icone && (Icons as any)[tipo.icone] ? (Icons as any)[tipo.icone] : Sparkles;
    const auto = a.evento_automatico;

    if (auto) {
      return (
        <div key={a.id} className="flex items-center gap-2 px-3 py-2 bg-muted/40 rounded text-xs text-muted-foreground border-l-2 border-muted">
          <IconComp className="h-3 w-3" />
          <span className="font-medium">{a.titulo}</span>
          {a.descricao && <span>· {a.descricao}</span>}
          <span className="ml-auto">{formatDistanceToNow(new Date(a.data_inicio), { locale: ptBR, addSuffix: true })}</span>
        </div>
      );
    }

    return (
      <div key={a.id} className="flex gap-3 p-3 border rounded-lg bg-card hover:bg-accent/30 transition">
        <div className="flex flex-col items-center gap-1">
          <Avatar className="h-8 w-8"><AvatarFallback className="text-xs">{iniciais(prof?.nome || prof?.email)}</AvatarFallback></Avatar>
          <div className="rounded-full p-1.5" style={{ background: (tipo?.cor || "#888") + "22", color: tipo?.cor || "#666" }}>
            <IconComp className="h-3.5 w-3.5" />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {editing === a.id ? (
              <input
                className="flex-1 border rounded px-2 py-1 text-sm"
                value={editTitulo}
                onChange={e => setEditTitulo(e.target.value)}
                onBlur={() => salvarEdit(a.id)}
                onKeyDown={e => { if (e.key === "Enter") salvarEdit(a.id); if (e.key === "Escape") setEditing(null); }}
                autoFocus
              />
            ) : (
              <span className={`font-medium text-sm ${a.concluida ? "line-through text-muted-foreground" : ""}`}>{a.titulo}</span>
            )}
            <span className="text-xs text-muted-foreground ml-auto whitespace-nowrap">
              {formatDistanceToNow(new Date(a.data_inicio), { locale: ptBR, addSuffix: true })}
            </span>
          </div>
          {a.descricao && <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{a.descricao}</p>}
          {a.resultado && <p className="text-xs italic text-muted-foreground mt-0.5">→ {a.resultado}</p>}
          <div className="flex gap-1 mt-1.5">
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => concluir(a)}>
              <Check className="h-3 w-3 mr-1" />{a.concluida ? "Reabrir" : "Concluir"}
            </Button>
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => { setEditing(a.id); setEditTitulo(a.titulo); }}>
              <Pencil className="h-3 w-3 mr-1" />Editar
            </Button>
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-destructive" onClick={() => excluir(a.id)}>
              <Trash2 className="h-3 w-3 mr-1" />Excluir
            </Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Atividades ({atividades.length})</h3>
        <Button size="sm" onClick={() => setShowForm(s => !s)}>
          <Plus className="h-4 w-4 mr-1" />Nova
        </Button>
      </div>

      {showForm && (
        <NovaAtividadeQuickForm
          oportunidadeId={entityType === "oportunidade" ? entityId : undefined}
          organizacaoId={entityType === "organizacao" ? entityId : undefined}
          pessoaId={entityType === "pessoa" ? entityId : undefined}
          pessoasDisponiveis={pessoas}
          onSaved={carregar}
          onClose={() => setShowForm(false)}
        />
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : atividades.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Nenhuma atividade ainda</Card>
      ) : (
        <div className="space-y-4">
          {grupos.map(([label, items]) => (
            <div key={label} className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</h4>
              <div className="space-y-2">{items.map(renderItem)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
