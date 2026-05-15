import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Phone, Calendar, Mail, FileText, MapPin, CheckSquare, Zap, Filter } from "lucide-react";

const TIPO_META: Record<string, { label: string; icon: any; color: string; border: string }> = {
  ligacao:            { label: "Ligação",   icon: Phone,       color: "text-blue-600 bg-blue-100",       border: "border-l-blue-500" },
  reuniao:            { label: "Reunião",   icon: Calendar,    color: "text-purple-600 bg-purple-100",   border: "border-l-purple-500" },
  email:              { label: "E-mail",    icon: Mail,        color: "text-cyan-600 bg-cyan-100",       border: "border-l-cyan-500" },
  nota:               { label: "Nota",      icon: FileText,    color: "text-gray-600 bg-gray-100",       border: "border-l-gray-400" },
  visita:             { label: "Visita",    icon: MapPin,      color: "text-rose-600 bg-rose-100",       border: "border-l-rose-500" },
  tarefa:             { label: "Tarefa",    icon: CheckSquare, color: "text-amber-600 bg-amber-100",     border: "border-l-amber-500" },
  evento_automatico:  { label: "Automático", icon: Zap,        color: "text-emerald-600 bg-emerald-100", border: "border-l-emerald-500" },
};

interface Atividade {
  id: string;
  tipo: keyof typeof TIPO_META;
  titulo: string;
  conteudo: string | null;
  data_atividade: string;
  responsavel_id: string | null;
  profiles?: { nome: string | null; email: string } | null;
}

function TimelineItem({ a }: { a: Atividade }) {
  const meta = TIPO_META[a.tipo] ?? TIPO_META.nota;
  const Icon = meta.icon;
  const [expanded, setExpanded] = useState(false);
  const long = (a.conteudo?.length ?? 0) > 140;
  const initials = (a.profiles?.nome ?? a.profiles?.email ?? "?").slice(0, 2).toUpperCase();

  return (
    <div className={`border-l-4 ${meta.border} bg-card border rounded-md p-3 flex gap-3`}>
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${meta.color}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="font-medium text-sm">{a.titulo}</div>
          <div className="text-xs text-muted-foreground shrink-0">
            {formatDistanceToNow(new Date(a.data_atividade), { addSuffix: true, locale: ptBR })}
          </div>
        </div>
        {a.conteudo && (
          <div className={`text-sm text-muted-foreground mt-1 ${expanded || !long ? "" : "line-clamp-2"}`}>
            {a.conteudo}
          </div>
        )}
        {long && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-xs text-primary hover:underline mt-1"
          >
            {expanded ? "ver menos" : "ver mais"}
          </button>
        )}
        {a.profiles && (
          <div className="flex items-center gap-2 mt-2">
            <Avatar className="w-5 h-5"><AvatarFallback className="text-[9px]">{initials}</AvatarFallback></Avatar>
            <span className="text-xs text-muted-foreground">{a.profiles.nome ?? a.profiles.email}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Timeline({ organizacaoId }: { organizacaoId: string }) {
  const qc = useQueryClient();
  const [tiposFiltro, setTiposFiltro] = useState<string[]>([]);

  const { data: atividades = [] } = useQuery({
    queryKey: ["atividades", organizacaoId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("atividades")
        .select("*, profiles(nome, email)")
        .eq("organizacao_id", organizacaoId)
        .order("data_atividade", { ascending: false });
      if (error) throw error;
      return data as Atividade[];
    },
    enabled: !!organizacaoId,
  });

  // Realtime: invalida ao mudar atividades, propostas ou oportunidades da organização
  useEffect(() => {
    if (!organizacaoId) return;
    const channel = supabase
      .channel(`org-${organizacaoId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "atividades", filter: `organizacao_id=eq.${organizacaoId}` },
        () => qc.invalidateQueries({ queryKey: ["atividades", organizacaoId] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "propostas", filter: `organizacao_id=eq.${organizacaoId}` },
        () => qc.invalidateQueries({ queryKey: ["atividades", organizacaoId] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "oportunidades", filter: `organizacao_id=eq.${organizacaoId}` },
        () => qc.invalidateQueries({ queryKey: ["atividades", organizacaoId] }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [organizacaoId, qc]);

  const filtered = useMemo(() => {
    if (tiposFiltro.length === 0) return atividades;
    return atividades.filter((a) => tiposFiltro.includes(a.tipo));
  }, [atividades, tiposFiltro]);

  const toggleTipo = (t: string) => {
    setTiposFiltro((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {filtered.length} atividade{filtered.length !== 1 ? "s" : ""}
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm">
              <Filter className="w-3 h-3 mr-1" />
              Filtrar tipo {tiposFiltro.length > 0 && `(${tiposFiltro.length})`}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56" align="end">
            <div className="space-y-2">
              {Object.entries(TIPO_META).map(([key, meta]) => (
                <div key={key} className="flex items-center gap-2">
                  <Checkbox
                    id={`tipo-${key}`}
                    checked={tiposFiltro.includes(key)}
                    onCheckedChange={() => toggleTipo(key)}
                  />
                  <Label htmlFor={`tipo-${key}`} className="text-sm font-normal cursor-pointer">
                    {meta.label}
                  </Label>
                </div>
              ))}
              {tiposFiltro.length > 0 && (
                <Button variant="ghost" size="sm" className="w-full mt-2" onClick={() => setTiposFiltro([])}>
                  Limpar
                </Button>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {filtered.length === 0 ? (
        <Card><CardContent className="p-12 text-center text-muted-foreground">
          Nenhuma atividade registrada ainda.
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((a) => <TimelineItem key={a.id} a={a} />)}
        </div>
      )}
    </div>
  );
}
