import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { OrcamentoParams, calcSubtotal, calcDescontoAplicado, calcTotal } from "./orcamento";
import { supabase } from "@/integrations/supabase/client";
import {
  toTitleCase,
  toSentenceCase,
  toUpperClean,
  normalizeEmail,
  normalizePhone,
  normalizeCnpj,
  normalizePrazo,
  sanitizeFilename,
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

  const clienteRaw = (params.clientName || "").trim();
  const clienteNome = clienteRaw && clienteRaw !== "—" && clienteRaw !== "-"
    ? toTitleCase(clienteRaw)
    : "";

  const rightLines: string[] = [
    `NÚMERO: ${params.numeroOrcamento || "—"}`,
    `DATA: ${new Date().toLocaleDateString("pt-BR")}`,
    `CLIENTE: ${clienteNome}`,
  ];
  if (params.clienteEndereco) rightLines.push(`ENDEREÇO: ${toTitleCase(params.clienteEndereco)}`);
  if (params.clienteTelefone) rightLines.push(`TEL: ${normalizePhone(params.clienteTelefone)}`);
  if (params.clienteCnpj) rightLines.push(`CNPJ: ${normalizeCnpj(params.clienteCnpj)}`);
  if (params.clienteEmail) rightLines.push(`E-MAIL: ${normalizeEmail(params.clienteEmail)}`);

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
        "LS DO BRASIL COMÉRCIO E INSTALAÇÕES INDUSTRIAIS LTDA\nAv. Marcelo Messias Busiquia, 197\nParque Industrial II, Maringá-PR\nCEP: 87065-006\nTEL: 44 3040-6098\nCNPJ: 23.108.428/0001-58",
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
  // Resolve nome do cliente via organização se estiver vazio ou "—"
  const rawName = (params.clientName || "").trim();
  if ((!rawName || rawName === "—" || rawName === "-") && params.organizacao_id) {
    try {
      const { data: org } = await supabase
        .from("organizacoes")
        .select("nome, endereco, telefone_principal, email_principal, cnpj")
        .eq("id", params.organizacao_id)
        .maybeSingle();
      if (org?.nome) {
        params = {
          ...params,
          clientName: org.nome,
          clienteEndereco: params.clienteEndereco || org.endereco || "",
          clienteTelefone: params.clienteTelefone || org.telefone_principal || "",
          clienteEmail: params.clienteEmail || org.email_principal || "",
          clienteCnpj: params.clienteCnpj || org.cnpj || "",
        };
      }
    } catch {/* ignore */}
  }

  const logoDataUrl = await preloadLogo();
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  const subtotal = calcSubtotal(params.itens);
  const desconto = calcDescontoAplicado(subtotal, params.descontoTipo, params.descontoValor);
  const total = calcTotal(params);

  addHeader(doc, params, logoDataUrl);
  let y = getLastY(doc) + 12;

  doc.setFontSize(10);
  doc.setTextColor(50);
  let contato = "";
  if (params.pessoa_contato_id) {
    try {
      const { data: pes } = await supabase
        .from("pessoas")
        .select("nome")
        .eq("id", params.pessoa_contato_id)
        .maybeSingle();
      if (pes?.nome) contato = toTitleCase(pes.nome);
    } catch {/* ignore */}
  }
  const introText = contato
    ? `At.: Sr(a).: ${contato}\nApresentamos abaixo o orçamento para os itens solicitados:`
    : `Apresentamos abaixo o orçamento para os itens solicitados:`;
  doc.text(introText, 14, y);
  y += contato ? 14 : 8;


  // Tabela de itens
  const itemRows = params.itens.map((it, i) => {
    const desc = toUpperClean(it.descricao.replace(/\s*\[.*?\]\s*/g, ""));
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
      0: { cellWidth: 16, halign: "center" },
      1: { cellWidth: "auto" as any },
      2: { cellWidth: 14, halign: "center" },
      3: { cellWidth: 32, halign: "right" },
      4: { cellWidth: 34, halign: "right" },
    },
    head: [["ITEM", "DESCRIÇÃO", "QTD", "VALOR UNIT.", "SUBTOTAL"]],
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
  const montagemTotal = Number(params.montagemPrecoTotal) || 0;
  if (montagemTotal > 0) totalsBody.push(["Montagem", fmtBRL(montagemTotal)]);

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
    footStyles: { fillColor: GREEN as any, textColor: WHITE as any, fontStyle: "bold", fontSize: 11, halign: "right", cellPadding: 4 },
  });

  y = getLastY(doc) + 12;

  const FOOTER_RESERVE = 18;
  const ensureSpace = (need: number) => {
    if (y + need > pageH - FOOTER_RESERVE) {
      doc.addPage();
      y = 20;
    }
  };

  // Condições
  ensureSpace(20);
  doc.setFontSize(11);
  doc.setTextColor(...GREEN);
  doc.text("CONDIÇÕES COMERCIAIS", 14, y);
  y += 7;
  doc.setFontSize(9);
  doc.setTextColor(50);

  const lines: string[] = [];

  let formaPagamentoTexto: string | null = null;
  if (params.formaPagamentoId) {
    const { data: fp } = await supabase
      .from("formas_pagamento")
      .select("descricao_proposta")
      .eq("id", params.formaPagamentoId)
      .maybeSingle();
    if (fp?.descricao_proposta) formaPagamentoTexto = fp.descricao_proposta;
  }
  if (!formaPagamentoTexto && params.condicoesPagamento) {
    formaPagamentoTexto = params.condicoesPagamento;
  }
  if (formaPagamentoTexto) {
    lines.push(`Forma de Pagamento: ${toSentenceCase(formaPagamentoTexto)}`);
  }
  if (params.prazoEntrega) {
    lines.push(`Prazo de entrega: ${normalizePrazo(params.prazoEntrega)}`);
  }
  lines.push(`Validade da oferta: ${params.validadeDias} dias`);
  const local = params.localEntrega || params.clienteEndereco;
  if (local) {
    lines.push(`Local de entrega: ${toTitleCase(local)}`);
  }
  lines.push("Moeda: Real (R$)");

  lines.forEach((l) => {
    const split = doc.splitTextToSize(l, pageW - 28);
    ensureSpace(split.length * 5);
    doc.text(split, 14, y);
    y += split.length * 5;
  });

  if (params.observacoes) {
    y += 4;
    ensureSpace(14);
    doc.setFontSize(11);
    doc.setTextColor(...GREEN);
    doc.text("OBSERVAÇÕES", 14, y);
    y += 7;
    doc.setFontSize(9);
    doc.setTextColor(50);
    const split = doc.splitTextToSize(toSentenceCase(params.observacoes), pageW - 28);
    ensureSpace(split.length * 5);
    doc.text(split, 14, y);
    y += split.length * 5;
  }

  // ============ GARANTIA ============
  y += 6;
  ensureSpace(60);
  doc.setFontSize(11);
  doc.setTextColor(...GREEN);
  doc.text("GARANTIA", 14, y);
  y += 7;

  doc.setFontSize(9);
  doc.setTextColor(50);

  const garantiaIntro = doc.splitTextToSize(
    "A LS oferece garantia de 12 (doze) meses sobre o equipamento, contados a partir da data de entrega, cobrindo reparos decorrentes de defeitos comprovados de material, montagem de fábrica ou fabricação.",
    pageW - 28
  );
  ensureSpace(garantiaIntro.length * 4.5 + 2);
  doc.text(garantiaIntro, 14, y);
  y += garantiaIntro.length * 4.5 + 2;

  const garantiaCondicao = doc.splitTextToSize(
    "A garantia está condicionada ao cumprimento integral do Plano de Manutenção LS, com revisões obrigatórias a cada 40.000 operações/ciclos do equipamento, devidamente registradas pelo cliente.",
    pageW - 28
  );
  ensureSpace(garantiaCondicao.length * 4.5 + 4);
  doc.text(garantiaCondicao, 14, y);
  y += garantiaCondicao.length * 4.5 + 4;

  ensureSpace(10);
  doc.setTextColor(...GREEN);
  doc.text("Não cobertos pela garantia:", 14, y);
  y += 5;
  doc.setTextColor(50);

  const garantiaExclusoes = [
    "Itens consumíveis e de desgaste natural (telas, peneiras, correias, filtros, vedações, mangueiras, lubrificantes, fusíveis, lâmpadas e similares).",
    "Equipamentos eletrônicos (CLPs, IHMs, sensores, drives) e mangueiras de bombas peristálticas, que seguem a garantia do respectivo fabricante, transladada ao cliente.",
  ];
  garantiaExclusoes.forEach((item) => {
    const wrapped = doc.splitTextToSize(`• ${item}`, pageW - 30);
    ensureSpace(wrapped.length * 4.5 + 1);
    doc.text(wrapped, 14, y);
    y += wrapped.length * 4.5 + 1;
  });

  y += 2;
  doc.setTextColor(100);
  const garantiaRodape = doc.splitTextToSize(
    "O Termo de Garantia LS completo, com todas as condições, exclusões e procedimentos de acionamento, é entregue como documento integrante desta proposta.",
    pageW - 28
  );
  ensureSpace(garantiaRodape.length * 4.5);
  doc.text(garantiaRodape, 14, y);
  y += garantiaRodape.length * 4.5;
  doc.setTextColor(50);
  // ============ FIM GARANTIA ============



  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    addFooter(doc);
  }

  const cleanNumero = sanitizeFilename(params.numeroOrcamento, "orcamento");
  const cleanClient = sanitizeFilename(toTitleCase(params.clientName), "cliente");
  const fileName = `${cleanNumero}-${cleanClient}.pdf`;

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
