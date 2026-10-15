import { formatarMoeda } from "@/lib/format";
import { calcularTotais, dataBrCurta, valorPrazo } from "@/lib/orcamento";
import type { DadosOrcamentoImpressao } from "@/components/ComprovanteOrcamento";

// PDF do orçamento (A4) no mesmo visual da nota que vai pro cliente:
// cabeçalho verde com a logo, card do cliente, tabela de produtos, totais
// em destaque, prazo/observações e rodapé. jsPDF é importado dentro da
// função porque usa window e quebraria o build no servidor.

type RGB = [number, number, number];
const VERDE: RGB = [12, 47, 23];
const DOURADO: RGB = [201, 150, 43];
const CINZA: RGB = [95, 99, 96];
const TEXTO: RGB = [33, 37, 34];
const FUNDO_SUAVE: RGB = [247, 245, 240];
const VERDE_CLARO: RGB = [232, 241, 236];

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

export async function gerarOrcamentoPdf(d: DadosOrcamentoImpressao): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const logo = await carregarLogo();
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const margem = 12;
  const largura = W - margem * 2;
  const rodapeAltura = 18;
  let y = 0;
  const t = calcularTotais(d.itens, d.desconto, d.frete);
  const mostraAvista = d.forma !== "prazo";
  const mostraPrazo = d.forma !== "avista";

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

  function rodape() {
    const n = doc.getNumberOfPages();
    for (let p = 1; p <= n; p++) {
      doc.setPage(p);
      traco(DOURADO, 0.5);
      doc.line(margem, H - rodapeAltura, W - margem, H - rodapeAltura);
      fonte(false, 7.5);
      cor(CINZA);
      doc.text(
        "Orçamento sem valor fiscal. Valores e disponibilidade podem mudar após a validade. A venda só é confirmada com o pagamento ou sinal.",
        W / 2,
        H - rodapeAltura + 5,
        { align: "center", maxWidth: largura }
      );
      fonte(true, 8);
      cor(VERDE);
      const info = [d.loja?.nome || "Caruaru Móveis", d.loja?.telefone ? `Tel: ${d.loja.telefone}` : ""].filter(Boolean).join("  •  ");
      doc.text(info, W / 2, H - rodapeAltura + 11, { align: "center" });
    }
  }

  function garantirEspaco(altura: number) {
    if (y + altura > H - rodapeAltura - 3) {
      doc.addPage();
      y = margem;
    }
  }

  // ===== Cabeçalho =====
  preencher(VERDE);
  doc.rect(0, 0, W, 36, "F");
  preencher(DOURADO);
  doc.rect(0, 36, W, 1.2, "F");
  if (logo) {
    const lw = 40;
    const lh = (lw * logo.h) / logo.w;
    doc.addImage(logo.data, "PNG", margem, (36 - lh) / 2, lw, lh);
  } else {
    fonte(true, 16);
    cor([255, 255, 255]);
    doc.text(d.loja?.nome || "Caruaru Móveis", margem, 20);
  }
  fonte(false, 8);
  cor([226, 200, 130]);
  doc.text("ORÇAMENTO", W - margem, 12, { align: "right", charSpace: 1.4 });
  fonte(true, 22);
  cor([255, 255, 255]);
  doc.text(d.numero ? `Nº ${d.numero}` : "—", W - margem, 22, { align: "right" });
  fonte(false, 8.5);
  cor([210, 225, 214]);
  doc.text(`Emitido em ${(d.criadoEm ? new Date(d.criadoEm) : new Date()).toLocaleDateString("pt-BR")}`, W - margem, 28, { align: "right" });
  if (d.validade) {
    fonte(true, 8.5);
    cor([226, 200, 130]);
    doc.text(`Válido até ${dataBrCurta(d.validade)}`, W - margem, 33, { align: "right" });
  }
  y = 44;

  // ===== Loja (linha pequena) =====
  const enderecoLoja = [
    [d.loja?.rua, d.loja?.numero].filter(Boolean).join(", "),
    d.loja?.bairro,
    [d.loja?.cidade, d.loja?.estado].filter(Boolean).join("/"),
  ].filter(Boolean).join(" - ");
  if (enderecoLoja || d.loja?.cnpj) {
    fonte(false, 8);
    cor(CINZA);
    doc.text([enderecoLoja, d.loja?.cnpj ? `CNPJ ${d.loja.cnpj}` : ""].filter(Boolean).join("   •   "), margem, y, { maxWidth: largura });
    y += 7;
  }

  // ===== Cliente =====
  const linhasCli = [d.clienteTelefone ? `Cel: ${d.clienteTelefone}` : "", d.clienteEndereco || ""].filter(Boolean);
  fonte(false, 9.5);
  const partes = linhasCli.flatMap((l) => doc.splitTextToSize(l, largura - 10) as string[]);
  const altCard = 13 + partes.length * 4.4 + 2;
  preencher(FUNDO_SUAVE);
  traco([228, 222, 210], 0.3);
  doc.roundedRect(margem, y, largura, altCard, 2, 2, "FD");
  preencher(DOURADO);
  doc.rect(margem, y + 2, 1.2, altCard - 4, "F");
  fonte(true, 7);
  cor(DOURADO);
  doc.text("CLIENTE", margem + 5, y + 5.5, { charSpace: 1 });
  fonte(true, 12);
  cor(TEXTO);
  doc.text(d.clienteNome, margem + 5, y + 11.5);
  fonte(false, 9.5);
  cor(CINZA);
  partes.forEach((l, i) => doc.text(l, margem + 5, y + 16.5 + i * 4.4));
  y += altCard + 7;

  // ===== Tabela =====
  const colQtd = margem + 3;
  const colProd = margem + 14;
  const colFim = W - margem - 3;
  const larguraCol = 30;
  // colunas de valor, da direita pra esquerda
  const colSub = colFim;
  const colPrazoUn = mostraPrazo ? colSub - 34 : 0;
  const colAvistaUn = mostraAvista ? (mostraPrazo ? colPrazoUn - larguraCol : colSub - 34) : 0;
  const limiteProd = (mostraAvista ? colAvistaUn : colPrazoUn) - larguraCol + 6;
  const larguraProd = Math.max(40, limiteProd - colProd);

  function cabecalhoTabela() {
    preencher(VERDE);
    doc.roundedRect(margem, y, largura, 7.5, 1.5, 1.5, "F");
    fonte(true, 7.5);
    cor([255, 255, 255]);
    doc.text("QTD", colQtd, y + 5);
    doc.text("PRODUTO", colProd, y + 5);
    if (mostraAvista) doc.text(mostraPrazo ? "UN. À VISTA" : "VALOR UN.", colAvistaUn, y + 5, { align: "right" });
    if (mostraPrazo) doc.text(mostraAvista ? "UN. A PRAZO" : "VALOR UN.", colPrazoUn, y + 5, { align: "right" });
    doc.text("SUBTOTAL", colSub, y + 5, { align: "right" });
    y += 9.5;
  }
  garantirEspaco(30);
  cabecalhoTabela();

  d.itens.forEach((item, idx) => {
    const nome = item.nome;
    fonte(true, 10);
    const nomeLinhas = doc.splitTextToSize(nome, larguraProd) as string[];
    fonte(false, 8.5);
    const varLinhas = item.variante && item.variante !== "Padrão" ? (doc.splitTextToSize(item.variante, larguraProd) as string[]) : [];
    const altura = 3.5 + nomeLinhas.length * 4.9 + varLinhas.length * 3.8 + 2.5;
    if (y + altura > H - rodapeAltura - 3) {
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
      yy += 4.9;
    });
    fonte(false, 8.5);
    cor(CINZA);
    varLinhas.forEach((l) => {
      doc.text(l, colProd, yy - 0.6);
      yy += 3.8;
    });
    fonte(false, 9.5);
    cor(TEXTO);
    if (mostraAvista) doc.text(formatarMoeda(item.valor_avista), colAvistaUn, y + 3.5, { align: "right" });
    if (mostraPrazo) doc.text(formatarMoeda(valorPrazo(item.valor_avista)), colPrazoUn, y + 3.5, { align: "right" });
    fonte(true, 10);
    const sub = (mostraAvista ? item.valor_avista : valorPrazo(item.valor_avista)) * item.quantidade;
    doc.text(formatarMoeda(sub), colSub, y + 3.5, { align: "right" });
    y += altura;
  });
  y += 4;

  // ===== Totais =====
  garantirEspaco(48);
  function linha(rotulo: string, valor: string, c: RGB = CINZA) {
    fonte(false, 9.5);
    cor(c);
    doc.text(rotulo, margem + 3, y);
    doc.text(valor, W - margem - 3, y, { align: "right" });
    y += 5;
  }
  if (t.desconto > 0) linha("Desconto", `- ${formatarMoeda(t.desconto)}`, [180, 60, 40]);
  if (t.frete > 0) linha("Frete / montagem", `+ ${formatarMoeda(t.frete)}`);
  if (t.desconto > 0 || t.frete > 0) y += 1.5;

  if (mostraAvista) {
    preencher(VERDE);
    doc.roundedRect(margem, y, largura, 12, 2, 2, "F");
    fonte(true, 9);
    cor([226, 200, 130]);
    doc.text("TOTAL À VISTA", margem + 5, y + 7.6, { charSpace: 1.2 });
    fonte(true, 15);
    cor([255, 255, 255]);
    doc.text(formatarMoeda(t.totalAvista), W - margem - 5, y + 8, { align: "right" });
    y += 15;
  }
  if (mostraPrazo) {
    const principal = !mostraAvista;
    preencher(principal ? VERDE : VERDE_CLARO);
    doc.roundedRect(margem, y, largura, principal ? 12 : 10.5, 2, 2, "F");
    fonte(true, principal ? 9 : 8.5);
    cor(principal ? [226, 200, 130] : VERDE);
    doc.text("TOTAL A PRAZO", margem + 5, y + (principal ? 7.6 : 6.9), { charSpace: 1.1 });
    fonte(true, principal ? 15 : 13);
    cor(principal ? [255, 255, 255] : VERDE);
    doc.text(formatarMoeda(t.totalPrazo), W - margem - 5, y + (principal ? 8 : 7.3), { align: "right" });
    y += principal ? 15 : 13.5;
  }
  y += 3;

  // ===== Prazo de entrega + observações =====
  if (d.prazoEntrega) {
    const texto = `PRAZO DE ENTREGA: ${d.prazoEntrega.toUpperCase()}`;
    fonte(true, 9);
    const p = doc.splitTextToSize(texto, largura - 8) as string[];
    const alt = p.length * 4.2 + 5;
    garantirEspaco(alt + 2);
    preencher([253, 246, 224]);
    traco(DOURADO, 0.4);
    doc.roundedRect(margem, y, largura, alt, 2, 2, "FD");
    cor([105, 76, 10]);
    p.forEach((l, i) => doc.text(l, W / 2, y + 5.2 + i * 4.2, { align: "center" }));
    y += alt + 7;
  }
  if (d.observacoes?.trim()) {
    fonte(true, 7);
    cor(DOURADO);
    garantirEspaco(14);
    doc.text("OBSERVAÇÕES", margem + 1, y, { charSpace: 1 });
    y += 4.5;
    fonte(false, 9.5);
    cor(TEXTO);
    (doc.splitTextToSize(d.observacoes.trim(), largura - 2) as string[]).forEach((l) => {
      garantirEspaco(5);
      doc.text(l, margem + 1, y);
      y += 4.6;
    });
  }

  rodape();
  return doc.output("blob");
}
