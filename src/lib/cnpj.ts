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

/** Formata CPF no padrão XXX.XXX.XXX-XX. Aceita parciais. */
export function formatCpf(s: string | null | undefined): string {
  const d = onlyDigits(s).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/**
 * Formata CPF (11 dígitos) ou CNPJ (até 14). Decide pelo total de dígitos:
 * - até 11 dígitos => formato CPF
 * - acima de 11    => formato CNPJ
 */
export function formatCpfCnpj(s: string | null | undefined): string {
  const d = onlyDigits(s);
  if (d.length <= 11) return formatCpf(d);
  return formatCnpj(d);
}

export function isCpf(s: string | null | undefined): boolean {
  return onlyDigits(s).length === 11;
}

export function isCnpj(s: string | null | undefined): boolean {
  return onlyDigits(s).length === 14;
}
