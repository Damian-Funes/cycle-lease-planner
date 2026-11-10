import { addDays, startOfMonth, startOfWeek } from "date-fns";

/** 6 semanas (42 dias) começando no domingo da semana do dia 1. */
export function gradeMes(mes: Date): Date[] {
  const ini = startOfWeek(startOfMonth(mes), { weekStartsOn: 0 });
  return Array.from({ length: 42 }, (_, i) => addDays(ini, i));
}
