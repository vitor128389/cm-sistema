// Gera um PDF consolidado das encomendas de um período — soma a
// quantidade de cada produto (com a variante, quando tiver) de todas as
// lojas escolhidas, juntas. Pensado pra ver rapidinho o que encomendar do
// fornecedor sem ter que contar pedido por pedido.
//
// Importa o jsPDF dinamicamente (só dentro da função) porque essa
// biblioteca usa coisas do navegador (window) que não existem durante o
// build do Next.js no servidor — import estático quebra o build.
export interface ItemConsolidadoEncomenda {
  nome: string;
  quantidade: number;
}

export async function gerarRelatorioEncomendasPdf(
  itens: ItemConsolidadoEncomenda[],
  lojasNomes: string[],
  periodoTexto: string
): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const margem = 15;
  const largura = doc.internal.pageSize.getWidth() - margem * 2;
  let y = margem;

  function linha(texto: string, opts: { negrito?: boolean; tamanho?: number; espaco?: number } = {}) {
    doc.setFont("helvetica", opts.negrito ? "bold" : "normal");
    doc.setFontSize(opts.tamanho ?? 11);
    const partes = doc.splitTextToSize(texto, largura);
    doc.text(partes, margem, y);
    y += partes.length * ((opts.tamanho ?? 11) * 0.42) + (opts.espaco ?? 2);
  }

  function separador() {
    y += 2;
    doc.setDrawColor(200);
    doc.line(margem, y, margem + largura, y);
    y += 6;
  }

  linha("Relatório de Encomendas", { negrito: true, tamanho: 16, espaco: 3 });
  linha(`Loja(s): ${lojasNomes.join(", ")}`, { tamanho: 10 });
  linha(`Período: ${periodoTexto}`, { tamanho: 10, espaco: 4 });
  separador();

  if (itens.length === 0) {
    linha("Nenhuma encomenda encontrada nesse período.", { tamanho: 11 });
  } else {
    for (const item of itens) {
      if (y > doc.internal.pageSize.getHeight() - margem) {
        doc.addPage();
        y = margem;
      }
      linha(`${item.nome} — ${item.quantidade}`, { tamanho: 11, espaco: 2.5 });
    }
    separador();
    const totalGeral = itens.reduce((s, i) => s + i.quantidade, 0);
    linha(`Total de itens encomendados: ${totalGeral}`, { negrito: true, tamanho: 11 });
  }

  return doc.output("blob");
}
