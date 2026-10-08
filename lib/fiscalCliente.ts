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

function urlDanfe(notaId: string) {
  return `/api/fiscal/danfe?notaId=${encodeURIComponent(notaId)}`;
}

function criarIframe(src: string, largura: string): Promise<HTMLIFrameElement> {
  return new Promise((resolve, reject) => {
    const f = document.createElement("iframe");
    f.style.cssText = `position:fixed;left:-10000px;top:0;width:${largura};height:800px;border:0;`;
    f.onload = () => resolve(f);
    f.onerror = () => reject(new Error("Não consegui abrir o DANFE."));
    f.src = src;
    document.body.appendChild(f);
  });
}

// Abre a janela de impressão do navegador (com a lista de impressoras) para o cupom.
export async function imprimirDanfe(notaId: string): Promise<void> {
  const chk = await fetch(urlDanfe(notaId));
  if (!chk.ok) throw new Error((await chk.json().catch(() => ({}))).error || "Não consegui abrir o DANFE.");
  const f = await criarIframe(urlDanfe(notaId), "400px");
  f.style.left = "0";
  f.style.opacity = "0";
  f.style.pointerEvents = "none";
  f.contentWindow?.focus();
  f.contentWindow?.print();
  setTimeout(() => f.remove(), 5 * 60 * 1000);
}

// Gera um PDF do cupom (80 mm de largura) e baixa.
export async function baixarDanfePdf(notaId: string, nomeArquivo: string): Promise<void> {
  const chk = await fetch(urlDanfe(notaId));
  if (!chk.ok) throw new Error((await chk.json().catch(() => ({}))).error || "Não consegui abrir o DANFE.");
  const f = await criarIframe(urlDanfe(notaId), "320px");
  try {
    const doc = f.contentDocument;
    if (!doc) throw new Error("Não consegui ler o DANFE.");
    await new Promise((r) => setTimeout(r, 400)); // deixa imagens/estilos assentarem
    const alturaPx = Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight);
    const larguraMm = 80;
    const alturaMm = Math.ceil((alturaPx * larguraMm) / 320) + 4;
    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF({ unit: "mm", format: [larguraMm, alturaMm] });
    await pdf.html(doc.body, { x: 0, y: 0, width: larguraMm, windowWidth: 320, autoPaging: false });
    pdf.save(nomeArquivo);
  } finally {
    f.remove();
  }
}
