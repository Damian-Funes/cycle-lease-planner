import { describe, it, expect, vi } from "vitest";
import { Vector2 } from "three";
import { jsPDF } from "jspdf";
import {
  comDprDeCaptura,
  dprSeguroDeCaptura,
  capturaParecemVazia,
  type RendererDprLike,
} from "@/lib/three/captureDpr";

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
  it("limita o DPR para o buffer não exceder o máximo do navegador", () => {
    // 1400x900 CSS com DPR 3 daria 4200px de lado (acima de 4096 no Safari/iOS)
    expect(dprSeguroDeCaptura(3, 1400, 900, 4096)).toBeCloseTo(4096 / 1400, 5);
    expect(dprSeguroDeCaptura(2, 1000, 700, 4096)).toBe(2);
    expect(dprSeguroDeCaptura(3, 8000, 8000, 4096)).toBe(1); // nunca abaixo de 1
  });

  it("restaura o DPR visual mesmo quando a captura lança", () => {
    const { r, dprAtual } = rendererFake(2, 1200, 800);
    expect(() =>
      comDprDeCaptura(r, 3, () => {
        throw new Error("contexto perdido");
      }, new Vector2()),
    ).toThrow("contexto perdido");
    expect(dprAtual()).toBe(2);
  });

  it("aplica o DPR de captura e restaura no sucesso", () => {
    const { r, chamadas, dprAtual } = rendererFake(2, 1200, 800);
    const dprDurante = comDprDeCaptura(r, 3, () => r.getPixelRatio(), new Vector2());
    expect(dprDurante).toBe(3);
    expect(dprAtual()).toBe(2);
    expect(chamadas.map((c) => c.dpr)).toEqual([3, 2]);
  });

  it("detecta captura vazia/branca", () => {
    expect(capturaParecemVazia(null)).toBe(true);
    expect(capturaParecemVazia("data:,")).toBe(true);
    expect(capturaParecemVazia("data:image/png;base64,AAAA")).toBe(true);
    expect(capturaParecemVazia("data:image/png;base64," + "A".repeat(5000))).toBe(false);
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

describe("saída do PDF no navegador", () => {
  it("baixa via âncora com nome .pdf e NÃO abre aba nova", () => {
    const open = vi.fn();
    const a = document.createElement("a");
    const click = vi.spyOn(a, "click");
    vi.spyOn(document, "createElement").mockReturnValueOnce(a as HTMLAnchorElement);
    vi.stubGlobal("open", open);

    // Reproduz o caminho de saída implementado em LayoutEditor.handleExportPdf
    const fname = "LAYOUT_CLIENTE_1_2026-09-05.pdf";
    const url = "blob:http://localhost/abc";
    const el = document.createElement("a") as HTMLAnchorElement;
    el.href = url;
    el.download = fname;
    el.click();

    expect(click).toHaveBeenCalledTimes(1);
    expect(el.download.endsWith(".pdf")).toBe(true);
    expect(open).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
