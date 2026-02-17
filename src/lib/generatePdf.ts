import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { SmartCycleParams, YearProjection, calcDivida, calcVolumeMinimoAnual, formatBRL, formatNumber } from "./smartcycle";

const GREEN = [5, 150, 105] as const; // #059669
const GRAY_BG = [245, 245, 245] as const;
const WHITE = [255, 255, 255] as const;

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtNum(v: number) {
  return v.toLocaleString("pt-BR");
}

function addHeader(doc: jsPDF, params: SmartCycleParams) {
  const pageW = doc.internal.pageSize.getWidth();

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
        `NÚMERO: ${params.numeroProposta || "—"}\nDATA: ${new Date().toLocaleDateString("pt-BR")}\nCLIENTE: ${params.clientName}\nENDEREÇO: ${params.clienteEndereco || "—"}\nTEL: ${params.clienteTelefone || "—"}\nCNPJ: ${params.clienteCnpj || "—"}\nE-MAIL: ${params.clienteEmail || "—"}`,
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

export function generateProposalPdf(params: SmartCycleParams, projection: YearProjection[]) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const volumeMin = calcVolumeMinimoAnual(params);
  const volumeF2 = Math.round(volumeMin * (params.volumeMinF2Pct / 100));
  const divida = calcDivida(params);
  const subtotalF1 = projection.filter(r => r.fase === 1).reduce((s, r) => s + r.receitaAnual, 0);
  const subtotalF2 = projection.filter(r => r.fase === 2).reduce((s, r) => s + r.receitaAnual, 0);
  const totalGeral = params.entrada + subtotalF1 + subtotalF2;

  // ===== PAGE 1: Equipamentos =====
  addHeader(doc, params);
  let y = getLastY(doc) + 8;

  doc.setFontSize(9);
  doc.setTextColor(50);
  const introText = `At.: Sr(a).: ${params.contatoNome || params.clientName}\nNós estendemos nossa proposta SmartCycle LS para os equipamentos listados abaixo:`;
  doc.text(introText, 14, y);
  y += 14;

  const equipRows = params.itensProjeto.map((item, i) => [
    String(i + 1),
    `${item.descricao} [${item.codigo}]`,
    String(item.quantidade),
    fmtBRL(item.valor_custo),
    fmtBRL(item.subtotal),
  ]);

  autoTable(doc, {
    startY: y,
    theme: "grid",
    headStyles: { fillColor: GREEN as any, textColor: WHITE as any, fontStyle: "bold", fontSize: 8 },
    styles: { fontSize: 7, cellPadding: 2 },
    head: [["ÍTEM", "DESCRIÇÃO", "QTD", "VALOR UNIT.", "SUBTOTAL"]],
    body: equipRows,
    foot: [["", "", "", "CUSTO TOTAL (ENTRADA):", fmtBRL(params.entrada)]],
    footStyles: { fillColor: GRAY_BG as any, fontStyle: "bold", fontSize: 8 },
  });

  addFooter(doc);

  // ===== PAGE 2: Modelo SmartCycle =====
  doc.addPage();
  addHeader(doc, params);
  y = getLastY(doc) + 8;

  doc.setFontSize(12);
  doc.setTextColor(...GREEN);
  doc.text("MODELO OPERACIONAL SMARTCYCLE LS", 14, y);
  y += 8;

  doc.setFontSize(8);
  doc.setTextColor(50);
  const modelText = "O SmartCycle LS é um modelo de leasing operacional para centros de tratamento de sementes de alta performance. A LS permanece como proprietária do equipamento durante todo o contrato, enquanto o cliente o utiliza mediante pagamento por produção.";
  const splitModel = doc.splitTextToSize(modelText, pageW - 28);
  doc.text(splitModel, 14, y);
  y += splitModel.length * 4 + 6;

  doc.setFontSize(10);
  doc.setTextColor(...GREEN);
  doc.text("ESTRUTURA DO CONTRATO", 14, y);
  y += 6;

  const tarifaKgF1 = params.pesoPorSaco > 0 ? params.tarifaF1 / params.pesoPorSaco : 0;
  const tarifaKgF2 = params.pesoPorSaco > 0 ? params.tarifaF2 / params.pesoPorSaco : 0;
  const kgF1 = volumeMin * params.pesoPorSaco;
  const kgF2 = volumeF2 * params.pesoPorSaco;
  const mensF1 = (volumeMin * params.tarifaF1) / 12;
  const mensF2 = (volumeF2 * params.tarifaF2) / 12;

  autoTable(doc, {
    startY: y,
    theme: "grid",
    headStyles: { fillColor: GREEN as any, textColor: WHITE as any, fontStyle: "bold", fontSize: 8 },
    styles: { fontSize: 7, cellPadding: 2 },
    head: [["", "FASE 1 (Anos 1 a 5)", "FASE 2 (Anos 6 a 10)"]],
    body: [
      ["Tarifa por saco", fmtBRL(params.tarifaF1), fmtBRL(params.tarifaF2)],
      ["Tarifa por kg", fmtBRL(tarifaKgF1), fmtBRL(tarifaKgF2)],
      ["Volume mínimo anual", `${fmtNum(volumeMin)} sacos`, `${fmtNum(volumeF2)} sacos`],
      ["Equivalente em kg", `${fmtNum(kgF1)} kg`, `${fmtNum(kgF2)} kg`],
      ["Mensalidade (Ano 1 / Ano 6)", fmtBRL(mensF1), fmtBRL(mensF2)],
    ],
  });

  y = getLastY(doc) + 8;
  doc.setFontSize(10);
  doc.setTextColor(...GREEN);
  doc.text("POLÍTICA DE EXCEDENTES", 14, y);
  y += 6;
  doc.setFontSize(8);
  doc.setTextColor(50);
  const excKg = params.pesoPorSaco > 0 ? params.tarifaExcedente / params.pesoPorSaco : 0;
  const excText = `Produção acima do volume mínimo anual será cobrada a ${fmtBRL(params.tarifaExcedente)}/saco (${fmtBRL(excKg)}/kg). Apuração ao final de cada ano com pagamento em até 20 dias.`;
  const splitExc = doc.splitTextToSize(excText, pageW - 28);
  doc.text(splitExc, 14, y);

  addFooter(doc);

  // ===== PAGE 3: Projeção 10 anos =====
  doc.addPage();
  addHeader(doc, params);
  y = getLastY(doc) + 8;

  doc.setFontSize(12);
  doc.setTextColor(...GREEN);
  doc.text("PROJEÇÃO FINANCEIRA — 10 ANOS", 14, y);
  y += 8;

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
    headStyles: { fillColor: GREEN as any, textColor: WHITE as any, fontStyle: "bold", fontSize: 8 },
    styles: { fontSize: 7, cellPadding: 2 },
    head: [["ANO", "FASE", "PREÇO/SACO", "VOL. MÍNIMO", "MENSALIDADE", "RECEITA ANUAL"]],
    body: projRows,
    foot: [
      ["", "", "", "", "ENTRADA", fmtBRL(params.entrada)],
      ["", "", "", "", "FASE 1", fmtBRL(subtotalF1)],
      ["", "", "", "", "FASE 2", fmtBRL(subtotalF2)],
      ["", "", "", "", "TOTAL 10 ANOS", fmtBRL(totalGeral)],
    ],
    footStyles: { fillColor: GRAY_BG as any, fontStyle: "bold", fontSize: 8 },
  });

  addFooter(doc);

  // ===== PAGE 4: Resumo + Condições =====
  doc.addPage();
  addHeader(doc, params);
  y = getLastY(doc) + 8;

  doc.setFontSize(12);
  doc.setTextColor(...GREEN);
  doc.text("RESUMO DA PROPOSTA", 14, y);
  y += 8;

  autoTable(doc, {
    startY: y,
    theme: "grid",
    headStyles: { fillColor: GREEN as any, textColor: WHITE as any, fontStyle: "bold", fontSize: 8 },
    styles: { fontSize: 8, cellPadding: 3 },
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
  });

  y = getLastY(doc) + 8;

  doc.setFontSize(10);
  doc.setTextColor(...GREEN);
  doc.text("OPÇÕES AO FINAL DO CONTRATO (Ano 10)", 14, y);
  y += 6;
  doc.setFontSize(8);
  doc.setTextColor(50);
  const options = [
    "1. Renovar o contrato e receber um novo equipamento com tecnologia atualizada.",
    "2. Continuar operando o equipamento atual, sob novo acordo de manutenção.",
    "3. Adquirir o equipamento por valor residual.",
  ];
  options.forEach(opt => {
    doc.text(opt, 14, y);
    y += 5;
  });

  y += 4;
  doc.setFontSize(10);
  doc.setTextColor(...GREEN);
  doc.text("CONDIÇÕES GERAIS", 14, y);
  y += 6;
  doc.setFontSize(8);
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

  y += 4;
  doc.setFontSize(8);
  doc.text(`MOEDA: Real (R$)`, 14, y); y += 5;
  doc.text(`VALIDADE DA OFERTA: ${params.validadeDias} dias.`, 14, y); y += 5;
  doc.text(`LUGAR DE ENTREGA: ${params.localEntrega || params.clienteEndereco || "A definir"}`, 14, y); y += 12;

  doc.setFontSize(9);
  doc.setTextColor(30);
  doc.text("Damian Funes", 14, y); y += 4;
  doc.text("Dto. Comercial", 14, y); y += 4;
  doc.text("Cel: +55 (44) 99818-7930", 14, y); y += 4;
  doc.text("damian.funes@ls-arg.com", 14, y);

  addFooter(doc);

  // Download
  const fileName = `${params.numeroProposta || "proposta"}-${params.clientName || "cliente"}.pdf`.replace(/\s+/g, "_");
  doc.save(fileName);
}
