import { useLayoutEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

// Nome do mês no topo do celular: começa grande e por extenso; se faltar espaço,
// encolhe a fonte e, ainda sem espaço, abrevia ("novembro" -> "nov").
export default function RotuloMes({ mes }: { mes: Date }) {
  const ano = mes.getFullYear() !== new Date().getFullYear() ? ` ${mes.getFullYear()}` : "";
  const completo = format(mes, "MMMM", { locale: ptBR }) + ano;
  const curto = format(mes, "MMM", { locale: ptBR }) + ano;
  const [nivel, setNivel] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);

  // Mês novo: tenta de novo o nome grande por extenso.
  useLayoutEffect(() => { setNivel(0); }, [completo]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || nivel === 2) return;
    if (el.scrollWidth > el.clientWidth + 1) setNivel((n) => (n === 0 ? 1 : 2));
  });

  return (
    <span ref={ref} className={cn("min-w-0 truncate", nivel === 0 ? "text-lg" : "text-sm")}>
      {nivel === 2 ? curto : completo}
    </span>
  );
}
