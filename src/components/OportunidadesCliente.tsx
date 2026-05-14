import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Calendar } from "lucide-react";
import OportunidadeFormModal from "./OportunidadeFormModal";
import OportunidadeSheet from "./OportunidadeSheet";

const fmtBRL = (v: number | null | undefined) =>
  v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

interface Etapa { id: string; nome: string; ordem: number; cor: string | null; e_final: boolean; e_ganho: boolean; }
interface Op {
  id: string; titulo: string; etapa_id: string;
  valor_estimado: number | null; probabilidade: number;
  data_fechamento_prevista: string | null; motivo_perda: string | null;
}

function MiniPipeline({ etapas, currentId }: { etapas: Etapa[]; currentId: string }) {
  const currentIdx = etapas.findIndex((e) => e.id === currentId);
  return (
    <div className="flex items-center gap-1">
      {etapas.map((e, i) => {
        const reached = i <= currentIdx;
        const isCurrent = e.id === currentId;
        return (
          <div
            key={e.id}
            title={e.nome}
            className={`h-2 flex-1 rounded-full transition-all ${isCurrent ? "ring-2 ring-offset-1 ring-primary/40" : ""}`}
            style={{ backgroundColor: reached ? (e.cor ?? "#94a3b8") : "hsl(var(--muted))" }}
          />
        );
      })}
    </div>
  );
}

export default function OportunidadesCliente({ clienteId }: { clienteId: string }) {
  const [novaOpen, setNovaOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const { data: etapas = [] } = useQuery({
    queryKey: ["etapas-pipeline"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("etapas_pipeline").select("*").order("ordem");
      return (data ?? []) as Etapa[];
    },
  });

  const { data: ops = [] } = useQuery({
    queryKey: ["oportunidades", "cliente", clienteId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("oportunidades")
        .select("*")
        .eq("cliente_id", clienteId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Op[];
    },
    enabled: !!clienteId,
  });

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <div className="text-sm text-muted-foreground">{ops.length} oportunidade{ops.length !== 1 ? "s" : ""}</div>
        <Button size="sm" onClick={() => setNovaOpen(true)}>
          <Plus className="w-4 h-4 mr-1" /> Nova Oportunidade
        </Button>
      </div>

      {ops.length === 0 ? (
        <Card><CardContent className="p-12 text-center text-muted-foreground">
          Nenhuma oportunidade vinculada.
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {ops.map((op) => {
            const etapa = etapas.find((e) => e.id === op.etapa_id);
            return (
              <Card
                key={op.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => { setActiveId(op.id); setSheetOpen(true); }}
              >
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold">{op.titulo}</div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                        <span className="font-medium text-foreground">{fmtBRL(op.valor_estimado ? Number(op.valor_estimado) : null)}</span>
                        <span>{op.probabilidade}%</span>
                        {op.data_fechamento_prevista && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(op.data_fechamento_prevista).toLocaleDateString("pt-BR")}
                          </span>
                        )}
                      </div>
                    </div>
                    {etapa && (
                      <Badge
                        variant="secondary"
                        style={{
                          backgroundColor: (etapa.cor ?? "#94a3b8") + "20",
                          color: etapa.cor ?? undefined,
                        }}
                      >
                        {etapa.nome}
                      </Badge>
                    )}
                  </div>

                  {etapas.length > 0 && (
                    <MiniPipeline etapas={etapas} currentId={op.etapa_id} />
                  )}

                  {op.motivo_perda && (
                    <div className="text-xs text-destructive">
                      <strong>Motivo da perda:</strong> {op.motivo_perda}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <OportunidadeFormModal open={novaOpen} onOpenChange={setNovaOpen} />
      <OportunidadeSheet open={sheetOpen} onOpenChange={setSheetOpen} oportunidadeId={activeId} />
    </div>
  );
}
