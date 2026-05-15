import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, FileText, Receipt, Wrench, Loader2, ExternalLink } from "lucide-react";

const fmtBRL = (v: number | null | undefined) =>
  (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface Props {
  oportunidadeId: string;
  organizacaoId: string | null;
  propostaVinculada: any;
  onDesvincular: () => void;
  onAbrirVincular: () => void;
}

export default function DealPropostasOrcamentos({
  oportunidadeId, organizacaoId, propostaVinculada, onDesvincular, onAbrirVincular,
}: Props) {
  const navigate = useNavigate();

  const { data: propostas = [], isLoading: l1 } = useQuery({
    queryKey: ["deal-propostas", oportunidadeId],
    queryFn: async () => {
      const { data } = await (supabase as any).from("propostas")
        .select("id, numero_proposta, nome_cliente, total_10_anos, status, created_at")
        .eq("oportunidade_id", oportunidadeId)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: orcamentos = [], isLoading: l2 } = useQuery({
    queryKey: ["deal-orcamentos", oportunidadeId],
    queryFn: async () => {
      const { data } = await (supabase as any).from("orcamentos")
        .select("id, numero_orcamento, nome_cliente, total, status, created_at")
        .eq("oportunidade_id", oportunidadeId)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: reformas = [], isLoading: l3 } = useQuery({
    queryKey: ["deal-reformas", oportunidadeId],
    queryFn: async () => {
      const { data } = await (supabase as any).from("orcamentos_reforma")
        .select("id, numero_orcamento, nome_cliente, total, status, created_at")
        .eq("oportunidade_id", oportunidadeId)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const orgQs = organizacaoId ? `&organizacao=${organizacaoId}` : "";

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" className="gap-1" onClick={() => navigate(`/?oportunidade=${oportunidadeId}${orgQs}&novo=1`)}>
            <Plus className="w-4 h-4" /> Criar Proposta SmartCycle
          </Button>
          <Button size="sm" variant="outline" className="gap-1" onClick={() => navigate(`/orcamento?oportunidade=${oportunidadeId}${orgQs}&novo=1`)}>
            <Plus className="w-4 h-4" /> Criar Orçamento
          </Button>
          <Button size="sm" variant="outline" className="gap-1" onClick={() => navigate(`/reforma?oportunidade=${oportunidadeId}${orgQs}&novo=1`)}>
            <Plus className="w-4 h-4" /> Criar Reforma
          </Button>
          <Button size="sm" variant="ghost" onClick={onAbrirVincular}>Vincular proposta existente</Button>
        </div>

        {propostaVinculada && (
          <div className="border rounded p-3 bg-emerald-50 border-emerald-200">
            <div className="text-xs font-medium text-emerald-700 mb-1">Proposta principal vinculada</div>
            <div className="font-medium">{propostaVinculada.numero_proposta || "Proposta"}</div>
            <div className="text-sm text-muted-foreground">{propostaVinculada.nome_cliente}</div>
            <div className="text-sm">{fmtBRL(propostaVinculada.total_10_anos)}</div>
            <Button variant="outline" size="sm" className="mt-2" onClick={onDesvincular}>Desvincular</Button>
          </div>
        )}

        <Section
          icon={<FileText className="w-4 h-4" />}
          titulo="Propostas SmartCycle vinculadas"
          isLoading={l1}
          rows={propostas}
          renderRow={(p: any) => (
            <Linha key={p.id} onClick={() => navigate(`/?load=${p.id}`)}
              num={p.numero_proposta} status={p.status} valor={p.total_10_anos} data={p.created_at} />
          )}
        />
        <Section
          icon={<Receipt className="w-4 h-4" />}
          titulo="Orçamentos de Venda"
          isLoading={l2}
          rows={orcamentos}
          renderRow={(o: any) => (
            <Linha key={o.id} onClick={() => navigate(`/orcamento?load=${o.id}`)}
              num={o.numero_orcamento} status={o.status} valor={o.total} data={o.created_at} />
          )}
        />
        <Section
          icon={<Wrench className="w-4 h-4" />}
          titulo="Orçamentos de Reforma"
          isLoading={l3}
          rows={reformas}
          renderRow={(o: any) => (
            <Linha key={o.id} onClick={() => navigate(`/reforma?load=${o.id}`)}
              num={o.numero_orcamento} status={o.status} valor={o.total} data={o.created_at} />
          )}
        />
      </CardContent>
    </Card>
  );
}

function Section({ icon, titulo, isLoading, rows, renderRow }: any) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-semibold">
        {icon}{titulo} ({rows.length})
      </div>
      {isLoading
        ? <Loader2 className="w-4 h-4 animate-spin" />
        : rows.length === 0
          ? <div className="text-sm text-muted-foreground">Nenhum registro.</div>
          : <div className="space-y-1">{rows.map(renderRow)}</div>}
    </div>
  );
}

function Linha({ num, status, valor, data, onClick }: any) {
  return (
    <button onClick={onClick} className="w-full flex items-center justify-between gap-2 p-2 border rounded hover:bg-muted text-left">
      <div className="min-w-0">
        <div className="font-medium text-sm truncate">{num || "—"}</div>
        <div className="text-xs text-muted-foreground">{new Date(data).toLocaleDateString("pt-BR")}</div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Badge variant="secondary" className="text-xs">{status}</Badge>
        <div className="text-sm font-medium">{fmtBRL(valor)}</div>
        <ExternalLink className="w-3 h-3 text-muted-foreground" />
      </div>
    </button>
  );
}
