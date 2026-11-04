import { useQuery } from "@tanstack/react-query";
import { listGastos } from "@/lib/viagemDados";
import { custoSalvo } from "@/components/rotas/CustoViagemCard";
import ComparativoCard from "./ComparativoCard";
import type { Rota } from "@/lib/rotas";

export default function ComparativoRota({ rota }: { rota: Rota }) {
  const { data: gastos = [] } = useQuery({ queryKey: ["rota-gastos", rota.id], queryFn: () => listGastos(rota.id) });
  return <ComparativoCard estimado={custoSalvo(rota)} gastos={gastos} />;
}
