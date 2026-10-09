// Chamadas do navegador para as rotas de nota fiscal (app/api/fiscal/*).
export interface NotaFiscal {
  id: string;
  venda_id: string;
  tipo: "nfce" | "nfe";
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

export async function chamarFiscal(rota: "emitir" | "emitir-nfe" | "consultar" | "cancelar", corpo: Record<string, unknown>): Promise<NotaFiscal> {
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

// NFC-e: o DANFE é uma página HTML (cupom). NF-e: o DANFE é um PDF (A4).
// Busca uma vez só e guarda na memória: o 2º clique (imprimir depois de baixar) é instantâneo.
const cacheDanfe = new Map<string, { pdf: boolean; blob: Blob }>();

async function tipoDoDanfe(notaId: string): Promise<{ pdf: boolean; blob: Blob }> {
  const guardado = cacheDanfe.get(notaId);
  if (guardado) return guardado;
  const chk = await fetch(urlDanfe(notaId));
  if (!chk.ok) throw new Error((await chk.json().catch(() => ({}))).error || "Não consegui abrir o DANFE.");
  const pdf = (chk.headers.get("content-type") || "").includes("pdf");
  const r = { pdf, blob: await chk.blob() };
  cacheDanfe.set(notaId, r);
  return r;
}

// Começa a buscar o DANFE antes do clique (chamar ao passar o mouse no botão).
export function preaquecerDanfe(notaId: string): void {
  void tipoDoDanfe(notaId).catch(() => {});
  void import("html2canvas").catch(() => {});
  void import("jspdf").catch(() => {});
}

// Abre a janela de impressão do navegador (com a lista de impressoras).
export async function imprimirDanfe(notaId: string): Promise<void> {
  const t = await tipoDoDanfe(notaId);
  if (t.pdf) {
    // PDF: abre no visualizador do navegador, de onde se imprime (Ctrl+P)
    const url = URL.createObjectURL(t.blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
    return;
  }
  const urlHtml = URL.createObjectURL(t.blob);
  const f = await criarIframe(urlHtml, "400px");
  f.style.left = "0";
  f.style.opacity = "0";
  f.style.pointerEvents = "none";
  f.contentWindow?.focus();
  f.contentWindow?.print();
  setTimeout(() => {
    f.remove();
    URL.revokeObjectURL(urlHtml);
  }, 5 * 60 * 1000);
}

// Gera um PDF do cupom (80 mm de largura, uma página só) e baixa.
export async function baixarDanfePdf(notaId: string, nomeArquivo: string): Promise<void> {
  const t = await tipoDoDanfe(notaId);
  if (t.pdf) {
    const url = URL.createObjectURL(t.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nomeArquivo;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return;
  }
  const urlHtml = URL.createObjectURL(t.blob);
  const f = await criarIframe(urlHtml, "420px");
  try {
    const doc = f.contentDocument;
    const win = f.contentWindow;
    if (!doc || !win) throw new Error("Não consegui ler o DANFE.");
    await Promise.all(Array.from(doc.images).map((im) => (im.complete ? null : new Promise((r) => { im.onload = im.onerror = () => r(null); }))));
    const alto = Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight);
    f.style.height = alto + "px";

    // recorta só a área que tem conteúdo (sem as margens cinzas da página)
    let x1 = Infinity, y1 = Infinity, x2 = 0, y2 = 0;
    doc.body.querySelectorAll("*").forEach((el) => {
      const temTexto = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent || "").trim());
      if (!temTexto && el.tagName !== "IMG") return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      x1 = Math.min(x1, r.left + win.scrollX);
      y1 = Math.min(y1, r.top + win.scrollY);
      x2 = Math.max(x2, r.right + win.scrollX);
      y2 = Math.max(y2, r.bottom + win.scrollY);
    });
    if (!isFinite(x1)) throw new Error("O DANFE veio vazio.");
    const pad = 8;
    const x = Math.max(0, Math.floor(x1 - pad));
    const y = Math.max(0, Math.floor(y1 - pad));
    const w = Math.ceil(x2 - x1 + pad * 2);
    const h = Math.ceil(y2 - y1 + pad * 2);

    const html2canvas = (await import("html2canvas")).default;
    const canvas = await html2canvas(doc.documentElement, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
      x,
      y,
      width: w,
      height: h,
      windowWidth: doc.documentElement.scrollWidth,
      windowHeight: alto,
    });

    const { jsPDF } = await import("jspdf");
    const larguraMm = 80;
    const alturaMm = (h * larguraMm) / w;
    const pdf = new jsPDF({ unit: "mm", format: [larguraMm, alturaMm] });
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, larguraMm, alturaMm);
    pdf.save(nomeArquivo);
  } finally {
    f.remove();
    URL.revokeObjectURL(urlHtml);
  }
}

export interface EnderecoCep {
  logradouro: string;
  bairro: string;
  municipio: string;
  uf: string;
  codigoMunicipio: string;
}

// Busca endereço e código do município (IBGE) pelo CEP (ViaCEP).
export async function buscarCep(cep: string): Promise<EnderecoCep | null> {
  const c = cep.replace(/\D/g, "");
  if (c.length !== 8) return null;
  try {
    const r = await fetch(`https://viacep.com.br/ws/${c}/json/`);
    const j = await r.json();
    if (!j || j.erro) return null;
    return { logradouro: j.logradouro || "", bairro: j.bairro || "", municipio: j.localidade || "", uf: j.uf || "", codigoMunicipio: j.ibge || "" };
  } catch {
    return null;
  }
}
