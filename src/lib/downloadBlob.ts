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
