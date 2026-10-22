import { addDays, addHours, nextMonday, setHours, setMinutes, setSeconds, setMilliseconds, startOfHour } from "date-fns";

export type AtalhoData = "1h" | "amanha" | "3dias" | "segunda" | "semana";

export const ATALHOS_DATA: { id: AtalhoData; label: string }[] = [
  { id: "1h", label: "Daqui 1h" },
  { id: "amanha", label: "Amanhã 9h" },
  { id: "3dias", label: "Em 3 dias" },
  { id: "segunda", label: "Próx. segunda" },
  { id: "semana", label: "Em 1 semana" },
];

const as9h = (d: Date) => setMilliseconds(setSeconds(setMinutes(setHours(d, 9), 0), 0), 0);

/** Calcula a data de um atalho a partir de `agora` (horário local). */
export function dataAtalho(id: AtalhoData, agora: Date = new Date()): Date {
  switch (id) {
    case "1h": return addHours(startOfHour(agora), 1);
    case "amanha": return as9h(addDays(agora, 1));
    case "3dias": return as9h(addDays(agora, 3));
    case "segunda": return as9h(nextMonday(agora));
    case "semana": return as9h(addDays(agora, 7));
  }
}

/** Formata Date para o valor de um input datetime-local (horário local). */
export function toLocalInput(d: Date): string {
  const x = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return x.toISOString().slice(0, 16);
}

/** Título automático: "<Tipo> — <org | deal | pessoa>" ou só "<Tipo>". */
export function tituloAutomatico(tipo: string, vinculo: { org?: string | null; deal?: string | null; pessoa?: string | null }): string {
  const alvo = vinculo.org || vinculo.deal || vinculo.pessoa;
  return alvo ? `${tipo} — ${alvo}` : tipo;
}
