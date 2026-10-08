// Chamadas do navegador para as rotas de nota fiscal (app/api/fiscal/*).
export interface NotaFiscal {
  id: string;
  venda_id: string;
  loja_id: string | null;
  ambiente: "homologacao" | "producao";
  status: "processando" | "autorizada" | "erro" | "cancelada";
  numero: string | null;
  serie: string | null;
  chave: string | null;
  mensagem: string | null;
  url_danfe: string | null;
  url_xml: string | null;
  criado_em: string;
}

export async function chamarFiscal(rota: "emitir" | "consultar" | "cancelar", corpo: Record<string, unknown>): Promise<NotaFiscal> {
  const resp = await fetch(`/api/fiscal/${rota}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  const json = await resp.json();
  if (!resp.ok) throw new Error(json.error || "Erro ao falar com a nota fiscal.");
  return json.nota as NotaFiscal;
}

async function buscarPdf(notaId: string, baixar: boolean): Promise<Blob> {
  const resp = await fetch(`/api/fiscal/danfe?notaId=${encodeURIComponent(notaId)}${baixar ? "&baixar=1" : ""}`);
  if (!resp.ok) {
    let msg = "Não consegui abrir o DANFE.";
    try {
      msg = (await resp.json()).error || msg;
    } catch {}
    throw new Error(msg);
  }
  return await resp.blob();
}

// Abre direto a janela de impressão (escolher a impressora), sem baixar arquivo.
export async function imprimirDanfe(notaId: string): Promise<void> {
  const blob = await buscarPdf(notaId, false);
  const url = URL.createObjectURL(blob);
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  iframe.src = url;
  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      window.open(url, "_blank"); // plano B: abre o PDF e imprime pelo visualizador
    }
  };
  document.body.appendChild(iframe);
  setTimeout(() => {
    iframe.remove();
    URL.revokeObjectURL(url);
  }, 5 * 60 * 1000);
}

// Baixa o PDF do DANFE.
export async function baixarDanfePdf(notaId: string, nomeArquivo: string): Promise<void> {
  const blob = await buscarPdf(notaId, true);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
