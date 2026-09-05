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
export function visualizarBlobUrl(url: string, fname: string, win: Window = window): boolean {
  const popup = win.open("", "_blank");
  if (!popup) return false;
  try {
    const doc = popup.document;
    doc.title = fname;
    doc.body.style.margin = "0";
    doc.body.style.height = "100vh";

    const viewer = doc.createElement("embed");
    viewer.src = url;
    viewer.type = "application/pdf";
    viewer.style.width = "100%";
    viewer.style.height = "100%";
    doc.body.appendChild(viewer);

    const fallback = doc.createElement("a");
    fallback.href = url;
    fallback.download = fname;
    fallback.textContent = "Baixar PDF";
    fallback.style.position = "fixed";
    fallback.style.right = "16px";
    fallback.style.bottom = "16px";
    fallback.style.padding = "10px 14px";
    fallback.style.background = "#ffffff";
    fallback.style.color = "#111111";
    fallback.style.border = "1px solid #cccccc";
    fallback.style.borderRadius = "6px";
    fallback.style.font = "14px sans-serif";
    doc.body.appendChild(fallback);
    popup.opener = null;
  } catch {
    popup.close();
    return false;
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
