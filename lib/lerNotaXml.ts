import type { NotaLida, ItemNota } from "@/lib/lerNotaFiscal";

// Lê o XML da NF-e (nfeProc / NFe) no navegador e devolve no mesmo formato do leitor de PDF.
// O texto que o DANFE mostra embaixo do nome do produto (cor/acabamento) é o infAdProd do XML.
export function lerNotaXml(texto: string): NotaLida {
  const doc = new DOMParser().parseFromString(texto, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) throw new Error("Esse arquivo não é um XML válido.");

  const el = (pai: Element | Document, tag: string): Element | null => pai.getElementsByTagName(tag)[0] ?? null;
  const txt = (pai: Element | Document | null, tag: string) => (pai ? el(pai, tag)?.textContent?.trim() ?? "" : "");

  const inf = el(doc, "infNFe");
  if (!inf) throw new Error("Não encontrei uma NF-e nesse XML.");

  const chave = (inf.getAttribute("Id") || "").replace(/^NFe/, "") || txt(doc, "chNFe") || null;
  const numero = txt(el(inf, "ide"), "nNF") || null;
  const fornecedor = txt(el(inf, "emit"), "xNome") || null;

  const itens: ItemNota[] = Array.from(inf.getElementsByTagName("det")).map((det) => {
    const prod = el(det, "prod");
    const quantidade = parseFloat(txt(prod, "qCom")) || 0;
    const valorUnitario = parseFloat(txt(prod, "vUnCom")) || 0;
    return {
      codigo: `${det.getAttribute("nItem") || ""}[${txt(prod, "cProd")}]`,
      descricao: txt(prod, "xProd"),
      acabamento: txt(det, "infAdProd").replace(/\s+/g, " "),
      unidade: txt(prod, "uCom").toUpperCase(),
      quantidade,
      valorUnitario,
      valorTotal: parseFloat(txt(prod, "vProd")) || quantidade * valorUnitario,
    };
  });

  return { numero, chave, fornecedor, itens, totalItens: itens.reduce((s, i) => s + i.valorTotal, 0) };
}
