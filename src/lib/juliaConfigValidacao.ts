import { normalizarCelularBR, validarE164BR } from "./telefone";

/** Normaliza o valor do campo de hora (iOS pode devolver "16:00:00" ou "9:05") para HH:MM. */
export function normalizarHora(valor: string): string | null {
  const m = /^(\d{1,2}):(\d{2})/.exec((valor ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

export type PerfilCel = { user_id: string; nome: string; celular: string | null };

export interface ResultadoValidacao {
  hora: string | null;
  erros: string[];
  celularesAlterados: { user_id: string; celular: string | null }[];
}

/** Valida horário (15h50–21h59) e celulares; devolve só os celulares que mudaram. */
export function validarConfigJulia(horaBruta: string, perfis: PerfilCel[], editados: Record<string, string>): ResultadoValidacao {
  const erros: string[] = [];
  const hora = normalizarHora(horaBruta);
  if (!hora) erros.push("Horário de contato inválido.");
  else if (hora < "15:50" || hora > "21:59") erros.push("Contato inicial deve ficar entre 15h50 e 21h59.");
  const celularesAlterados: ResultadoValidacao["celularesAlterados"] = [];
  for (const p of perfis) {
    const v = normalizarCelularBR(editados[p.user_id] ?? p.celular ?? "");
    if (v && !validarE164BR(v)) { erros.push(`Celular inválido: ${p.nome}.`); continue; }
    const novo = v || null;
    if (novo !== (p.celular ?? null)) celularesAlterados.push({ user_id: p.user_id, celular: novo });
  }
  return { hora, erros, celularesAlterados };
}
