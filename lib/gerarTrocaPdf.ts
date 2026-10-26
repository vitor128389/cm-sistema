import { formatarMoeda } from "@/lib/format";
import { mesclarConjuntosSofa } from "@/components/ComprovanteTroca";
import type { ItemRestante } from "@/lib/trocaContexto";
import type { LojaCompleta, TrocaGrupo } from "@/types";

type RGB = [number, number, number];
const VERDE: RGB = [12, 47, 23];
const DOURADO: RGB = [201, 150, 43];
const CINZA: RGB = [95, 99, 96];
const TEXTO: RGB = [33, 37, 34];
const FUNDO_SUAVE: RGB = [247, 245, 240];
const AZUL: RGB = [29, 78, 122];
const LARANJA: RGB = [194, 102, 13];

function origem(i: { tipo_entrega?: string | null; origem_deposito?: boolean | null }): { texto: string; cor: RGB } {
  if (i.tipo_entrega === "encomenda") return { texto: "ENCOMENDA", cor: LARANJA };
  if (i.origem_deposito) return { texto: "DEPÓSITO", cor: AZUL };
  return { texto: "PRONTA ENTREGA", cor: VERDE };
}

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

interface LinhaPdf {
  quantidade: number;
  nome: string;
  variante: string | null;
  origem: { texto: string; cor: RGB };
  valor?: number;
}

// PDF da nota da TROCA (o que vai pro cliente no WhatsApp): produtos
// devolvidos, novos produtos, diferença e a situação final do pedido.
export async function gerarTrocaPdf(
  troca: TrocaGrupo,
  restantes: ItemRestante[],
  loja: LojaCompleta | null
): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const logo = await carregarLogo();
  const doc = new jsPDF({ unit: "mm", format: "a5" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const margem = 10;
  const largura = W - margem * 2;
  const rodapeAltura = 16;
  let y = 0;

  const cor = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);
  const preencher = (c: RGB) => doc.setFillColor(c[0], c[1], c[2]);
  const traco = (c: RGB, w = 0.2) => {
    doc.setDrawColor(c[0], c[1], c[2]);
    doc.setLineWidth(w);
  };
  const fonte = (negrito: boolean, tamanho: number) => {
    doc.setFont("helvetica", negrito ? "bold" : "normal");
    doc.setFontSize(tamanho);
  };

  const tipoPreco = troca.tipo_preco === "aprazo" ? "aprazo" : "avista";
  const valorDe = (v: { valor_unitario_avista: number; valor_unitario_aprazo: number }) =>
    tipoPreco === "avista" ? v.valor_unitario_avista : v.valor_unitario_aprazo;

  const devolvidos: LinhaPdf[] = mesclarConjuntosSofa(troca.trocas_devolvidos || []).map((d) => ({
    quantidade: d.quantidade,
    nome: d.produto_nome,
    variante: d.variante,
    origem: origem(d),
    valor: valorDe(d) * d.quantidade,
  }));
  const novosMesclados = mesclarConjuntosSofa(troca.trocas_novos || []);
  const novos: LinhaPdf[] = novosMesclados.map((n) => ({
    quantidade: n.quantidade,
    nome: n.produto_nome,
    variante: n.variante,
    origem: origem(n),
    valor: valorDe(n) * n.quantidade,
  }));
  const finais: LinhaPdf[] = mesclarConjuntosSofa([
    ...restantes.map((r) => ({ ...r, tipo_entrega: r.tipo_entrega ?? null })),
    ...novosMesclados.map((n) => ({
      id: n.id,
      produto_nome: n.produto_nome,
      variante: n.variante,
      quantidade: n.quantidade,
      valor_unitario_avista: n.valor_unitario_avista,
      valor_unitario_aprazo: n.valor_unitario_aprazo,
      tipo_entrega: n.tipo_entrega,
      origem_deposito: n.origem_deposito,
    })),
  ]).map((i) => ({
    quantidade: i.quantidade,
    nome: i.produto_nome,
    variante: i.variante,
    origem: origem(i),
    valor: valorDe(i) * i.quantidade,
  }));
  const totalFinal = finais.reduce((t, f) => t + (f.valor || 0), 0);

  function rodape() {
    const n = doc.getNumberOfPages();
    for (let p = 1; p <= n; p++) {
      doc.setPage(p);
      traco(DOURADO, 0.5);
      doc.line(margem, H - rodapeAltura, W - margem, H - rodapeAltura);
      fonte(true, 9);
      cor(VERDE);
      doc.text("Obrigado pela preferência!", W / 2, H - rodapeAltura + 5.5, { align: "center" });
      fonte(false, 7.5);
      cor(CINZA);
      const info = [loja?.nome || "Caruaru Móveis", loja?.telefone ? `Tel: ${loja.telefone}` : ""].filter(Boolean).join("  •  ");
      doc.text(info, W / 2, H - rodapeAltura + 10, { align: "center" });
    }
  }
  function garantirEspaco(altura: number) {
    if (y + altura > H - rodapeAltura - 3) {
      doc.addPage();
      y = margem;
    }
  }

  // Cabeçalho
  preencher(VERDE);
  doc.rect(0, 0, W, 32, "F");
  preencher(DOURADO);
  doc.rect(0, 32, W, 1.2, "F");
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
  doc.text("TROCA", W - margem, 11, { align: "right", charSpace: 1.2 });
  fonte(true, 21);
  cor([255, 255, 255]);
  doc.text(`#${troca.numero_troca}`, W - margem, 20, { align: "right" });
  fonte(false, 8);
  cor([210, 225, 214]);
  doc.text(
    `Pedido original #${troca.vendas?.numero_pedido ?? ""} · ${new Date(troca.criado_em).toLocaleString("pt-BR")}`,
    W - margem,
    26.5,
    { align: "right" }
  );
  y = 40;

  // Cliente
  const c = troca.vendas?.clientes;
  if (c) {
    const linhas: string[] = [];
    if (c.telefone) linhas.push(`Cel: ${c.telefone}`);
    const rua = [c.endereco ? `${c.endereco}${c.numero ? `, ${c.numero}` : ""}` : "", c.bairro || ""].filter(Boolean).join(" — ");
    if (rua) linhas.push(rua);
    if (c.complemento) linhas.push(c.complemento);
    const local = [c.cidade ? `Cidade: ${c.cidade}` : "", c.povoado ? `Povoado: ${c.povoado}` : ""].filter(Boolean).join("   •   ");
    if (local) linhas.push(local);
    fonte(false, 9);
    const partes = linhas.flatMap((l) => doc.splitTextToSize(l, largura - 10) as string[]);
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
    doc.text(c.nome, margem + 5, y + 11);
    fonte(false, 9);
    cor(CINZA);
    partes.forEach((l, i) => doc.text(l, margem + 5, y + 16 + i * 4.2));
    y += altCard + 6;
  }

  const colQtd = margem + 3;
  const colProd = margem + 14;
  const colValor = W - margem - 3;

  function secao(titulo: string, linhas: LinhaPdf[], mostrarValor: boolean) {
    garantirEspaco(20);
    preencher(VERDE);
    doc.roundedRect(margem, y, largura, 7, 1.5, 1.5, "F");
    fonte(true, 8);
    cor([255, 255, 255]);
    doc.text("QTD", colQtd, y + 4.8);
    doc.text(titulo, colProd, y + 4.8);
    if (mostrarValor) doc.text("VALOR", colValor, y + 4.8, { align: "right" });
    y += 9;
    const larguraProd = colValor - colProd - (mostrarValor ? 24 : 4);
    linhas.forEach((l, idx) => {
      fonte(true, 10);
      const nomeLinhas = doc.splitTextToSize(`${l.nome} (${l.origem.texto})`, larguraProd) as string[];
      fonte(false, 8.5);
      const varLinhas = l.variante ? (doc.splitTextToSize(l.variante, larguraProd) as string[]) : [];
      const altura = 3 + nomeLinhas.length * 4.8 + varLinhas.length * 3.8 + 3;
      garantirEspaco(altura);
      if (idx % 2 === 0) {
        preencher(FUNDO_SUAVE);
        doc.rect(margem, y - 1, largura, altura, "F");
      }
      let yy = y + 3.5;
      fonte(true, 10);
      cor(VERDE);
      doc.text(`${l.quantidade}x`, colQtd, yy);
      nomeLinhas.forEach((t) => {
        // pinta só o "(ORIGEM)" com a cor da origem
        const m = /^(.*)(\([^)]*\))$/.exec(t);
        if (m) {
          cor(TEXTO);
          doc.text(m[1].trimEnd(), colProd, yy);
          const w = doc.getTextWidth(m[1].trimEnd() + " ");
          cor(l.origem.cor);
          doc.text(m[2], colProd + w, yy);
        } else {
          cor(TEXTO);
          doc.text(t, colProd, yy);
        }
        yy += 4.8;
      });
      fonte(false, 8.5);
      cor(CINZA);
      varLinhas.forEach((t) => {
        doc.text(t, colProd, yy + 0.3);
        yy += 3.8;
      });
      if (mostrarValor && l.valor !== undefined) {
        fonte(true, 10);
        cor(TEXTO);
        doc.text(formatarMoeda(l.valor), colValor, y + 3.5, { align: "right" });
      }
      y += altura;
    });
    y += 3;
  }

  secao("PRODUTOS DEVOLVIDOS", devolvidos, true);
  secao("NOVOS PRODUTOS", novos, true);

  // Diferença
  const diferenca = troca.diferenca;
  garantirEspaco(26);
  fonte(false, 8);
  cor(CINZA);
  doc.text(`Cálculo feito com preço ${tipoPreco === "avista" ? "à vista" : "a prazo"}.`, margem + 1, y);
  y += 5;
  if (diferenca !== 0 || true) {
    preencher(VERDE);
    doc.roundedRect(margem, y, largura, 11, 2, 2, "F");
    fonte(true, 9);
    cor([226, 200, 130]);
    const rotulo = diferenca > 0 ? "CLIENTE PAGA" : diferenca < 0 ? "DEVOLVIDO AO CLIENTE" : "DIFERENÇA";
    doc.text(rotulo, margem + 5, y + 7, { charSpace: 1.2 });
    fonte(true, 14);
    cor([255, 255, 255]);
    const valor = diferenca > 0 ? troca.valor_cobrado_diferenca ?? diferenca : Math.abs(diferenca);
    doc.text(formatarMoeda(valor), W - margem - 5, y + 7.3, { align: "right" });
    y += 14;
  }
  if (diferenca !== 0 && troca.forma_pagamento_diferenca) {
    fonte(false, 9.5);
    cor(TEXTO);
    const parc = troca.parcelas_diferenca && troca.parcelas_diferenca > 1 ? ` em ${troca.parcelas_diferenca}x` : "";
    doc.text(`Forma de pagamento: ${troca.forma_pagamento_diferenca}${parc}`, margem + 1, y);
    y += 6;
  }

  secao("SITUAÇÃO FINAL DO PEDIDO", finais, true);
  garantirEspaco(14);
  preencher(VERDE);
  doc.roundedRect(margem, y, largura, 11, 2, 2, "F");
  fonte(true, 9);
  cor([226, 200, 130]);
  doc.text("TOTAL QUE FICOU", margem + 5, y + 7, { charSpace: 1.2 });
  fonte(true, 14);
  cor([255, 255, 255]);
  doc.text(formatarMoeda(totalFinal), W - margem - 5, y + 7.3, { align: "right" });
  y += 14;

  rodape();
  return doc.output("blob");
}
