import { formatarMoeda } from "@/lib/format";
import type { TurnoCaixa, LojaCompleta, Sangria } from "@/types";

// Gera um relatório em PDF do turno de caixa — pensado pra mandar direto
// pelo WhatsApp pra quem precisar conferir o fechamento.
//
// Importa o jsPDF dinamicamente (só dentro da função) porque essa
// biblioteca usa coisas do navegador (window) que não existem durante o
// build do Next.js no servidor — import estático quebra o build.
export async function gerarRelatorioCaixaPdf(
  turno: TurnoCaixa,
  nomeCaixa: string,
  loja: LojaCompleta | null,
  qtdVendas: number,
  sangrias: Sangria[]
): Promise<Blob> {
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

  function separador() {
    y += 2;
    doc.setDrawColor(200);
    doc.line(margem, y, margem + largura, y);
    y += 5;
  }

  // Cabeçalho da loja
  linha(loja?.nome || "Caruaru Móveis", { negrito: true, tamanho: 14, espaco: 2 });
  if (loja?.telefone) linha(`Tel: ${loja.telefone}`, { tamanho: 9 });
  separador();

  // Caixa
  linha(`Relatório de Caixa — ${nomeCaixa}`, { negrito: true, tamanho: 12 });
  linha(
    `Aberto em: ${new Date(turno.aberto_em).toLocaleString("pt-BR")}`,
    { tamanho: 9 }
  );
  linha(
    turno.status === "fechado" && turno.fechado_em
      ? `Fechado em: ${new Date(turno.fechado_em).toLocaleString("pt-BR")}`
      : "Status: ainda aberto",
    { tamanho: 9, espaco: 4 }
  );

  // Vendas
  linha("Vendas do turno", { negrito: true, tamanho: 10, espaco: 1 });
  linha(`Quantidade de vendas: ${qtdVendas}`, { tamanho: 10 });
  const ticketMedio = qtdVendas > 0 ? (turno.total_vendido || 0) / qtdVendas : 0;
  linha(`Ticket médio: ${formatarMoeda(ticketMedio)}`, { tamanho: 10, espaco: 4 });

  // Totais por forma de pagamento
  linha("Totais por forma de pagamento", { negrito: true, tamanho: 10, espaco: 1 });
  linha(`Fundo inicial: ${formatarMoeda(turno.fundo_inicial || 0)}`, { tamanho: 10 });
  linha(`Dinheiro (vendas): ${formatarMoeda(turno.total_dinheiro || 0)}`, { tamanho: 10 });
  linha(`Pix: ${formatarMoeda(turno.total_pix || 0)}`, { tamanho: 10 });
  linha(`Débito: ${formatarMoeda(turno.total_debito || 0)}`, { tamanho: 10 });
  linha(`Crédito: ${formatarMoeda(turno.total_credito || 0)}`, { tamanho: 10 });
  linha(`Link de pagamento: ${formatarMoeda(turno.total_link || 0)}`, { tamanho: 10 });
  if (turno.total_devolvido) {
    linha(`Devolvido (trocas): ${formatarMoeda(turno.total_devolvido)}`, { tamanho: 10 });
  }
  y += 3;

  // Sangrias
  if (sangrias.length > 0) {
    linha("Sangrias (retiradas do caixa)", { negrito: true, tamanho: 10, espaco: 1 });
    for (const s of sangrias) {
      linha(
        `${formatarMoeda(s.valor)} — ${s.motivo}${s.usuarios?.nome ? ` (${s.usuarios.nome})` : ""}`,
        { tamanho: 9, espaco: 0.5 }
      );
    }
    const totalSangrias = sangrias.reduce((sum, s) => sum + s.valor, 0);
    linha(`Total de sangrias: ${formatarMoeda(totalSangrias)}`, { tamanho: 10, espaco: 4 });
  }

  separador();

  // Resumo final
  const totalCartao = (turno.total_debito || 0) + (turno.total_credito || 0);
  const totalGeral =
    (turno.total_dinheiro || 0) + (turno.total_pix || 0) + totalCartao + (turno.total_link || 0);
  const totalSangrias = sangrias.reduce((sum, s) => sum + s.valor, 0);
  const saldoDinheiro = (turno.fundo_inicial || 0) + (turno.total_dinheiro || 0) - totalSangrias;

  linha(`Total vendido no turno: ${formatarMoeda(totalGeral)}`, { negrito: true, tamanho: 12, espaco: 2 });
  linha(`Saldo esperado em dinheiro no caixa: ${formatarMoeda(saldoDinheiro)}`, { negrito: true, tamanho: 11 });

  return doc.output("blob");
}
