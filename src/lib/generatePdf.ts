import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { SmartCycleParams, YearProjection, calcDivida, calcVolumeMinimoAnual } from "./smartcycle";

const GREEN = [5, 150, 105] as const;
const WHITE = [255, 255, 255] as const;
const GRAY_LIGHT = [243, 244, 246] as const;
const BLACK = [0, 0, 0] as const;

const LS_LOGO = "data:image/png;base64,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";

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtNum(v: number) {
  return v.toLocaleString("pt-BR");
}

function addHeader(doc: jsPDF, params: SmartCycleParams, logoDataUrl: string | null) {
  const pageW = doc.internal.pageSize.getWidth();

  // Add logo image (pre-processed via canvas)
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, "PNG", 14, 8, 28, 14);
    } catch (e) {
      // Fallback: draw text if image fails
      doc.setFontSize(14);
      doc.setTextColor(5, 150, 105);
      doc.setFont(undefined as any, "bold");
      doc.text("LS", 14, 18);
      doc.setFont(undefined as any, "normal");
    }
  } else {
    doc.setFontSize(14);
    doc.setTextColor(5, 150, 105);
    doc.setFont(undefined as any, "bold");
    doc.text("LS", 14, 18);
    doc.setFont(undefined as any, "normal");
  }

  // Build right column lines dynamically - only show filled fields
  const rightLines: string[] = [
    `NÚMERO: ${params.numeroProposta || "—"}`,
    `DATA: ${new Date().toLocaleDateString("pt-BR")}`,
    `CLIENTE: ${params.clientName}`,
  ];
  if (params.clienteEndereco) rightLines.push(`ENDEREÇO: ${params.clienteEndereco}`);
  if (params.clienteTelefone) rightLines.push(`TEL: ${params.clienteTelefone}`);
  if (params.clienteCnpj) rightLines.push(`CNPJ: ${params.clienteCnpj}`);
  if (params.clienteEmail) rightLines.push(`E-MAIL: ${params.clienteEmail}`);

  autoTable(doc, {
    startY: 10,
    theme: "grid",
    styles: { fontSize: 7, cellPadding: 3 },
    headStyles: { fillColor: GREEN as any, textColor: WHITE as any, fontStyle: "bold", fontSize: 9 },
    columnStyles: {
      0: { cellWidth: pageW / 2 - 14 },
      1: { cellWidth: pageW / 2 - 14 },
    },
    head: [["LS DO BRASIL", "FORMULÁRIO SMARTCYCLE"]],
    body: [
      [
        "LS DO BRASIL COMÉRCIO E INSTALAÇÕES INDUSTRIAIS LTDA\nR. Almerinda Silveira Coelho - Nº 6773\nMaringá-PR CEP 87.035-497\nTE: 44 3040-6098\nCNPJ: 23.108.428/0001-58",
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
    "(+55) 44 3040.6098  |  administrativo@lsdobrasil.com.br  |  Rua Almerinda Silveira Coelho, 6773 - Novo Alvorada, 87035-497 - Maringá, PR",
    pageW / 2,
    pageH - 8,
    { align: "center" }
  );
}

function getLastY(doc: jsPDF): number {
  return (doc as any).lastAutoTable?.finalY ?? 60;
}

const baseStyles = { fontSize: 9, cellPadding: 4 };
const headStyles = { fillColor: GREEN as any, textColor: WHITE as any, fontStyle: "bold" as const, fontSize: 10 };
const altRowStyles = { fillColor: [249, 250, 251] as any };

async function preloadLogo(): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const img = new Image();
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
      img.src = LS_LOGO;
    } catch {
      resolve(null);
    }
  });
}

export async function generateProposalPdf(params: SmartCycleParams, projection: YearProjection[]) {
  const logoDataUrl = await preloadLogo();
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const volumeMin = calcVolumeMinimoAnual(params);
  const volumeF2 = Math.round(volumeMin * (params.volumeMinF2Pct / 100));
  const divida = calcDivida(params);
  const subtotalF1 = projection.filter(r => r.fase === 1).reduce((s, r) => s + r.receitaAnual, 0);
  const subtotalF2 = projection.filter(r => r.fase === 2).reduce((s, r) => s + r.receitaAnual, 0);
  const totalGeral = params.entrada + subtotalF1 + subtotalF2;
  const mensF1 = (volumeMin * params.tarifaF1) / 12;
  const mensF2 = (volumeF2 * params.tarifaF2) / 12;

  // ===== PAGE 1: Equipamentos (SEM valores de custo) =====
  addHeader(doc, params, logoDataUrl);
  let y = getLastY(doc) + 15;

  doc.setFontSize(10);
  doc.setTextColor(50);
  const introText = `At.: Sr(a).: ${params.contatoNome || params.clientName}\nNós estendemos nossa proposta SmartCycle LS para os equipamentos listados abaixo:`;
  doc.text(introText, 14, y);
  y += 16;

  // Only show ITEM, DESCRIPTION, QTD — no costs, no codes
  const equipRows = params.itensProjeto.map((item, i) => [
    String(i + 1),
    item.descricao.replace(/\s*\[.*?\]\s*/g, "").trim(),
    String(item.quantidade),
  ]);

  autoTable(doc, {
    startY: y,
    theme: "grid",
    headStyles,
    styles: baseStyles,
    alternateRowStyles: altRowStyles,
    head: [["ÍTEM", "DESCRIÇÃO", "QTD"]],
    body: equipRows,
  });

  y = getLastY(doc) + 10;
  doc.setFontSize(11);
  doc.setTextColor(...GREEN);
  doc.setFont(undefined as any, "bold");
  doc.text(`VALOR DA IMPLANTAÇÃO: ${fmtBRL(params.valorProjeto)}`, 14, y);
  doc.setFont(undefined as any, "normal");

  addFooter(doc);

  // ===== PAGE 2: Modelo SmartCycle =====
  doc.addPage();
  addHeader(doc, params, logoDataUrl);
  y = getLastY(doc) + 15;

  doc.setFontSize(13);
  doc.setTextColor(...GREEN);
  doc.text("MODELO OPERACIONAL SMARTCYCLE LS", 14, y);
  y += 10;

  doc.setFontSize(9);
  doc.setTextColor(50);
  const modelText = "O SmartCycle LS é um modelo de leasing operacional para centros de tratamento de sementes de alta performance. A LS permanece como proprietária do equipamento durante todo o contrato, enquanto o cliente o utiliza mediante pagamento por produção.";
  const splitModel = doc.splitTextToSize(modelText, pageW - 28);
  doc.text(splitModel, 14, y);
  y += splitModel.length * 5 + 10;

  doc.setFontSize(11);
  doc.setTextColor(...GREEN);
  doc.text("ESTRUTURA DO CONTRATO", 14, y);
  y += 8;

  const tarifaKgF1 = params.pesoPorSaco > 0 ? params.tarifaF1 / params.pesoPorSaco : 0;
  const tarifaKgF2 = params.pesoPorSaco > 0 ? params.tarifaF2 / params.pesoPorSaco : 0;
  const kgF1 = volumeMin * params.pesoPorSaco;
  const kgF2 = volumeF2 * params.pesoPorSaco;

  autoTable(doc, {
    startY: y,
    theme: "grid",
    headStyles,
    styles: baseStyles,
    alternateRowStyles: altRowStyles,
    head: [["", "FASE 1 (Anos 1 a 5)", "FASE 2 (Anos 6 a 10)"]],
    body: [
      ["Tarifa por saco", fmtBRL(params.tarifaF1), fmtBRL(params.tarifaF2)],
      ["Tarifa por kg", fmtBRL(tarifaKgF1), fmtBRL(tarifaKgF2)],
      ["Volume mínimo anual", `${fmtNum(volumeMin)} sacos`, `${fmtNum(volumeF2)} sacos`],
      ["Equivalente em kg", `${fmtNum(kgF1)} kg`, `${fmtNum(kgF2)} kg`],
      ["Mensalidade (Ano 1 / Ano 6)", fmtBRL(mensF1), fmtBRL(mensF2)],
    ],
  });

  y = getLastY(doc) + 15;
  doc.setFontSize(11);
  doc.setTextColor(...GREEN);
  doc.text("POLÍTICA DE EXCEDENTES", 14, y);
  y += 8;
  doc.setFontSize(9);
  doc.setTextColor(50);
  const excKg = params.pesoPorSaco > 0 ? params.tarifaExcedente / params.pesoPorSaco : 0;
  const excText = `Produção acima do volume mínimo anual será cobrada a ${fmtBRL(params.tarifaExcedente)}/saco (${fmtBRL(excKg)}/kg). Apuração ao final de cada ano com pagamento em até 20 dias.`;
  const splitExc = doc.splitTextToSize(excText, pageW - 28);
  doc.text(splitExc, 14, y);

  addFooter(doc);

  // ===== PAGE 3: Projeção 10 anos =====
  doc.addPage();
  addHeader(doc, params, logoDataUrl);
  y = getLastY(doc) + 15;

  doc.setFontSize(13);
  doc.setTextColor(...GREEN);
  doc.text("PROJEÇÃO FINANCEIRA — 10 ANOS", 14, y);
  y += 10;

  // Bar chart using canvas
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 300;
    document.body.appendChild(canvas);
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const data = projection.map(r => r.receitaAnual);
      const colors = projection.map(r => r.fase === 1 ? "#10b981" : "#6ee7b7");
      const barWidth = 60;
      const gap = 20;
      const maxVal = Math.max(...data);
      const chartHeight = 250;
      const startX = 50;
      const startY = 270;

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, 800, 300);

      data.forEach((val, i) => {
        const barH = (val / maxVal) * chartHeight;
        const x = startX + i * (barWidth + gap);
        const yBar = startY - barH;
        ctx.fillStyle = colors[i];
        ctx.fillRect(x, yBar, barWidth, barH);
        ctx.fillStyle = "#374151";
        ctx.font = "11px Arial";
        ctx.textAlign = "center";
        ctx.fillText(`Ano ${i + 1}`, x + barWidth / 2, startY + 15);
        ctx.fillStyle = "#6b7280";
        ctx.font = "9px Arial";
        const valK = (val / 1000).toFixed(0) + "k";
        ctx.fillText(valK, x + barWidth / 2, yBar - 5);
      });

      // Legend
      ctx.fillStyle = "#10b981";
      ctx.fillRect(250, 5, 12, 12);
      ctx.fillStyle = "#374151";
      ctx.font = "11px Arial";
      ctx.textAlign = "left";
      ctx.fillText("Fase 1", 267, 15);
      ctx.fillStyle = "#6ee7b7";
      ctx.fillRect(320, 5, 12, 12);
      ctx.fillStyle = "#374151";
      ctx.fillText("Fase 2", 337, 15);

      const chartImage = canvas.toDataURL("image/png");
      doc.addImage(chartImage, "PNG", 14, y, 180, 65);
      y += 70;
    }
    document.body.removeChild(canvas);
  } catch (e) {
    // Skip chart if canvas fails
  }

  const projRows = projection.map(r => [
    String(r.ano),
    `Fase ${r.fase}`,
    fmtBRL(r.precoSaco),
    fmtNum(r.volumeMinimo),
    fmtBRL(r.mensalidade),
    fmtBRL(r.receitaAnual),
  ]);

  autoTable(doc, {
    startY: y,
    theme: "grid",
    headStyles,
    styles: baseStyles,
    alternateRowStyles: altRowStyles,
    head: [["ANO", "FASE", "PREÇO/SACO", "VOL. MÍNIMO", "MENSALIDADE", "RECEITA ANUAL"]],
    body: projRows,
    foot: [
      ["", "", "", "", "ENTRADA", fmtBRL(params.entrada)],
      ["", "", "", "", "FASE 1", fmtBRL(subtotalF1)],
      ["", "", "", "", "FASE 2", fmtBRL(subtotalF2)],
      ["", "", "", "", "TOTAL 10 ANOS", fmtBRL(totalGeral)],
    ],
    footStyles: { fillColor: GRAY_LIGHT as any, textColor: BLACK as any, fontStyle: "bold", fontSize: 10 },
    didParseCell(data) {
      if (data.section === "foot" && data.row.index === 3) {
        data.cell.styles.textColor = GREEN as any;
        data.cell.styles.fillColor = WHITE as any;
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fontSize = 11;
      }
    },
  });

  addFooter(doc);

  // ===== PAGE 4: Resumo + Condições + Assinatura =====
  doc.addPage();
  addHeader(doc, params, logoDataUrl);
  y = getLastY(doc) + 15;

  doc.setFontSize(13);
  doc.setTextColor(...GREEN);
  doc.text("RESUMO DA PROPOSTA", 14, y);
  y += 10;

  const descW = (pageW - 28) * 0.6;
  const valW = (pageW - 28) * 0.4;

  autoTable(doc, {
    startY: y,
    theme: "plain",
    headStyles: { ...headStyles, halign: "left" as const },
    styles: { ...baseStyles, lineWidth: 0.2, lineColor: [220, 220, 220] as any },
    columnStyles: {
      0: { cellWidth: descW, halign: "left" as const },
      1: { cellWidth: valW, halign: "right" as const },
    },
    head: [["Descrição", "Valor"]],
    body: [
      ["Valor Total do Projeto", fmtBRL(params.valorProjeto)],
      ["Entrada (Implantação)", fmtBRL(params.entrada)],
      ["Dívida Financiada", fmtBRL(divida)],
      ["Volume Mínimo Anual (Fase 1)", `${fmtNum(volumeMin)} sacos`],
      ["Mensalidade Ano 1", fmtBRL(mensF1)],
      ["Mensalidade Ano 6", fmtBRL(mensF2)],
      ["Total Projetado 10 Anos", fmtBRL(totalGeral)],
      ["Reajuste Anual Estimado", `${params.reajuste.toLocaleString("pt-BR")}% (referência IPCA)`],
    ],
    alternateRowStyles: altRowStyles,
  });

  y = getLastY(doc) + 15;

  doc.setFontSize(11);
  doc.setTextColor(...GREEN);
  doc.text("OPÇÕES AO FINAL DO CONTRATO (Ano 10)", 14, y);
  y += 8;
  doc.setFontSize(9);
  doc.setTextColor(50);
  const options = [
    "1. Renovar o contrato e receber um novo equipamento com tecnologia atualizada.",
    "2. Continuar operando o equipamento atual, sob novo acordo de manutenção.",
    "3. Adquirir o equipamento por valor residual.",
  ];
  options.forEach(opt => {
    doc.text(opt, 14, y);
    y += 7;
  });

  y += 8;
  doc.setFontSize(11);
  doc.setTextColor(...GREEN);
  doc.text("CONDIÇÕES GERAIS", 14, y);
  y += 8;
  doc.setFontSize(9);
  doc.setTextColor(50);
  const conditions = [
    "• Diferencial de ICMS será por conta do cliente.",
    "• Frete: FOB",
    "• Despesas de parte elétrica e civil serão por conta do cliente.",
    "• Despesas de Munck, Guincho, empilhadeira e descarregamento dos equipamentos serão por conta do cliente.",
    "• Infraestrutura de TI serão por conta do cliente.",
  ];
  conditions.forEach(c => {
    doc.text(c, 14, y);
    y += 6;
  });

  y += 8;
  doc.setFontSize(9);
  doc.text(`MOEDA: Real (R$)`, 14, y); y += 6;
  doc.text(`VALIDADE DA OFERTA: ${params.validadeDias} dias.`, 14, y); y += 6;
  doc.text(`LUGAR DE ENTREGA: ${params.localEntrega || params.clienteEndereco || "A definir"}`, 14, y); y += 16;

  // Signature
  const sigX = 14;
  doc.setDrawColor(150);
  doc.line(sigX, y, sigX + 70, y);
  y += 5;
  doc.setFontSize(10);
  doc.setTextColor(30);
  doc.text("Damian Funes", sigX, y); y += 5;
  doc.setFontSize(9);
  doc.text("Dto. Comercial", sigX, y); y += 5;
  doc.text("Cel: +55 (44) 99818-7930", sigX, y); y += 5;
  doc.text("damian.funes@ls-arg.com", sigX, y);

  addFooter(doc);

  const fileName = `${params.numeroProposta || "proposta"}-${params.clientName || "cliente"}.pdf`.replace(/\s+/g, "_");
  doc.save(fileName);
}
