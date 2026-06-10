import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ArrowLeft,
  AlertTriangle,
  MessageSquare,
  Mic,
  Camera,
  Users,
  Phone,
  FileText,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

const TIPO_ICON: Record<string, any> = {
  whatsapp_texto: MessageSquare,
  whatsapp_audio: Mic,
  whatsapp_foto: Camera,
  visita_presencial: Users,
  ligacao: Phone,
};

function fmtCNPJ(cnpj?: string | null) {
  if (!cnpj) return "—";
  const v = cnpj.replace(/\D/g, "");
  if (v.length !== 14) return cnpj;
  return v.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

function fmtPhone(p?: string | null) {
  if (!p) return "";
  return p.replace(/\D/g, "");
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm">{value ?? "—"}</div>
    </div>
  );
}

function TimelineItem({ i }: { i: any }) {
  const Icon = TIPO_ICON[i.tipo] ?? FileText;
  const [open, setOpen] = useState(false);
  const hasStruct =
    i.conteudo_estruturado &&
    typeof i.conteudo_estruturado === "object" &&
    Object.keys(i.conteudo_estruturado).length > 0;
  return (
    <div className="border-l-4 border-l-blue-400 bg-card border rounded-md p-3 flex gap-3">
      <div className="w-9 h-9 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs text-muted-foreground">
            {format(new Date(i.ocorrida_em), "dd/MM/yyyy HH:mm", { locale: ptBR })}
          </div>
          <Badge variant="outline" className="text-[10px]">
            {i.tipo}
          </Badge>
        </div>
        {i.conteudo_bruto && (
          <div className="text-sm mt-1 whitespace-pre-wrap">{i.conteudo_bruto}</div>
        )}
        {hasStruct && (
          <>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="text-xs text-primary hover:underline mt-2 flex items-center gap-1"
            >
              {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {open ? "ocultar" : "ver"} dados estruturados
            </button>
            {open && (
              <div className="mt-2 bg-slate-50 rounded p-2 space-y-1">
                {Object.entries(i.conteudo_estruturado as Record<string, any>).map(
                  ([k, v]) => (
                    <div key={k} className="text-xs">
                      <span className="font-medium text-slate-700">{k}:</span>{" "}
                      <span className="text-slate-600">
                        {typeof v === "object" ? JSON.stringify(v) : String(v)}
                      </span>
                    </div>
                  )
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function DossieDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: dossie, isLoading } = useQuery({
    queryKey: ["dossie", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("dossies_sementeiras")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: contatos = [] } = useQuery({
    queryKey: ["dossie-contatos", id],
    enabled: !!dossie?.id,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("dossie_contatos")
        .select("*")
        .eq("dossie_id", id)
        .order("decisor_nivel", { ascending: true });
      return data ?? [];
    },
  });

  const { data: equipamentos = [] } = useQuery({
    queryKey: ["dossie-equipamentos", id],
    enabled: !!dossie?.id,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("dossie_equipamentos")
        .select("*")
        .eq("dossie_id", id);
      return data ?? [];
    },
  });

  const { data: interacoes = [] } = useQuery({
    queryKey: ["dossie-interacoes", id],
    enabled: !!dossie?.id,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("dossie_interacoes")
        .select("*")
        .eq("dossie_id", id)
        .order("ocorrida_em", { ascending: false });
      return data ?? [];
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 p-8">
        <Skeleton className="h-8 w-64 mb-4" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!dossie) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Card className="p-8 text-center max-w-md">
          <div className="text-muted-foreground mb-4">
            Dossiê não encontrado ou sem permissão.
          </div>
          <Button onClick={() => navigate("/dossies")}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Voltar
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-slate-50">
        <header className="bg-white border-b">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={() => navigate("/dossies")}>
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <h1 className="text-lg font-semibold" style={{ color: "#1F4E8C" }}>
                {dossie.nome_fantasia ?? "Dossiê"}
              </h1>
            </div>
            <AppHeader />
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            <Card className="p-4">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div>
                  <div className="text-xl font-semibold" style={{ color: "#1F4E8C" }}>
                    {dossie.nome_fantasia ?? "—"}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {[dossie.cidade, dossie.estado].filter(Boolean).join(" / ") || "—"}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {dossie.status && <Badge variant="outline">{dossie.status}</Badge>}
                  {dossie.maturidade_lead && (
                    <Badge variant="outline" className="bg-blue-50 text-blue-700">
                      {dossie.maturidade_lead}
                    </Badge>
                  )}
                  {dossie.prioridade && (
                    <Badge variant="outline" className="bg-amber-50 text-amber-700">
                      {dossie.prioridade}
                    </Badge>
                  )}
                  {dossie.precisa_revisao && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge className="bg-amber-100 text-amber-800 border-amber-200 gap-1 cursor-help">
                          <AlertTriangle className="w-3 h-3" /> Precisa revisão
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        {dossie.motivo_revisao || "Sem motivo informado"}
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </div>
            </Card>

            <Card className="p-4 space-y-3">
              <div className="font-semibold" style={{ color: "#1F4E8C" }}>
                Dados cadastrais
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Razão social" value={dossie.razao_social ?? "—"} />
                <Field label="CNPJ" value={fmtCNPJ(dossie.cnpj)} />
                <Field
                  label="Culturas"
                  value={
                    Array.isArray(dossie.culturas) && dossie.culturas.length
                      ? dossie.culturas.join(", ")
                      : "—"
                  }
                />
                <Field
                  label="Volume anual (sacos)"
                  value={
                    dossie.volume_anual_sacos
                      ? new Intl.NumberFormat("pt-BR").format(dossie.volume_anual_sacos) +
                        (dossie.volume_eh_estimativa ? " (est.)" : "")
                      : "—"
                  }
                />
                <Field label="Faturamento" value={dossie.faturamento_bucket ?? "—"} />
                <Field label="Funcionários" value={dossie.numero_funcionarios_bucket ?? "—"} />
                <Field
                  label="Interesse SmartCycle"
                  value={
                    dossie.interesse_smartcycle === true
                      ? "Sim"
                      : dossie.interesse_smartcycle === false
                      ? "Não"
                      : "—"
                  }
                />
              </div>
              {dossie.observacoes && (
                <div>
                  <div className="text-xs text-muted-foreground">Observações</div>
                  <div className="text-sm whitespace-pre-wrap">{dossie.observacoes}</div>
                </div>
              )}
            </Card>

            <Card className="p-4 space-y-3">
              <div className="font-semibold" style={{ color: "#1F4E8C" }}>
                Contatos
              </div>
              {contatos.length === 0 ? (
                <div className="text-sm text-muted-foreground">Nenhum contato registrado.</div>
              ) : (
                <div className="space-y-2">
                  {contatos.map((c: any) => (
                    <div
                      key={c.id}
                      className="flex flex-wrap items-center justify-between gap-2 border rounded p-2"
                    >
                      <div>
                        <div className="text-sm font-medium">{c.nome ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{c.cargo ?? "—"}</div>
                      </div>
                      {c.telefone && (
                        <a
                          href={`https://wa.me/${fmtPhone(c.telefone)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm text-emerald-700 hover:underline"
                        >
                          {c.telefone}
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="p-4 space-y-3">
              <div className="font-semibold" style={{ color: "#1F4E8C" }}>
                Equipamentos
              </div>
              {equipamentos.length === 0 ? (
                <div className="text-sm text-muted-foreground">Nenhum equipamento mapeado.</div>
              ) : (
                <div className="space-y-2">
                  {equipamentos.map((e: any) => (
                    <div key={e.id} className="border rounded p-2 text-sm">
                      <div className="font-medium">
                        {[e.marca, e.modelo].filter(Boolean).join(" ") || "—"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {[
                          e.capacidade && `Capacidade: ${e.capacidade}`,
                          e.ano_aproximado && `Ano: ${e.ano_aproximado}`,
                          e.estado_conservacao && `Conservação: ${e.estado_conservacao}`,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <div className="space-y-3">
            <div className="font-semibold" style={{ color: "#1F4E8C" }}>
              Timeline de interações
            </div>
            {interacoes.length === 0 ? (
              <Card className="p-8 text-center text-muted-foreground text-sm">
                Nenhuma interação registrada.
              </Card>
            ) : (
              <div className="space-y-2">
                {interacoes.map((i: any) => (
                  <TimelineItem key={i.id} i={i} />
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </TooltipProvider>
  );
}
