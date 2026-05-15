import { useMemo, useState } from "react";
import * as Icons from "lucide-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  isSameMonth,
  isSameDay,
  isToday,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";

interface Tipo { id: string; nome: string; icone: string | null; cor: string | null; }
interface Atividade {
  id: string; titulo: string; data_inicio: string; concluida: boolean;
  tipo_id: string | null; responsavel_id: string | null;
}

interface Props {
  atividades: Atividade[];
  tipos: Tipo[];
  onSelectAtividade: (a: Atividade) => void;
  onCreateAt?: (date: Date) => void;
}

const WEEKDAYS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

export default function AtividadesCalendar({ atividades, tipos, onSelectAtividade, onCreateAt }: Props) {
  const [cursor, setCursor] = useState<Date>(() => startOfMonth(new Date()));

  const dias = useMemo(() => {
    const ini = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
    const fim = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 });
    const out: Date[] = [];
    let d = ini;
    while (d <= fim) { out.push(d); d = addDays(d, 1); }
    return out;
  }, [cursor]);

  const porDia = useMemo(() => {
    const m: Record<string, Atividade[]> = {};
    atividades.forEach((a) => {
      const k = format(new Date(a.data_inicio), "yyyy-MM-dd");
      (m[k] = m[k] || []).push(a);
    });
    Object.values(m).forEach((arr) =>
      arr.sort((a, b) => new Date(a.data_inicio).getTime() - new Date(b.data_inicio).getTime())
    );
    return m;
  }, [atividades]);

  const tipoMap = useMemo(() => Object.fromEntries(tipos.map((t) => [t.id, t])), [tipos]);

  return (
    <div className="bg-card rounded-lg border overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCursor(addMonths(cursor, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="font-semibold capitalize min-w-[180px] text-center">
            {format(cursor, "MMMM 'de' yyyy", { locale: ptBR })}
          </h2>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCursor(addMonths(cursor, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Button variant="outline" size="sm" onClick={() => setCursor(startOfMonth(new Date()))}>
          Hoje
        </Button>
      </div>

      <div className="grid grid-cols-7 bg-muted/30 text-xs font-semibold text-muted-foreground">
        {WEEKDAYS.map((w) => (
          <div key={w} className="px-2 py-1.5 text-center capitalize">{w}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 auto-rows-fr">
        {dias.map((d, i) => {
          const k = format(d, "yyyy-MM-dd");
          const itens = porDia[k] || [];
          const inMonth = isSameMonth(d, cursor);
          const today = isToday(d);
          return (
            <div
              key={i}
              className={`min-h-[110px] border-b border-r p-1 flex flex-col gap-1 group ${
                inMonth ? "bg-card" : "bg-muted/20 text-muted-foreground"
              }`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`text-xs font-medium inline-flex items-center justify-center w-6 h-6 rounded-full ${
                    today ? "bg-primary text-primary-foreground" : ""
                  }`}
                >
                  {format(d, "d")}
                </span>
                {onCreateAt && (
                  <button
                    onClick={() => onCreateAt(d)}
                    className="opacity-0 group-hover:opacity-100 text-xs text-muted-foreground hover:text-primary"
                    title="Nova atividade"
                  >
                    +
                  </button>
                )}
              </div>

              <div className="flex flex-col gap-0.5 overflow-hidden">
                {itens.slice(0, 3).map((a) => {
                  const tipo = a.tipo_id ? tipoMap[a.tipo_id] : null;
                  const Icon: any = tipo?.icone && (Icons as any)[tipo.icone] ? (Icons as any)[tipo.icone] : Icons.Circle;
                  const cor = tipo?.cor || "#6b7280";
                  return (
                    <button
                      key={a.id}
                      onClick={() => onSelectAtividade(a)}
                      className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] truncate text-left hover:opacity-80 ${
                        a.concluida ? "line-through opacity-60" : ""
                      }`}
                      style={{ background: cor + "22", color: cor }}
                      title={`${format(new Date(a.data_inicio), "HH:mm")} — ${a.titulo}`}
                    >
                      <Icon className="h-3 w-3 shrink-0" />
                      <span className="truncate">
                        <span className="tabular-nums">{format(new Date(a.data_inicio), "HH:mm")}</span> {a.titulo}
                      </span>
                    </button>
                  );
                })}
                {itens.length > 3 && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="text-[11px] text-muted-foreground hover:text-foreground text-left px-1.5">
                        +{itens.length - 3} mais
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72 p-2 max-h-80 overflow-y-auto">
                      <div className="text-xs font-semibold mb-2 capitalize">
                        {format(d, "EEEE, d 'de' MMMM", { locale: ptBR })}
                      </div>
                      <div className="flex flex-col gap-1">
                        {itens.map((a) => {
                          const tipo = a.tipo_id ? tipoMap[a.tipo_id] : null;
                          const Icon: any = tipo?.icone && (Icons as any)[tipo.icone] ? (Icons as any)[tipo.icone] : Icons.Circle;
                          const cor = tipo?.cor || "#6b7280";
                          return (
                            <button
                              key={a.id}
                              onClick={() => onSelectAtividade(a)}
                              className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-muted text-left ${
                                a.concluida ? "line-through opacity-60" : ""
                              }`}
                            >
                              <span className="tabular-nums text-muted-foreground w-10">
                                {format(new Date(a.data_inicio), "HH:mm")}
                              </span>
                              <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: cor }} />
                              <span className="truncate flex-1">{a.titulo}</span>
                            </button>
                          );
                        })}
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
