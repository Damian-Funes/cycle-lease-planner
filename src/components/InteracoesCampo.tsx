import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mic, MessageSquare, Camera } from "lucide-react";

interface InteracaoDossie {
  interacao_id: string;
  organizacao_id: string;
  nome_fantasia: string | null;
  tipo: string;
  conteudo_bruto: string | null;
  conteudo_estruturado: string | null;
  criada_em: string;
  maturidade_lead: string | null;
}

const TIPO_META: Record<string, { label: string; icon: typeof Mic; badge: string }> = {
  whatsapp_audio: { label: "Áudio", icon: Mic, badge: "bg-rose-100 text-rose-700" },
  whatsapp_texto: { label: "Texto", icon: MessageSquare, badge: "bg-blue-100 text-blue-700" },
  whatsapp_foto: { label: "Imagem", icon: Camera, badge: "bg-amber-100 text-amber-700" },
};

function formatarData(data?: string | null) {
  if (!data) return "—";
  return new Date(data).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface InteracoesCampoProps {
  organizacaoId: string;
}

export default function InteracoesCampo({ organizacaoId }: InteracoesCampoProps) {
  const { data: interacoes = [], isLoading } = useQuery({
    queryKey: ["interacoes-campo", organizacaoId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_organizacao_dossie")
        .select("*")
        .eq("organizacao_id", organizacaoId)
        .order("criada_em", { ascending: false });
      if (error) throw error;
      return (data ?? []) as InteracaoDossie[];
    },
    enabled: !!organizacaoId,
  });

  if (isLoading) {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">
        Carregando interações de campo…
      </Card>
    );
  }

  if (interacoes.length === 0) {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">
        Nenhuma interação de campo registrada ainda.
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Interações de campo</span>
        <Badge variant="secondary" className="text-xs font-normal">
          via WhatsApp
        </Badge>
        <span className="text-xs text-muted-foreground ml-auto">
          {interacoes.length} registrada{interacoes.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="space-y-3">
        {interacoes.map((it) => {
          const meta = TIPO_META[it.tipo] || {
            label: it.tipo?.replace("whatsapp_", "") || "Interação",
            icon: MessageSquare,
            badge: "bg-gray-100 text-gray-700",
          };
          const Icon = meta.icon;

          return (
            <Card key={it.interacao_id} className="p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-md flex items-center justify-center ${meta.badge}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-medium capitalize">{meta.label}</span>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  {formatarData(it.criada_em)}
                </span>
              </div>
              {it.conteudo_bruto ? (
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                  {it.conteudo_bruto}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground italic">Sem conteúdo transcrito.</p>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
