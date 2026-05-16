export function onlyDigits(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

/**
 * Formata CNPJ no padrão XX.XXX.XXX/XXXX-XX.
 * Idempotente: aceita string já formatada ou só dígitos.
 * Se tiver menos de 14 dígitos, formata parcialmente (útil em onChange).
 */
export function formatCnpj(s: string | null | undefined): string {
  const d = onlyDigits(s).slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}
