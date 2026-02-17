import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { SmartCycleParams, YearProjection, calcDivida, calcVolumeMinimoAnual } from "./smartcycle";
import { LS_LOGO_BASE64 } from "@/constants/ls-logo";

const GREEN = [5, 150, 105] as const;
const WHITE = [255, 255, 255] as const;
const GRAY_LIGHT = [243, 244, 246] as const;
const BLACK = [0, 0, 0] as const;

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtNum(v: number) {
  return v.toLocaleString("pt-BR");
}

function drawLogoFallback(doc: jsPDF, x: number, y: number) {
  doc.setFillColor(5, 150, 105);
  doc.roundedRect(x, y, 12, 12, 2, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("LS", x + 6, y + 7.5, { align: "center" });
  doc.setTextColor(5, 150, 105);
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.text("do Brasil", x + 14, y + 7.5);
  doc.setTextColor(0, 0, 0);
}

function addHeader(doc: jsPDF, params: SmartCycleParams, logoDataUrl: string | null) {
  const pageW = doc.internal.pageSize.getWidth();

  // Add logo image or fallback
  let logoRendered = false;
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, "PNG", 14, 8, 28, 14);
      logoRendered = true;
    } catch (e) {
      console.error("Logo addImage error:", e);
    }
  }
  if (!logoRendered) {
    drawLogoFallback(doc, 14, 10);
  }

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
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: GREEN as any, textColor: WHITE as any, fontStyle: "bold", fontSize: 8 },
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

const compactStyles = { fontSize: 8, cellPadding: 2 };
const baseStyles = { fontSize: 9, cellPadding: 3 };
const headStyles = { fillColor: GREEN as any, textColor: WHITE as any, fontStyle: "bold" as const, fontSize: 9 };
const altRowStyles = { fillColor: [249, 250, 251] as any };

async function preloadLogo(): Promise<string | null> {
  // Try loading from Supabase Storage first
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (supabaseUrl) {
    const storageUrl = `${supabaseUrl}/storage/v1/object/public/assets/ls-logo.png`;
    const result = await loadImageAsBase64(storageUrl);
    if (result) return result;
  }

  // Fallback: try the inline base64
  const result = await loadImageAsBase64(LS_LOGO_BASE64);
  if (result) return result;

  return null;
}

function loadImageAsBase64(src: string): Promise<string | null> {
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
      img.src = src;
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
  const subtotalF1 = projection.filter(r => r.fase === 1).reduce((s, r) => s + r.receitaAnual, 0);
  const subtotalF2 = projection.filter(r => r.fase === 2).reduce((s, r) => s + r.receitaAnual, 0);
  // Total para o cliente: Implantação (valorProjeto) + receitas das fases
  const totalGeralCliente = params.valorProjeto + subtotalF1 + subtotalF2;
  const mensF1 = (volumeMin * params.tarifaF1) / 12;
  const mensF2 = (volumeF2 * params.tarifaF2) / 12;

  // ===== PAGE 1: Equipamentos (SEM valores de custo) =====
  addHeader(doc, params, logoDataUrl);
  let y = getLastY(doc) + 12;

  doc.setFontSize(10);
  doc.setTextColor(50);
  const introText = `At.: Sr(a).: ${params.contatoNome || params.clientName}\nNós estendemos nossa proposta SmartCycle LS para os equipamentos listados abaixo:`;
  doc.text(introText, 14, y);
  y += 14;

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
  doc.setFontSize(12);
  doc.setTextColor(...GREEN);
  doc.setFont(undefined as any, "bold");
  doc.text(`VALOR DA IMPLANTAÇÃO: ${fmtBRL(params.valorProjeto)}`, 14, y);
  doc.setFont(undefined as any, "normal");

  addFooter(doc);

  // ===== PAGE 2: Modelo SmartCycle =====
  doc.addPage();
  addHeader(doc, params, logoDataUrl);
  y = getLastY(doc) + 12;

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

  // ===== PAGE 3: Projeção 10 anos (gráfico + tabela compacta — tudo em 1 página) =====
  doc.addPage();
  addHeader(doc, params, logoDataUrl);
  y = getLastY(doc) + 10;

  doc.setFontSize(12);
  doc.setTextColor(...GREEN);
  doc.text("PROJEÇÃO FINANCEIRA — 10 ANOS", 14, y);
  y += 8;

  // Bar chart — canvas menor para caber na página
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 720;
    canvas.height = 220;
    document.body.appendChild(canvas);
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const data = projection.map(r => r.receitaAnual);
      const colors = projection.map(r => r.fase === 1 ? "#10b981" : "#6ee7b7");
      const barWidth = 48;
      const gap = 20;
      const maxVal = Math.max(...data);
      const chartHeight = 170;
      const startX = 35;
      const startY = 195;

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, 720, 220);

      data.forEach((val, i) => {
        const barH = maxVal > 0 ? (val / maxVal) * chartHeight : 0;
        const x = startX + i * (barWidth + gap);
        const yBar = startY - barH;
        ctx.fillStyle = colors[i];
        ctx.fillRect(x, yBar, barWidth, barH);
        ctx.fillStyle = "#374151";
        ctx.font = "11px Arial";
        ctx.textAlign = "center";
        ctx.fillText(`Ano ${i + 1}`, x + barWidth / 2, startY + 14);
        ctx.fillStyle = "#6b7280";
        ctx.font = "9px Arial";
        const valK = (val / 1000).toFixed(0) + "k";
        ctx.fillText(valK, x + barWidth / 2, yBar - 4);
      });

      // Legend
      ctx.fillStyle = "#10b981";
      ctx.fillRect(220, 3, 12, 12);
      ctx.fillStyle = "#374151";
      ctx.font = "11px Arial";
      ctx.textAlign = "left";
      ctx.fillText("Fase 1", 237, 13);
      ctx.fillStyle = "#6ee7b7";
      ctx.fillRect(290, 3, 12, 12);
      ctx.fillStyle = "#374151";
      ctx.fillText("Fase 2", 307, 13);

      const chartImage = canvas.toDataURL("image/png");
      doc.addImage(chartImage, "PNG", 14, y, 170, 45);
      y += 48;
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
    headStyles: { ...headStyles, fontSize: 8 },
    styles: compactStyles,
    alternateRowStyles: altRowStyles,
    head: [["ANO", "FASE", "PREÇO/SACO", "VOL. MÍNIMO", "MENSALIDADE", "RECEITA ANUAL"]],
    body: projRows,
    foot: [
      ["", "", "", "", "IMPLANTAÇÃO", fmtBRL(params.valorProjeto)],
      ["", "", "", "", "FASE 1", fmtBRL(subtotalF1)],
      ["", "", "", "", "FASE 2", fmtBRL(subtotalF2)],
      ["", "", "", "", "TOTAL 10 ANOS", fmtBRL(totalGeralCliente)],
    ],
    footStyles: { fillColor: GRAY_LIGHT as any, textColor: BLACK as any, fontStyle: "bold", fontSize: 8 },
    pageBreak: "avoid" as any,
    didParseCell(data) {
      if (data.section === "foot" && data.row.index === 3) {
        data.cell.styles.textColor = GREEN as any;
        data.cell.styles.fillColor = WHITE as any;
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fontSize = 10;
      }
    },
  });

  addFooter(doc);

  // ===== PAGE 4: Resumo + Condições + Assinatura =====
  doc.addPage();
  addHeader(doc, params, logoDataUrl);
  y = getLastY(doc) + 12;

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
      ["Implantação", fmtBRL(params.valorProjeto)],
      ["Volume Mínimo Anual (Fase 1)", `${fmtNum(volumeMin)} sacos`],
      ["Volume Mínimo Anual (Fase 2)", `${fmtNum(volumeF2)} sacos`],
      ["Mensalidade Ano 1", fmtBRL(mensF1)],
      ["Mensalidade Ano 6", fmtBRL(mensF2)],
      ["Total Projetado 10 Anos", fmtBRL(totalGeralCliente)],
      ["Reajuste Anual Estimado", `${params.reajuste.toLocaleString("pt-BR")}% (referência IPCA)`],
    ],
    alternateRowStyles: altRowStyles,
  });

  y = getLastY(doc) + 12;

  doc.setFontSize(11);
  doc.setTextColor(...GREEN);
  doc.text("OPÇÕES AO FINAL DO CONTRATO (Ano 10)", 14, y);
  y += 7;
  doc.setFontSize(9);
  doc.setTextColor(50);
  const options = [
    "1. Renovar o contrato e receber um novo equipamento com tecnologia atualizada.",
    "2. Continuar operando o equipamento atual, sob novo acordo de manutenção.",
    "3. Adquirir o equipamento por valor residual.",
  ];
  options.forEach(opt => {
    doc.text(opt, 14, y);
    y += 6;
  });

  y += 6;
  doc.setFontSize(11);
  doc.setTextColor(...GREEN);
  doc.text("CONDIÇÕES GERAIS", 14, y);
  y += 7;
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
    y += 5;
  });

  y += 6;
  doc.setFontSize(9);
  doc.text(`MOEDA: Real (R$)`, 14, y); y += 5;
  doc.text(`VALIDADE DA OFERTA: ${params.validadeDias} dias.`, 14, y); y += 5;
  doc.text(`LUGAR DE ENTREGA: ${params.localEntrega || params.clienteEndereco || "A definir"}`, 14, y); y += 14;

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
