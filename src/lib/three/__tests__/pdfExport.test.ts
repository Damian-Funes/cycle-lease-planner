import { describe, it, expect, vi, afterEach } from "vitest";
import { Vector2 } from "three";
import { jsPDF } from "jspdf";
import { comDprDeCaptura, type RendererDprLike } from "@/lib/three/captureDpr";
import { baixarBlobUrl, compartilharBlob, visualizarBlobUrl } from "@/lib/downloadBlob";

/** Renderer falso que registra DPR/tamanho aplicados. */
function rendererFake(dprInicial: number, w: number, h: number) {
  let dpr = dprInicial;
  const chamadas: { dpr: number; w: number; h: number }[] = [];
  const r: RendererDprLike = {
    getPixelRatio: () => dpr,
    setPixelRatio: (v: number) => {
      dpr = v;
      chamadas.push({ dpr: v, w, h });
    },
    getSize: (t: Vector2) => t.set(w, h),
    setSize: () => {},
  } as unknown as RendererDprLike;
  return { r, chamadas, dprAtual: () => dpr };
}

describe("DPR de captura", () => {
  it("restaura o DPR visual mesmo quando a captura lança", () => {
    const { r, dprAtual } = rendererFake(2, 1200, 800);
    expect(() =>
      comDprDeCaptura(r, 3, () => {
        throw new Error("contexto perdido");
      }, new Vector2()),
    ).toThrow("contexto perdido");
    expect(dprAtual()).toBe(2);
  });

  it("aplica o DPR de captura (resolução original) e restaura no sucesso", () => {
    const { r, chamadas, dprAtual } = rendererFake(2, 1200, 800);
    const dprDurante = comDprDeCaptura(r, 3, () => r.getPixelRatio(), new Vector2());
    expect(dprDurante).toBe(3);
    expect(dprAtual()).toBe(2);
    expect(chamadas.map((c) => c.dpr)).toEqual([3, 2]);
  });
});

/** PNG 2x2 real (não vazio) para embutir no PDF. */
const PNG_2x2 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAFElEQVR4nGOUq4hiwAaYsIoOWgkAwGwBAMG+AfgAAAAASUVORK5CYII=";

describe("PDF de layout (A3 paisagem)", () => {
  it("gera PDF real com header %PDF, páginas esperadas e imagens embutidas", () => {
    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a3" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    // A3 paisagem ≈ 420 x 297 mm
    expect(Math.round(pageW)).toBe(420);
    expect(Math.round(pageH)).toBe(297);

    const vistas = ["Superior", "Planta com Cotas (mm)", "Isométrica", "Frontal", "Esq.", "Dir."];
    vistas.forEach((titulo, i) => {
      if (i > 0) pdf.addPage();
      pdf.text(`LS DO BRASIL — ${titulo}`, 15, 15);
      pdf.addImage(PNG_2x2, "PNG", 15, 34, 390, 240);
    });
    pdf.addPage(); // lista de equipamentos
    pdf.text("Equipamentos do Layout", 15, 15);

    expect(pdf.getNumberOfPages()).toBe(vistas.length + 1);

    const bytes = pdf.output("arraybuffer");
    const buf = new Uint8Array(bytes);
    expect(buf.byteLength).toBeGreaterThan(1000);
    const head = String.fromCharCode(...buf.slice(0, 5));
    expect(head).toBe("%PDF-");
    const texto = new TextDecoder("latin1").decode(buf);
    expect(texto).toContain("/Subtype /Image");
    expect(texto).toContain("%%EOF");
  });
});

describe("baixarBlobUrl", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("cria âncora com nome/url, clica e limpa o DOM, sem abrir aba", () => {
    const open = vi.fn();
    vi.stubGlobal("open", open);
    const url = "blob:http://localhost/abc";
    const fname = "LAYOUT_CLIENTE_1_2026-09-05.pdf";

    let ancora: HTMLAnchorElement | null = null;
    const criar = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
      const el = criar(tag);
      if (tag === "a") {
        ancora = el as HTMLAnchorElement;
        vi.spyOn(ancora, "click");
      }
      return el;
    }) as typeof document.createElement);

    baixarBlobUrl(url, fname);

    expect(ancora).not.toBeNull();
    expect(ancora!.getAttribute("href")).toBe(url);
    expect(ancora!.download).toBe(fname);
    expect(ancora!.click).toHaveBeenCalledTimes(1);
    expect(ancora!.isConnected).toBe(false);
    expect(document.querySelectorAll("a").length).toBe(0);
    expect(open).not.toHaveBeenCalled();
  });

  it("remove a âncora e propaga o erro quando o clique falha", () => {
    const url = "blob:http://localhost/def";
    let ancora: HTMLAnchorElement | null = null;
    const criar = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
      const el = criar(tag);
      if (tag === "a") {
        ancora = el as HTMLAnchorElement;
        vi.spyOn(ancora, "click").mockImplementation(() => {
          throw new Error("bloqueado");
        });
      }
      return el;
    }) as typeof document.createElement);

    expect(() => baixarBlobUrl(url, "x.pdf")).toThrow("bloqueado");
    expect(ancora!.isConnected).toBe(false);
    expect(document.querySelectorAll("a").length).toBe(0);
  });

  it("abre a visualização somente quando o navegador aceita a nova aba", () => {
    const popup = { opener: window } as unknown as Window;
    const win = { open: vi.fn().mockReturnValue(popup) } as unknown as Window;
    expect(visualizarBlobUrl("blob:http://localhost/pdf", win)).toBe(true);
    expect(win.open).toHaveBeenCalledWith("blob:http://localhost/pdf", "_blank");
    expect(popup.opener).toBeNull();

    const bloqueado = { open: vi.fn().mockReturnValue(null) } as unknown as Window;
    expect(visualizarBlobUrl("blob:http://localhost/pdf", bloqueado)).toBe(false);
  });

  it("oferece o arquivo ao compartilhamento nativo quando disponível", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const canShare = vi.fn().mockReturnValue(true);
    const nav = { share, canShare } as unknown as Navigator;
    const blob = new Blob(["%PDF-1.4"], { type: "application/pdf" });

    await expect(compartilharBlob(blob, "layout.pdf", nav)).resolves.toBe(true);
    const payload = share.mock.calls[0][0] as ShareData;
    expect(payload.files?.[0].name).toBe("layout.pdf");
    expect(payload.files?.[0].type).toBe("application/pdf");
  });
});
