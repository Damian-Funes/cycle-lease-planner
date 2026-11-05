import { Card } from "@/components/ui/card";
import { formatBRL } from "@/lib/smartcycle";
import type { CustoViagem } from "@/lib/viagem";

type Props = {
  custo: Pick<CustoViagem, "combustivel" | "pedagio" | "hospedagem" | "alimentacao" | "total"> & { litros?: number | null };
  avisoPedagio?: string | null;
  compacto?: boolean;
};

const v = (n: number | null | undefined, vazio = "—") => (n == null ? vazio : formatBRL(n));

export default function CustoViagemCard({ custo, avisoPedagio, compacto }: Props) {
  if (compacto) {
    return <p className="text-sm"><span className="font-semibold">Investimento: {formatBRL(custo.total)}</span>{avisoPedagio ? <span className="text-muted-foreground"> · {avisoPedagio}</span> : null}</p>;
  }
  return (
    <Card className="p-3 space-y-2" aria-label="Investimento desta viagem">
      <p className="font-semibold">Investimento desta viagem: {formatBRL(custo.total)}</p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Combustível{custo.litros != null ? ` (${Math.round(custo.litros)} L)` : ""}</dt><dd className="text-right">{v(custo.combustivel, "escolha o veículo")}</dd>
        <dt className="text-muted-foreground">Pedágio</dt><dd className="text-right">{v(custo.pedagio, "calculado ao enviar")}</dd>
        {custo.hospedagem ? <><dt className="text-muted-foreground">Hospedagem</dt><dd className="text-right">{v(custo.hospedagem)}</dd></> : null}
        <dt className="text-muted-foreground">Alimentação</dt><dd className="text-right">{v(custo.alimentacao, "não informada")}</dd>
      </dl>
      {!custo.hospedagem && <p className="text-xs text-muted-foreground">Hospedagem entra pelo gasto real (notas de hotel) durante a viagem.</p>}
      {avisoPedagio && <p className="text-xs text-muted-foreground">{avisoPedagio}</p>}
    </Card>
  );
}

/** Custo congelado no envio (lista, aprovação). */
export function custoSalvo(r: { custo_combustivel_est: number | null; custo_pedagio_est: number | null; custo_hospedagem_est: number | null; custo_alimentacao_est: number | null; custo_total_est: number | null }) {
  if (r.custo_total_est == null) return null;
  return {
    combustivel: r.custo_combustivel_est == null ? null : Number(r.custo_combustivel_est),
    pedagio: r.custo_pedagio_est == null ? null : Number(r.custo_pedagio_est),
    hospedagem: Number(r.custo_hospedagem_est ?? 0),
    alimentacao: r.custo_alimentacao_est == null ? null : Number(r.custo_alimentacao_est),
    total: Number(r.custo_total_est),
  };
}
