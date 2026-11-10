import { useEffect, useMemo, useRef, useState } from "react";
import { addMonths, format, isSameDay, isSameMonth, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Check, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import { gradeMes } from "@/lib/calendarioMes";

interface Tipo { id: string; nome: string; cor: string | null; }
interface Ativ { id: string; titulo: string; data_inicio: string; concluida: boolean; tipo_id: string | null; }

interface Props<A extends Ativ> {
  mes: Date;
  onMes: (d: Date) => void;
  atividades: A[];
  tipos: Tipo[];
  onSelectAtividade: (a: A) => void;
  onConcluirRapido: (a: A) => void;
  onNovaNoDia: (d: Date) => void;
}

const SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];
const MAX = 3;

export default function CalendarioMesMobile<A extends Ativ>({ mes, onMes, atividades, tipos, onSelectAtividade, onConcluirRapido, onNovaNoDia }: Props<A>) {
  const hoje = new Date();
  const agora = hoje.getTime();
  const dias = useMemo(() => gradeMes(mes), [mes]);
  const [diaAberto, setDiaAberto] = useState<Date | null>(null);
  const corDe = (id: string | null) => tipos.find((t) => t.id === id)?.cor || "#64748b";
  const atrasada = (a: A) => !a.concluida && new Date(a.data_inicio).getTime() < agora;

  const porDia = useMemo(() => {
    const m: Record<string, A[]> = {};
    atividades.forEach((a) => { const k = format(new Date(a.data_inicio), "yyyy-MM-dd"); (m[k] ||= []).push(a); });
    Object.values(m).forEach((l) => l.sort((x, y) => x.data_inicio.localeCompare(y.data_inicio)));
    return m;
  }, [atividades]);

  // Faixa de meses (12 antes a 12 depois do mês atual), rolada até o mês selecionado.
  const meses = useMemo(() => Array.from({ length: 25 }, (_, i) => addMonths(startOfMonth(hoje), i - 12)), []); // eslint-disable-line react-hooks/exhaustive-deps
  const faixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    faixa.current?.querySelector<HTMLElement>("[data-sel=true]")?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [mes]);

  // Deslize horizontal claro troca de mês.
  const toque = useRef<{ x: number; y: number } | null>(null);
  const fimToque = (e: React.TouchEvent) => {
    const t = toque.current; toque.current = null;
    if (!t) return;
    const dx = e.changedTouches[0].clientX - t.x, dy = e.changedTouches[0].clientY - t.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) onMes(addMonths(mes, dx < 0 ? 1 : -1));
  };

  const pilula = (a: A) => {
    const atr = atrasada(a); const cor = corDe(a.tipo_id);
    return (
      <button key={a.id} type="button"
        onClick={(e) => { e.stopPropagation(); onSelectAtividade(a); }}
        className={cn("block w-full truncate rounded-[3px] px-1 text-left text-[10px] font-semibold leading-[18px] min-h-[18px]",
          atr ? "bg-destructive text-destructive-foreground" : "text-foreground",
          a.concluida && "opacity-45 line-through")}
        style={atr ? undefined : { background: `${cor}40`, borderLeft: `3px solid ${cor}` }}>
        {a.titulo}
      </button>
    );
  };

  const listaDia = diaAberto ? porDia[format(diaAberto, "yyyy-MM-dd")] || [] : [];

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <div ref={faixa} className="flex gap-1.5 overflow-x-auto px-3 py-2 [scrollbar-width:none]">
        {meses.map((m, i) => (
          <div key={m.toISOString()} className="flex shrink-0 items-center gap-1.5">
            {m.getMonth() === 0 && i > 0 && <span className="px-1 text-xs font-semibold text-muted-foreground">{m.getFullYear()}</span>}
            <button type="button" data-sel={isSameMonth(m, mes)} onClick={() => onMes(m)}
              className={cn("rounded-full border px-3 py-1 text-sm capitalize",
                isSameMonth(m, mes) ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground")}>
              {format(m, "MMM", { locale: ptBR })}
            </button>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 border-b text-center text-[11px] font-medium text-muted-foreground">
        {SEMANA.map((d, i) => <div key={i} className={cn("py-1", i === hoje.getDay() && isSameMonth(hoje, mes) && "font-bold text-primary")}>{d}</div>)}
      </div>

      <div className="grid flex-1 min-h-0 grid-cols-7 grid-rows-6 touch-pan-y"
        onTouchStart={(e) => { toque.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
        onTouchEnd={fimToque}>
        {dias.map((d) => {
          const lista = porDia[format(d, "yyyy-MM-dd")] || [];
          const ehHoje = isSameDay(d, hoje);
          return (
            <div key={d.toISOString()} role="button" tabIndex={0} onClick={() => setDiaAberto(d)}
              className={cn("min-w-0 overflow-hidden border-b border-r border-border/60 px-[2px] pb-0.5", !isSameMonth(d, mes) && "bg-muted/30")}>
              <div className="flex justify-center py-0.5">
                <span className={cn("flex h-5 w-5 items-center justify-center rounded-full text-[11px]",
                  ehHoje ? "bg-primary font-bold text-primary-foreground" : isSameMonth(d, mes) ? "text-foreground" : "text-muted-foreground/60")}>
                  {format(d, "d")}
                </span>
              </div>
              <div className="space-y-[2px]">
                {lista.slice(0, MAX).map(pilula)}
                {lista.length > MAX && <div className="px-1 text-[10px] font-semibold text-muted-foreground">+{lista.length - MAX}</div>}
              </div>
            </div>
          );
        })}
      </div>

      <Drawer open={!!diaAberto} onOpenChange={(o) => !o && setDiaAberto(null)}>
        <DrawerContent className="max-h-[85dvh] pb-[env(safe-area-inset-bottom)]">
          <DrawerHeader className="pb-2">
            <DrawerTitle className="capitalize">{diaAberto && format(diaAberto, "EEEE, d 'de' MMMM", { locale: ptBR })}</DrawerTitle>
          </DrawerHeader>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4">
            {listaDia.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma atividade neste dia.</p>}
            {listaDia.map((a) => (
              <div key={a.id} className={cn("flex items-center gap-2 rounded-md border p-2", a.concluida && "opacity-50")}>
                <span className="h-8 w-1 shrink-0 rounded" style={{ background: atrasada(a) ? "hsl(var(--destructive))" : corDe(a.tipo_id) }} />
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => { setDiaAberto(null); onSelectAtividade(a); }}>
                  <div className={cn("truncate text-sm font-medium", a.concluida && "line-through", atrasada(a) && "text-destructive")}>{a.titulo}</div>
                  <div className="text-xs text-muted-foreground">{format(new Date(a.data_inicio), "HH:mm")}{atrasada(a) ? " · atrasada" : ""}</div>
                </button>
                {!a.concluida && (
                  <Button size="icon" variant="outline" className="h-10 w-10 shrink-0" aria-label="Marcar como feito"
                    onClick={() => { setDiaAberto(null); onConcluirRapido(a); }}><Check className="h-5 w-5" /></Button>
                )}
              </div>
            ))}
          </div>
          <div className="p-4">
            <Button className="w-full" onClick={() => { const d = diaAberto!; setDiaAberto(null); onNovaNoDia(d); }}>
              <Plus className="mr-1 h-4 w-4" /> Nova neste dia
            </Button>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
