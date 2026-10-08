import { formatarMoeda } from "@/lib/format";
import type { Venda, LojaCompleta, VendaItem } from "@/types";

// Sofá "2 e 3 lugares" vendido como conjunto vira 2 linhas no carrinho
// (uma peça de 2 e outra de 3 lugares) porque cada peça baixa do estoque
// separadamente — mas na impressão isso deve aparecer como 1 produto só.
function mesclarConjuntosSofa(itens: VendaItem[]): VendaItem[] {
  const resultado: VendaItem[] = [];
  const usados = new Set<number>();

  itens.forEach((item, i) => {
    if (usados.has(i)) return;
    const variante = item.variante || "";
    if (variante.endsWith("— 2 Lugares")) {
      const prefixo = variante.slice(0, -"2 Lugares".length);
      const idxPar = itens.findIndex(
        (outro, j) =>
          j !== i &&
          !usados.has(j) &&
          outro.nome_produto === item.nome_produto &&
          (outro.variante || "") === `${prefixo}3 Lugares` &&
          outro.tipo_entrega === item.tipo_entrega &&
          outro.retirada === item.retirada
      );
      if (idxPar !== -1) {
        const par = itens[idxPar];
        usados.add(i);
        usados.add(idxPar);
        const jaTemNoNome = item.nome_produto.toUpperCase().includes("2 E 3 LUGARES");
        const varianteFinal = jaTemNoNome
          ? prefixo.replace(/\s*—\s*$/, "").trim() || null
          : `${prefixo}2 e 3 Lugares`;
        resultado.push({
          ...item,
          variante: varianteFinal,
          total: item.total + par.total,
          desconto: (item.desconto || 0) + (par.desconto || 0),
        });
        return;
      }
    }
    resultado.push(item);
  });

  return resultado;
}

// Gera o PDF do pedido que vai pro cliente (WhatsApp): cabeçalho verde com
// a logo, dados do cliente, tabela de produtos (com a cor/tecido e as
// observações de cada item), totais, forma de pagamento e prazo.
//
// Importa o jsPDF dinamicamente (só dentro da função, em vez de no topo
// do arquivo) porque essa biblioteca usa coisas do navegador (window) que
// não existem durante o build do Next.js no servidor — import estático
// quebra o build de produção.

type RGB = [number, number, number];
const VERDE: RGB = [12, 47, 23];
const DOURADO: RGB = [201, 150, 43];
const CINZA: RGB = [95, 99, 96];
const TEXTO: RGB = [33, 37, 34];
const FUNDO_SUAVE: RGB = [247, 245, 240];

// Carrega a logo (public/logo.webp) e converte em PNG — o jsPDF não lê
// webp. Se falhar por qualquer motivo, o PDF sai só com o nome da loja.
async function carregarLogo(): Promise<{ data: string; w: number; h: number } | null> {
  try {
    const img = new Image();
    img.src = "/logo.webp";
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    return { data: canvas.toDataURL("image/png"), w: img.naturalWidth, h: img.naturalHeight };
  } catch {
    return null;
  }
}

export async function gerarNotaSimplesPdf(venda: Venda, loja: LojaCompleta | null): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const logo = await carregarLogo();
  const doc = new jsPDF({ unit: "mm", format: "a5" });
  const larguraPagina = doc.internal.pageSize.getWidth();
  const alturaPagina = doc.internal.pageSize.getHeight();
  const margem = 10;
  const largura = larguraPagina - margem * 2;
  const rodapeAltura = 16;
  let y = 0;

  const cor = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);
  const preencher = (c: RGB) => doc.setFillColor(c[0], c[1], c[2]);
  const traco = (c: RGB, w = 0.2) => {
    doc.setDrawColor(c[0], c[1], c[2]);
    doc.setLineWidth(w);
  };
  const fonte = (negrito: boolean, tamanho: number, italico = false) => {
    doc.setFont("helvetica", negrito ? (italico ? "bolditalic" : "bold") : italico ? "italic" : "normal");
    doc.setFontSize(tamanho);
  };
  const altLinha = (tamanho: number) => tamanho * 0.42;

  function rodape() {
    const n = doc.getNumberOfPages();
    for (let p = 1; p <= n; p++) {
      doc.setPage(p);
      traco(DOURADO, 0.5);
      doc.line(margem, alturaPagina - rodapeAltura, larguraPagina - margem, alturaPagina - rodapeAltura);
      fonte(true, 9);
      cor(VERDE);
      doc.text("Obrigado pela preferência!", larguraPagina / 2, alturaPagina - rodapeAltura + 5.5, { align: "center" });
      fonte(false, 7.5);
      cor(CINZA);
      const info = [loja?.nome || "Caruaru Móveis", loja?.telefone ? `Tel: ${loja.telefone}` : ""]
        .filter(Boolean)
        .join("  •  ");
      doc.text(info, larguraPagina / 2, alturaPagina - rodapeAltura + 10, { align: "center" });
    }
  }

  function garantirEspaco(altura: number) {
    if (y + altura > alturaPagina - rodapeAltura - 3) {
      doc.addPage();
      y = margem;
    }
  }

  // ===== Cabeçalho =====
  preencher(VERDE);
  doc.rect(0, 0, larguraPagina, 32, "F");
  preencher(DOURADO);
  doc.rect(0, 32, larguraPagina, 1.2, "F");

  if (logo) {
    const lw = 34;
    const lh = (lw * logo.h) / logo.w;
    doc.addImage(logo.data, "PNG", margem, (32 - lh) / 2, lw, lh);
  } else {
    fonte(true, 14);
    cor([255, 255, 255]);
    doc.text(loja?.nome || "Caruaru Móveis", margem, 18);
  }
  fonte(false, 7.5);
  cor([226, 200, 130]);
  doc.text("PEDIDO", larguraPagina - margem, 11, { align: "right", charSpace: 1.2 });
  fonte(true, 21);
  cor([255, 255, 255]);
  doc.text(`#${venda.numero_pedido}`, larguraPagina - margem, 20, { align: "right" });
  fonte(false, 8);
  cor([210, 225, 214]);
  doc.text(new Date(venda.criado_em).toLocaleString("pt-BR"), larguraPagina - margem, 26.5, { align: "right" });
  y = 40;

  // ===== Cliente =====
  const cliente = venda.clientes;
  if (cliente) {
    const linhasCli: string[] = [];
    if (cliente.telefone) linhasCli.push(`Cel: ${cliente.telefone}`);
    const rua = [
      cliente.endereco ? `${cliente.endereco}${cliente.numero ? `, ${cliente.numero}` : ""}` : "",
      cliente.bairro || "",
    ]
      .filter(Boolean)
      .join(" — ");
    if (rua) linhasCli.push(rua);
    if (cliente.complemento) linhasCli.push(cliente.complemento);
    const local = [cliente.cidade ? `Cidade: ${cliente.cidade}` : "", cliente.povoado ? `Povoado: ${cliente.povoado}` : ""]
      .filter(Boolean)
      .join("   •   ");
    if (local) linhasCli.push(local);

    fonte(false, 9);
    const partes = linhasCli.flatMap((l) => doc.splitTextToSize(l, largura - 10) as string[]);
    const altCard = 12 + partes.length * 4.2 + 2;
    preencher(FUNDO_SUAVE);
    traco([228, 222, 210], 0.3);
    doc.roundedRect(margem, y, largura, altCard, 2, 2, "FD");
    preencher(DOURADO);
    doc.rect(margem, y + 2, 1.2, altCard - 4, "F");

    fonte(true, 7);
    cor(DOURADO);
    doc.text("CLIENTE", margem + 5, y + 5.5, { charSpace: 1 });
    fonte(true, 11);
    cor(TEXTO);
    doc.text(cliente.nome, margem + 5, y + 11);
    fonte(false, 9);
    cor(CINZA);
    partes.forEach((l, i) => doc.text(l, margem + 5, y + 16 + i * 4.2));
    y += altCard + 6;
  }

  // ===== Produtos =====
  const itensVenda = mesclarConjuntosSofa(venda.venda_itens || []);
  const todosRetirada =
    itensVenda.length > 0 &&
    itensVenda.every((i) => (i.quantidade_retirada ?? (i.retirada ? i.quantidade : 0)) >= i.quantidade);

  const colQtd = margem + 3;
  const colProd = margem + 14;
  const colValor = larguraPagina - margem - 3;
  const larguraProd = colValor - colProd - 24;

  function cabecalhoTabela() {
    preencher(VERDE);
    doc.roundedRect(margem, y, largura, 7, 1.5, 1.5, "F");
    fonte(true, 8);
    cor([255, 255, 255]);
    doc.text("QTD", colQtd, y + 4.8);
    doc.text(todosRetirada ? "PRODUTO  —  RETIRADA NA LOJA" : "PRODUTO", colProd, y + 4.8);
    doc.text("VALOR", colValor, y + 4.8, { align: "right" });
    y += 9;
  }
  garantirEspaco(30);
  cabecalhoTabela();

  itensVenda.forEach((item, idx) => {
    fonte(true, 10);
    const nomeLinhas = doc.splitTextToSize(item.nome_produto, larguraProd) as string[];
    fonte(false, 8.5);
    const varLinhas = item.variante ? (doc.splitTextToSize(item.variante, larguraProd) as string[]) : [];
    fonte(false, 8.5, true);
    const obsLinhas = item.observacao ? (doc.splitTextToSize(`Obs: ${item.observacao}`, larguraProd - 4) as string[]) : [];
    const temDesconto = !!(item.desconto && item.desconto > 0);

    const altura =
      3 +
      nomeLinhas.length * altLinha(10) * 1.15 +
      varLinhas.length * 3.8 +
      (obsLinhas.length ? obsLinhas.length * 3.7 + 3 : 0) +
      (temDesconto ? 4 : 0) +
      3;

    if (y + altura > alturaPagina - rodapeAltura - 3) {
      doc.addPage();
      y = margem;
      cabecalhoTabela();
    }

    if (idx % 2 === 0) {
      preencher(FUNDO_SUAVE);
      doc.rect(margem, y - 1, largura, altura, "F");
    }

    let yy = y + 3.5;
    fonte(true, 10);
    cor(VERDE);
    doc.text(`${item.quantidade}x`, colQtd, yy);
    cor(TEXTO);
    nomeLinhas.forEach((l) => {
      doc.text(l, colProd, yy);
      yy += altLinha(10) * 1.15;
    });
    fonte(false, 8.5);
    cor(CINZA);
    varLinhas.forEach((l) => {
      doc.text(l, colProd, yy + 0.3);
      yy += 3.8;
    });
    if (obsLinhas.length) {
      yy += 1;
      const hObs = obsLinhas.length * 3.7 + 1.6;
      preencher([253, 246, 224]);
      doc.rect(colProd, yy - 2.8, larguraProd, hObs, "F");
      preencher(DOURADO);
      doc.rect(colProd, yy - 2.8, 0.9, hObs, "F");
      fonte(false, 8.5, true);
      cor([105, 76, 10]);
      obsLinhas.forEach((l) => {
        doc.text(l, colProd + 2.5, yy);
        yy += 3.7;
      });
      yy += 0.8;
    }
    if (temDesconto) {
      fonte(false, 8);
      cor([180, 60, 40]);
      doc.text(
        `Desconto: ${formatarMoeda(item.desconto!)}${item.motivo_desconto ? ` (${item.motivo_desconto})` : ""}`,
        colProd,
        yy + 0.8
      );
    }
    fonte(true, 10);
    cor(TEXTO);
    doc.text(formatarMoeda(item.total), colValor, y + 3.5, { align: "right" });
    y += altura;
  });

  y += 3;

  // ===== Totais =====
  const descontoItens = itensVenda.reduce((s, i) => s + (i.desconto || 0), 0);
  const descontoTotal = descontoItens + (venda.desconto_geral || 0);
  const temExtra = descontoTotal > 0 || (venda.custo_adicional && venda.custo_adicional > 0);
  garantirEspaco(temExtra ? 40 : 28);

  function linhaTotal(rotulo: string, valor: string, destaque?: RGB) {
    fonte(false, 9);
    cor(destaque || CINZA);
    const rot = doc.splitTextToSize(rotulo, largura - 40) as string[];
    doc.text(rot, margem + 3, y);
    doc.text(valor, larguraPagina - margem - 3, y, { align: "right" });
    y += rot.length * 4 + 0.8;
  }
  if (descontoTotal > 0) {
    linhaTotal(
      `Desconto${venda.motivo_desconto_geral ? ` (${venda.motivo_desconto_geral})` : ""}`,
      `- ${formatarMoeda(descontoTotal)}`,
      [180, 60, 40]
    );
  }
  if (venda.custo_adicional && venda.custo_adicional > 0) {
    linhaTotal(
      `Custo adicional${venda.descricao_custo_adicional ? ` (${venda.descricao_custo_adicional})` : ""}`,
      `+ ${formatarMoeda(venda.custo_adicional)}`
    );
  }
  if (temExtra) y += 1.5;

  preencher(VERDE);
  doc.roundedRect(margem, y, largura, 11, 2, 2, "F");
  fonte(true, 9);
  cor([226, 200, 130]);
  doc.text("TOTAL", margem + 5, y + 7, { charSpace: 1.2 });
  fonte(true, 14);
  cor([255, 255, 255]);
  doc.text(formatarMoeda(venda.total), larguraPagina - margem - 5, y + 7.3, { align: "right" });
  y += 16;

  // ===== Pagamento =====
  const pagamentos = venda.venda_pagamentos || [];
  garantirEspaco(10 + Math.max(pagamentos.length, 1) * 5);
  fonte(true, 7);
  cor(DOURADO);
  doc.text("PAGAMENTO", margem + 1, y, { charSpace: 1 });
  y += 4.5;
  fonte(false, 9.5);
  cor(TEXTO);
  if (venda.forma_pagamento === "Dividido" && pagamentos.length > 0) {
    pagamentos.forEach((pg) => {
      const parc = pg.parcelas > 1 ? ` em ${pg.parcelas}x de ${formatarMoeda(pg.valor / pg.parcelas)}` : "";
      doc.text(`${pg.forma_pagamento}${parc}`, margem + 1, y);
      doc.text(formatarMoeda(pg.valor), larguraPagina - margem - 1, y, { align: "right" });
      y += 5;
    });
  } else {
    const parc = venda.parcelas > 1 ? ` em ${venda.parcelas}x de ${formatarMoeda(venda.total / venda.parcelas)}` : "";
    doc.text(`${venda.forma_pagamento}${parc}`, margem + 1, y);
    y += 5;
  }
  y += 2;

  // ===== Prazo =====
  if (venda.prazo_entrega_maximo) {
    const dataFormatada = new Date(`${venda.prazo_entrega_maximo}T00:00:00`).toLocaleDateString("pt-BR");
    const texto = venda.prazo_dias_uteis
      ? `PRAZO MÁXIMO DE ENTREGA: ${venda.prazo_dias_uteis} DIAS ÚTEIS — ATÉ ${dataFormatada}`
      : `PRAZO MÁXIMO DE ENTREGA: ${dataFormatada}`;
    fonte(true, 8.5);
    const partes = doc.splitTextToSize(texto, largura - 8) as string[];
    const alt = partes.length * 4 + 5;
    garantirEspaco(alt + 2);
    preencher([253, 246, 224]);
    traco(DOURADO, 0.4);
    doc.roundedRect(margem, y, largura, alt, 2, 2, "FD");
    cor([105, 76, 10]);
    partes.forEach((l, i) => doc.text(l, larguraPagina / 2, y + 5 + i * 4, { align: "center" }));
    y += alt + 2;
  }

  rodape();
  return doc.output("blob");
}
