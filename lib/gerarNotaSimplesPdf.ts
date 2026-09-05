import { formatarMoeda } from "@/lib/format";
import type { Venda, LojaCompleta } from "@/types";

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
    if (cliente.endereco) {
      const numero = cliente.numero ? `, ${cliente.numero}` : "";
      linha(`End: ${cliente.endereco}${numero}`, { tamanho: 10 });
    }
    if (cliente.complemento) linha(cliente.complemento, { tamanho: 10 });
    if (cliente.cidade) linha(`Cidade: ${cliente.cidade}`, { tamanho: 10, espaco: 4 });
  }

  // Itens
  linha("Produtos", { negrito: true, tamanho: 10, espaco: 1 });
  for (const item of venda.venda_itens || []) {
    const nomeVariante = item.variante ? ` — ${item.variante}` : "";
    linha(`${item.quantidade}x ${item.nome_produto}${nomeVariante}`, { tamanho: 10, espaco: 0.5 });
    linha(formatarMoeda(item.total), { tamanho: 9, espaco: 2 });
  }

  y += 2;
  doc.setDrawColor(200);
  doc.line(margem, y, margem + largura, y);
  y += 5;

  linha(`Total: ${formatarMoeda(venda.total)}`, { negrito: true, tamanho: 12, espaco: 1 });
  linha(`Forma de pagamento: ${venda.forma_pagamento}`, { tamanho: 9 });

  if (venda.prazo_entrega_maximo) {
    linha(
      `Prazo máximo de entrega: ${new Date(venda.prazo_entrega_maximo).toLocaleDateString("pt-BR")}`,
      { tamanho: 9 }
    );
  }

  return doc.output("blob");
}
