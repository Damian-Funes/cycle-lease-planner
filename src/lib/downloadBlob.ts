/**
 * Dispara o download de um Blob já gerado, usando uma âncora temporária.
 * Não abre abas novas. Em caso de falha, remove a âncora e propaga o erro
 * para quem chamou decidir o fallback (o object URL é gerido fora daqui).
 */
export function baixarBlobUrl(url: string, fname: string, doc: Document = document): void {
  const a = doc.createElement("a");
  a.href = url;
  a.download = fname;
  a.rel = "noopener";
  a.style.display = "none";
  doc.body.appendChild(a);
  try {
    a.click();
  } finally {
    a.remove();
  }
}

/**
 * Abre um PDF já gerado somente a partir de um gesto explícito do usuário.
 * Retorna false quando o navegador ou o sandbox bloqueia a nova aba.
 */
export function visualizarBlobUrl(url: string, win: Window = window): boolean {
  const popup = win.open(url, "_blank");
  if (!popup) return false;
  try {
    popup.opener = null;
  } catch {
    // Alguns navegadores não permitem alterar opener; a visualização já abriu.
  }
  return true;
}

export async function compartilharBlob(
  blob: Blob,
  fname: string,
  nav: Navigator = navigator,
): Promise<boolean> {
  if (!("share" in nav) || typeof nav.share !== "function") return false;
  const file = new File([blob], fname, { type: blob.type || "application/pdf" });
  if (typeof nav.canShare === "function" && !nav.canShare({ files: [file] })) return false;
  await nav.share({ files: [file], title: fname });
  return true;
}
