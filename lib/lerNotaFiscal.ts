/**
 * Leitura de DANFE (PDF de NF-e) no navegador, sem servidor.
 * 1) pdf.js extrai o texto e remonta as linhas pela posição vertical;
 * 2) `interpretarLinhasNota` transforma as linhas em itens.
 */

export interface ItemNota {
  codigo: string;
  descricao: string; // nome do produto na nota
  acabamento: string; // cor/acabamento (linhas abaixo do nome), só informativo
  unidade: string;
  quantidade: number;
  valorUnitario: number; // sem IPI
  valorTotal: number;
}

export interface NotaLida {
  numero: string | null;
  chave: string | null;
  fornecedor: string | null;
  itens: ItemNota[];
  totalItens: number;
}

const num = (s: string) => parseFloat(s.replace(/\./g, "").replace(",", "."));

const RE_ITEM =
  /^(\d+)\s*\[(\d+)\]\s+(.+?)\s+(\d{8})\s+\d{3}\s+\d{4}\s+([A-Za-z]{1,3})\s+([\d.]+,\d+)\s+([\d.]+,\d+)\s+([\d.]+,\d+)/;

export function interpretarLinhasNota(linhasBrutas: string[]): NotaLida {
  const linhas = linhasBrutas.map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const texto = linhas.join("\n");

  const fornecedor = texto.match(/RECEBEMOS DE (.+?),? OS PRODUTOS/)?.[1]?.trim() ?? null;
  const numero = texto.match(/N[º°o]\s*(\d{3,9})\b/)?.[1] ?? null;
  // a chave tem 44 dígitos e traz o número da nota nas posições 25-33; assim
  // dá pra achar a janela certa mesmo se vierem dígitos de linhas vizinhas
  let chave: string | null = null;
  for (const run of texto.match(/(?:\d{4} ?){11,}/g) ?? []) {
    const d = run.replace(/\s/g, "");
    for (let i = 0; i + 44 <= d.length && !chave; i++) {
      const cand = d.slice(i, i + 44);
      if (numero && cand.slice(25, 34) === numero.padStart(9, "0")) chave = cand;
    }
    if (!chave && d.length >= 44) chave = d.slice(-44);
    if (chave) break;
  }

  const itens: ItemNota[] = [];
  let atual: ItemNota | null = null;
  for (const l of linhas) {
    const m = l.match(RE_ITEM);
    if (m) {
      atual = {
        codigo: `${m[1]}[${m[2]}]`,
        descricao: m[3].trim(),
        acabamento: "",
        unidade: m[5].toUpperCase(),
        quantidade: num(m[6]),
        valorUnitario: num(m[7]),
        valorTotal: num(m[8]),
      };
      itens.push(atual);
      continue;
    }
    // linhas de continuação (acabamento + EAN) até começar outra seção
    if (atual && !/DADOS|CÓD PROD|FOLHA|CHAVE|DANFE|CÁLCULO|TRANSPORT|DADOS ADIC|PÁGINA/i.test(l) && !/^\d{1,3}(\.\d{3})*,\d{2}\b/.test(l)) {
      const limpo = l.replace(/EAN:?\s*\d*/gi, "").replace(/^\d{8,14}$/, "").trim();
      if (limpo && atual.acabamento.length < 60 && !/^[A-Z ]+:/.test(limpo) && limpo.length < 60) {
        atual.acabamento = (atual.acabamento + " " + limpo).trim();
      }
    } else if (/DADOS ADIC|CÁLCULO DO IMPOSTO|TRANSPORTADOR/i.test(l)) {
      atual = null;
    }
  }

  const totalItens = itens.reduce((s, i) => s + i.valorTotal, 0);
  return { numero, chave, fornecedor, itens, totalItens };
}

/** Extrai o texto de um PDF (File) e devolve as linhas na ordem de leitura. */
export async function lerPdfComoLinhas(dados: ArrayBuffer): Promise<string[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf");
  if (typeof window !== "undefined") {
    pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
  }
  const doc = await pdfjs.getDocument({ data: dados, useSystemFonts: true, disableFontFace: true }).promise;
  const saida: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const pagina = await doc.getPage(p);
    const conteudo = await pagina.getTextContent();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pedacos = (conteudo.items as any[])
      .filter((i) => typeof i.str === "string" && i.str.trim())
      .map((i) => ({ x: i.transform[4] as number, y: i.transform[5] as number, s: i.str as string }));
    pedacos.sort((a, b) => b.y - a.y || a.x - b.x);
    const grupos: { y: number; partes: { x: number; s: string }[] }[] = [];
    for (const pc of pedacos) {
      const g = grupos.find((g) => Math.abs(g.y - pc.y) <= 2.5);
      if (g) g.partes.push({ x: pc.x, s: pc.s });
      else grupos.push({ y: pc.y, partes: [{ x: pc.x, s: pc.s }] });
    }
    grupos.sort((a, b) => b.y - a.y);
    for (const g of grupos) {
      g.partes.sort((a, b) => a.x - b.x);
      saida.push(g.partes.map((x) => x.s).join(" "));
    }
  }
  return saida;
}
