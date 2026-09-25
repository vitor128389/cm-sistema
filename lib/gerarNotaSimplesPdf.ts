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

// Gera um PDF enxuto do pedido — só produto, cliente, endereço (com
// "Cidade: X" explícito) e total. Sem via da loja/cliente e sem
// assinatura, pensado pra mandar direto pelo WhatsApp.
//
// Importa o jsPDF dinamicamente (só dentro da função, em vez de no topo
// do arquivo) porque essa biblioteca usa coisas do navegador (window) que
// não existem durante o build do Next.js no servidor — import estático
// quebra o build de produção.
export async function gerarNotaSimplesPdf(venda: Venda, loja: LojaCompleta | null): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a5" });
  const margem = 12;
  const largura = doc.internal.pageSize.getWidth() - margem * 2;
  let y = margem;

  function linha(texto: string, opts: { negrito?: boolean; tamanho?: number; espaco?: number } = {}) {
    doc.setFont("helvetica", opts.negrito ? "bold" : "normal");
    doc.setFontSize(opts.tamanho ?? 10);
    const partes = doc.splitTextToSize(texto, largura);
    doc.text(partes, margem, y);
    y += partes.length * ((opts.tamanho ?? 10) * 0.42) + (opts.espaco ?? 1.5);
  }

  // Cabeçalho da loja
  linha(loja?.nome || "Caruaru Móveis", { negrito: true, tamanho: 14, espaco: 2 });
  if (loja?.telefone) linha(`Tel: ${loja.telefone}`, { tamanho: 9 });
  y += 2;
  doc.setDrawColor(200);
  doc.line(margem, y, margem + largura, y);
  y += 5;

  // Pedido
  linha(`Pedido #${venda.numero_pedido}`, { negrito: true, tamanho: 12 });
  linha(new Date(venda.criado_em).toLocaleString("pt-BR"), { tamanho: 9, espaco: 4 });

  // Cliente
  const cliente = venda.clientes;
  if (cliente) {
    linha("Cliente", { negrito: true, tamanho: 10, espaco: 1 });
    linha(cliente.nome, { tamanho: 10 });
    if (cliente.telefone) linha(`Cel: ${cliente.telefone}`, { tamanho: 10 });
    if (cliente.bairro) linha(`Bairro: ${cliente.bairro}`, { tamanho: 10 });
    if (cliente.endereco) {
      const numero = cliente.numero ? `, ${cliente.numero}` : "";
      linha(`End: ${cliente.endereco}${numero}`, { tamanho: 10 });
    }
    if (cliente.complemento) linha(cliente.complemento, { tamanho: 10 });
    if (cliente.cidade) linha(`Cidade: ${cliente.cidade}`, { tamanho: 10 });
    if (cliente.povoado) linha(`Povoado: ${cliente.povoado}`, { tamanho: 10, espaco: 4 });
  }

  // Itens
  const itensVenda = mesclarConjuntosSofa(venda.venda_itens || []);
  const todosRetirada =
    itensVenda.length > 0 &&
    itensVenda.every((i) => (i.quantidade_retirada ?? (i.retirada ? i.quantidade : 0)) >= i.quantidade);
  linha(todosRetirada ? "Produtos — RETIRADA NA LOJA" : "Produtos", { negrito: true, tamanho: 10, espaco: 1 });
  for (const item of itensVenda) {
    const nomeVariante = item.variante ? ` — ${item.variante}` : "";
    linha(`${item.quantidade}x ${item.nome_produto}${nomeVariante}`, { tamanho: 10, espaco: 0.5 });
    if (item.desconto && item.desconto > 0) {
      linha(
        `Desconto: ${formatarMoeda(item.desconto)}${item.motivo_desconto ? ` (${item.motivo_desconto})` : ""}`,
        { tamanho: 8, espaco: 0.5 }
      );
    }
    linha(formatarMoeda(item.total), { tamanho: 9, espaco: 2 });
  }

  y += 2;
  doc.setDrawColor(200);
  doc.line(margem, y, margem + largura, y);
  y += 5;

  const descontoItens = itensVenda.reduce((s, i) => s + (i.desconto || 0), 0);
  const descontoTotal = descontoItens + (venda.desconto_geral || 0);
  if (descontoTotal > 0) {
    linha(
      `Desconto: ${formatarMoeda(descontoTotal)}${venda.motivo_desconto_geral ? ` (${venda.motivo_desconto_geral})` : ""}`,
      { tamanho: 9 }
    );
  }
  if (venda.custo_adicional && venda.custo_adicional > 0) {
    linha(
      `Custo adicional: ${formatarMoeda(venda.custo_adicional)}${venda.descricao_custo_adicional ? ` (${venda.descricao_custo_adicional})` : ""}`,
      { tamanho: 9 }
    );
  }

  linha(`Total: ${formatarMoeda(venda.total)}`, { negrito: true, tamanho: 12, espaco: 1 });
  linha(`Forma de pagamento: ${venda.forma_pagamento}`, { tamanho: 9 });

  if (venda.prazo_entrega_maximo) {
    const dataFormatada = new Date(`${venda.prazo_entrega_maximo}T00:00:00`).toLocaleDateString("pt-BR");
    linha(
      venda.prazo_dias_uteis
        ? `PRAZO MÁXIMO: ${venda.prazo_dias_uteis} DIAS ÚTEIS — ATÉ ${dataFormatada}`
        : `Prazo máximo de entrega: ${dataFormatada}`,
      { tamanho: 9 }
    );
  }

  return doc.output("blob");
}
