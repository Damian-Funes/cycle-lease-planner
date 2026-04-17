import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { OrcamentoParams, calcSubtotal, calcDescontoAplicado, calcTotal } from "./orcamento";
import {
  toTitleCase,
  toSentenceCase,
  toUpperClean,
  normalizeEmail,
  normalizePhone,
  normalizeCnpj,
  normalizePrazo,
} from "./textFormat";

const GREEN = [5, 150, 105] as const;
const WHITE = [255, 255, 255] as const;
const GRAY_LIGHT = [243, 244, 246] as const;
const BLACK = [0, 0, 0] as const;

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function drawLogoFallback(doc: jsPDF, x: number, y: number) {
  doc.setFillColor(0, 82, 136);
  doc.roundedRect(x, y, 20, 10, 1, 1, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("LS", x + 5, y + 7);
  doc.setFillColor(0, 128, 64);
  doc.circle(x + 16, y + 6, 3, "F");
  doc.setTextColor(0, 82, 136);
  doc.setFontSize(6);
  doc.setFont("helvetica", "normal");
  doc.text("do Brasil", x + 3, y + 13);
  doc.setTextColor(0, 0, 0);
}

async function preloadLogo(): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            resolve(canvas.toDataURL("image/png"));
          } else {
            resolve(null);
          }
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = "/ls-logo.png";
    } catch {
      resolve(null);
    }
  });
}

function addHeader(doc: jsPDF, params: OrcamentoParams, logoDataUrl: string | null) {
  const pageW = doc.internal.pageSize.getWidth();

  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, "PNG", 14, 6, 35, 27);
    } catch {
      drawLogoFallback(doc, 14, 8);
    }
  } else {
    drawLogoFallback(doc, 14, 8);
  }

  const rightLines: string[] = [
    `NÚMERO: ${params.numeroOrcamento || "—"}`,
    `DATA: ${new Date().toLocaleDateString("pt-BR")}`,
    `CLIENTE: ${params.clientName}`,
  ];
  if (params.clienteEndereco) rightLines.push(`ENDEREÇO: ${params.clienteEndereco}`);
  if (params.clienteTelefone) rightLines.push(`TEL: ${params.clienteTelefone}`);
  if (params.clienteCnpj) rightLines.push(`CNPJ: ${params.clienteCnpj}`);
  if (params.clienteEmail) rightLines.push(`E-MAIL: ${params.clienteEmail}`);

  autoTable(doc, {
    startY: 35,
    theme: "grid",
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: GREEN as any, textColor: WHITE as any, fontStyle: "bold", fontSize: 8 },
    columnStyles: {
      0: { cellWidth: pageW / 2 - 14 },
      1: { cellWidth: pageW / 2 - 14 },
    },
    head: [["LS DO BRASIL", "ORÇAMENTO COMERCIAL"]],
    body: [
      [
        "LS DO BRASIL COMÉRCIO E INSTALAÇÕES INDUSTRIAIS LTDA\nAv. Marcelo Messias Busiquia, 197\nParque Industrial II, Maringá-PR\nCEP: 87065-006\nTE: 44 3040-6098\nCNPJ: 23.108.428/0001-58",
        rightLines.join("\n"),
      ],
    ],
  });
}

function addFooter(doc: jsPDF) {
  const pageH = doc.internal.pageSize.getHeight();
  const pageW = doc.internal.pageSize.getWidth();
  doc.setFontSize(6);
  doc.setTextColor(100);
  doc.text(
    "(+55) 44 3040.6098  |  administrativo@lsdobrasil.com.br  |  Av. Marcelo Messias Busiquia, 197 - Parque Industrial II, 87065-006 - Maringá, PR",
    pageW / 2,
    pageH - 8,
    { align: "center" }
  );
}

function getLastY(doc: jsPDF): number {
  return (doc as any).lastAutoTable?.finalY ?? 60;
}

const baseStyles = { fontSize: 9, cellPadding: 3 };
const headStyles = { fillColor: GREEN as any, textColor: WHITE as any, fontStyle: "bold" as const, fontSize: 9 };
const altRowStyles = { fillColor: [249, 250, 251] as any };

export async function generateOrcamentoPdf(params: OrcamentoParams) {
  const logoDataUrl = await preloadLogo();
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();

  const subtotal = calcSubtotal(params.itens);
  const desconto = calcDescontoAplicado(subtotal, params.descontoTipo, params.descontoValor);
  const total = calcTotal(params);

  addHeader(doc, params, logoDataUrl);
  let y = getLastY(doc) + 12;

  doc.setFontSize(10);
  doc.setTextColor(50);
  const introText = `At.: Sr(a).: ${params.contatoNome || params.clientName}\nApresentamos abaixo o orçamento para os itens solicitados:`;
  doc.text(introText, 14, y);
  y += 14;

  // Tabela de itens
  const itemRows = params.itens.map((it, i) => {
    const desc = it.descricao.replace(/\s*\[.*?\]\s*/g, "").trim();
    const sub = it.valor_unitario * it.quantidade;
    return [
      String(i + 1),
      desc,
      String(it.quantidade),
      fmtBRL(it.valor_unitario),
      fmtBRL(sub),
    ];
  });

  autoTable(doc, {
    startY: y,
    theme: "grid",
    headStyles,
    styles: baseStyles,
    alternateRowStyles: altRowStyles,
    columnStyles: {
      0: { cellWidth: 12, halign: "center" },
      1: { cellWidth: "auto" as any },
      2: { cellWidth: 14, halign: "center" },
      3: { cellWidth: 32, halign: "right" },
      4: { cellWidth: 34, halign: "right" },
    },
    head: [["ÍTEM", "DESCRIÇÃO", "QTD", "VALOR UNIT.", "SUBTOTAL"]],
    body: itemRows,
  });

  y = getLastY(doc) + 8;

  // Tabela de totais
  const descLabel = params.descontoTipo === "percentual"
    ? `Desconto (${params.descontoValor.toLocaleString("pt-BR")}%)`
    : "Desconto";

  const totalsBody: any[] = [["Subtotal", fmtBRL(subtotal)]];
  if (desconto > 0) totalsBody.push([descLabel, `- ${fmtBRL(desconto)}`]);
  if (params.frete > 0) totalsBody.push(["Frete", fmtBRL(params.frete)]);

  const descW = (pageW - 28) * 0.6;
  const valW = (pageW - 28) * 0.4;

  autoTable(doc, {
    startY: y,
    theme: "plain",
    styles: { ...baseStyles, lineWidth: 0.2, lineColor: [220, 220, 220] as any },
    columnStyles: {
      0: { cellWidth: descW, halign: "right" as const },
      1: { cellWidth: valW, halign: "right" as const },
    },
    body: totalsBody,
    foot: [["TOTAL", fmtBRL(total)]],
    footStyles: { fillColor: GREEN as any, textColor: WHITE as any, fontStyle: "bold", fontSize: 11, halign: "right" },
  });

  y = getLastY(doc) + 12;

  // Condições
  doc.setFontSize(11);
  doc.setTextColor(...GREEN);
  doc.text("CONDIÇÕES COMERCIAIS", 14, y);
  y += 7;
  doc.setFontSize(9);
  doc.setTextColor(50);

  const lines: string[] = [];
  if (params.condicoesPagamento) lines.push(`Condições de pagamento: ${params.condicoesPagamento}`);
  if (params.prazoEntrega) lines.push(`Prazo de entrega: ${params.prazoEntrega}`);
  lines.push(`Validade da oferta: ${params.validadeDias} dias`);
  if (params.localEntrega || params.clienteEndereco) {
    lines.push(`Local de entrega: ${params.localEntrega || params.clienteEndereco}`);
  }
  lines.push("Moeda: Real (R$)");

  lines.forEach((l) => {
    const split = doc.splitTextToSize(l, pageW - 28);
    doc.text(split, 14, y);
    y += split.length * 5;
  });

  if (params.observacoes) {
    y += 4;
    doc.setFontSize(11);
    doc.setTextColor(...GREEN);
    doc.text("OBSERVAÇÕES", 14, y);
    y += 7;
    doc.setFontSize(9);
    doc.setTextColor(50);
    const split = doc.splitTextToSize(params.observacoes, pageW - 28);
    doc.text(split, 14, y);
  }

  addFooter(doc);

  const fileName = `${params.numeroOrcamento || "orcamento"}-${params.clientName || "cliente"}.pdf`.replace(/\s+/g, "_");

  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  const inIframe = (() => { try { return window.self !== window.top; } catch { return true; } })();

  if (isSafari || inIframe) {
    try {
      const dataUri = doc.output("datauristring", { filename: fileName });
      const win = window.open();
      if (win) {
        win.document.write(
          `<html><head><title>${fileName}</title></head>` +
          `<body style="margin:0">` +
          `<iframe src="${dataUri}" style="border:0;width:100vw;height:100vh"></iframe>` +
          `</body></html>`
        );
        win.document.close();
      } else {
        if (window.top) {
          window.top.location.href = dataUri;
        } else {
          window.location.href = dataUri;
        }
      }
    } catch {
      doc.save(fileName);
    }
  } else {
    try {
      doc.save(fileName);
    } catch {
      const dataUri = doc.output("datauristring", { filename: fileName });
      window.open(dataUri, "_blank");
    }
  }
}
