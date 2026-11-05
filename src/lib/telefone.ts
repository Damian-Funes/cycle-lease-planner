export function normalizarCelularBR(valor: string): string {
  const n = valor.replace(/\D/g, "");
  return n ? `+${n.startsWith("55") && n.length >= 12 ? n : `55${n}`}` : "";
}
export const validarE164BR = (valor: string) => /^\+55[1-9]\d{9,10}$/.test(valor);