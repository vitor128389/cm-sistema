import { formatarMoeda } from "@/lib/format";
import type { TurnoCaixa, LojaCompleta, Sangria } from "@/types";

// Uma venda "achatada" com tudo que o relatório detalhado precisa —
// montada a partir dos dados reais de vendas + venda_itens +
// venda_pagamentos + clientes (nunca texto fixo).
export interface VendaDetalhadaRelatorio {
  numero_pedido: number;
  criado_em: string;
  forma_pagamento: string;
  parcelas: number;
  subtotal: number;
  ajuste: number;
  total: number;
  cliente_nome: string | null;
  cliente_cpf: string | null;
  cliente_telefone: string | null;
  itens: {
    nome_produto: string;
    variante: string | null;
    quantidade: number;
    total: number;
    tipo_entrega: string;
    desconto: number;
    origem_loja_nome: string | null; // só preenchido quando é diferente da loja da venda
  }[];
  pagamentos: { forma_pagamento: string; parcelas: number; valor: number }[];
}

function formatarCpf(cpf?: string | null): string {
  if (!cpf) return "";
  const digitos = cpf.replace(/\D/g, "");
  if (digitos.length !== 11) return cpf;
  return `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-${digitos.slice(9)}`;
}

// Gera o relatório detalhado — venda por venda — de um turno de caixa
// inteiro. Layout compacto, com quebra de página automática (mantendo o
// cabeçalho) quando o conteúdo não cabe numa folha só.
export async function gerarRelatorioDetalhadoCaixaPdf(
  turno: TurnoCaixa,
  nomeCaixa: string,
  loja: LojaCompleta | null,
  vendas: VendaDetalhadaRelatorio[],
  sangrias: Sangria[]
): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const margem = 12;
  const largura = doc.internal.pageSize.getWidth() - margem * 2;
  const alturaPagina = doc.internal.pageSize.getHeight();
  let y = margem;

  function novaPagina() {
    doc.addPage();
    y = margem;
    cabecalhoCompacto();
  }

  function garantirEspaco(alturaNecessaria: number) {
    if (y + alturaNecessaria > alturaPagina - margem) {
      novaPagina();
    }
  }

  function linha(texto: string, opts: { negrito?: boolean; tamanho?: number; espaco?: number; cor?: number[] } = {}) {
    doc.setFont("helvetica", opts.negrito ? "bold" : "normal");
    doc.setFontSize(opts.tamanho ?? 9);
    if (opts.cor) doc.setTextColor(opts.cor[0], opts.cor[1], opts.cor[2]);
    else doc.setTextColor(20, 20, 20);
    const partes = doc.splitTextToSize(texto, largura);
    garantirEspaco(partes.length * ((opts.tamanho ?? 9) * 0.4) + (opts.espaco ?? 1));
    doc.text(partes, margem, y);
    y += partes.length * ((opts.tamanho ?? 9) * 0.4) + (opts.espaco ?? 1);
  }

  function separador() {
    garantirEspaco(3);
    doc.setDrawColor(210);
    doc.line(margem, y, margem + largura, y);
    y += 3;
  }

  function cabecalhoCompacto() {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(18, 60, 46);
    doc.text(`Movimento detalhado — ${loja?.nome || "Loja"} · ${nomeCaixa}`, margem, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text(
      `Aberto: ${new Date(turno.aberto_em).toLocaleString("pt-BR")}` +
        (turno.fechado_em ? `   Fechado: ${new Date(turno.fechado_em).toLocaleString("pt-BR")}` : "   Ainda aberto"),
      margem,
      y
    );
    y += 5;
    doc.setDrawColor(18, 60, 46);
    doc.setLineWidth(0.5);
    doc.line(margem, y, margem + largura, y);
    doc.setLineWidth(0.2);
    y += 5;
  }

  cabecalhoCompacto();

  // ---------------- venda por venda ----------------
  for (const v of vendas) {
    garantirEspaco(14); // reserva um respiro pro cabeçalho da venda não ficar sozinho no fim da página

    linha(
      `PEDIDO #${v.numero_pedido} — ${new Date(v.criado_em).toLocaleString("pt-BR")}`,
      { negrito: true, tamanho: 10, espaco: 1, cor: [18, 60, 46] }
    );

    const linhaCliente = [
      v.cliente_nome ? `Cliente: ${v.cliente_nome}` : null,
      v.cliente_cpf ? `CPF: ${formatarCpf(v.cliente_cpf)}` : null,
      v.cliente_telefone ? `Tel: ${v.cliente_telefone}` : null,
    ]
      .filter(Boolean)
      .join("   ·   ");
    if (linhaCliente) linha(linhaCliente, { tamanho: 8.5, espaco: 0.5 });

    const descontoTotalVenda = v.itens.reduce((s, i) => s + (i.desconto || 0), 0);

    for (const item of v.itens) {
      const qtdTexto = `${item.quantidade}x`;
      const situacao = item.tipo_entrega === "encomenda" ? "ENCOMENDA" : "PRONTA ENTREGA";
      const unitario = item.quantidade >= 2 ? ` · Unit.: ${formatarMoeda(item.total / item.quantidade)}` : "";
      const origem = item.origem_loja_nome ? ` · (${item.origem_loja_nome})` : "";
      linha(
        `${qtdTexto} ${item.nome_produto}${item.variante ? ` — ${item.variante}` : ""} — ${situacao}${origem}${unitario} — ${formatarMoeda(
          item.total
        )}`,
        { tamanho: 8.5, espaco: 0.5 }
      );
      if (item.desconto > 0) {
        linha(`   Desconto no item: ${formatarMoeda(item.desconto)}`, { tamanho: 8, espaco: 0.5, cor: [158, 37, 37] });
      }
    }

    if (v.pagamentos.length > 1) {
      linha(
        `Pagamento dividido: ${v.pagamentos
          .map((p) => `${p.forma_pagamento}${p.parcelas > 1 ? ` ${p.parcelas}x` : ""}: ${formatarMoeda(p.valor)}`)
          .join("   ·   ")}`,
        { tamanho: 8.5, espaco: 0.5 }
      );
    } else {
      linha(
        `Pagamento: ${v.forma_pagamento}${v.parcelas > 1 ? ` ${v.parcelas}x` : ""}`,
        { tamanho: 8.5, espaco: 0.5 }
      );
    }

    const linhaResumo = [
      `Subtotal: ${formatarMoeda(v.subtotal)}`,
      descontoTotalVenda > 0 ? `Desconto: ${formatarMoeda(descontoTotalVenda)}` : null,
      v.ajuste > 0 ? `Acréscimo: ${formatarMoeda(v.ajuste)}` : null,
    ]
      .filter(Boolean)
      .join("   ·   ");
    linha(linhaResumo, { tamanho: 8.5, espaco: 0.5 });
    linha(`TOTAL: ${formatarMoeda(v.total)}`, { negrito: true, tamanho: 9.5, espaco: 1 });

    separador();
  }

  if (vendas.length === 0) {
    linha("Nenhuma venda registrada nesse caixa.", { tamanho: 9, espaco: 2 });
  }

  // ---------------- resumo final ----------------
  garantirEspaco(60);
  linha("RESUMO DO CAIXA", { negrito: true, tamanho: 11, espaco: 2, cor: [18, 60, 46] });

  const brutoVendido = vendas.reduce((s, v) => s + v.subtotal + v.ajuste, 0);
  const descontoTotalCaixa = vendas.reduce(
    (s, v) => s + v.itens.reduce((si, i) => si + (i.desconto || 0), 0),
    0
  );
  const liquidoVendido = vendas.reduce((s, v) => s + v.total, 0);
  const totalSangrias = sangrias.reduce((s, sg) => s + sg.valor, 0);

  linha(`Quantidade de vendas: ${vendas.length}`, { tamanho: 9, espaco: 0.5 });
  linha(`Valor bruto vendido: ${formatarMoeda(brutoVendido)}`, { tamanho: 9, espaco: 0.5 });
  linha(`Total de descontos concedidos: ${formatarMoeda(descontoTotalCaixa)}`, { tamanho: 9, espaco: 0.5 });
  linha(`Valor líquido das vendas: ${formatarMoeda(liquidoVendido)}`, { tamanho: 9, espaco: 0.5 });
  linha(`Dinheiro: ${formatarMoeda(turno.total_dinheiro || 0)}`, { tamanho: 9, espaco: 0.5 });
  linha(`Pix: ${formatarMoeda(turno.total_pix || 0)}`, { tamanho: 9, espaco: 0.5 });
  linha(
    `Cartão (débito + crédito): ${formatarMoeda((turno.total_debito || 0) + (turno.total_credito || 0))}`,
    { tamanho: 9, espaco: 0.5 }
  );
  if (turno.total_link) {
    linha(`Link de pagamento: ${formatarMoeda(turno.total_link)}`, { tamanho: 9, espaco: 0.5 });
  }
  if (turno.total_devolvido) {
    linha(`Dinheiro devolvido (trocas): ${formatarMoeda(turno.total_devolvido)}`, { tamanho: 9, espaco: 0.5 });
  }
  if (sangrias.length > 0) {
    linha(`Sangrias: ${formatarMoeda(totalSangrias)}`, { tamanho: 9, espaco: 0.5 });
    for (const s of sangrias) {
      linha(`   ${formatarMoeda(s.valor)} — ${s.motivo}${s.usuarios?.nome ? ` (${s.usuarios.nome})` : ""}`, {
        tamanho: 8,
        espaco: 0.5,
        cor: [100, 100, 100],
      });
    }
  }
  separador();
  linha(`TOTAL FINAL DO CAIXA: ${formatarMoeda(turno.total_vendido || 0)}`, {
    negrito: true,
    tamanho: 11,
    espaco: 1,
    cor: [18, 60, 46],
  });

  return doc.output("blob");
}
