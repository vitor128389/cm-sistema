// Integração com a Focus NFe (NFC-e). Só roda no servidor (rotas em app/api/fiscal).
// O token de cada loja fica em variável de ambiente, nunca no banco nem no navegador:
//   FOCUS_TOKEN_<CHAVE>_HOMOLOG  e  FOCUS_TOKEN_<CHAVE>_PROD   (ex.: CHAVE = LAGARTO)

export type AmbienteFiscal = "homologacao" | "producao";

export function hostFocus(ambiente: AmbienteFiscal): string {
  return ambiente === "producao" ? "https://api.focusnfe.com.br" : "https://homologacao.focusnfe.com.br";
}

export function tokenDaLoja(chave: string, ambiente: AmbienteFiscal): string | null {
  const nome = `FOCUS_TOKEN_${chave.toUpperCase()}_${ambiente === "producao" ? "PROD" : "HOMOLOG"}`;
  return process.env[nome] || null;
}

function cabecalho(token: string): Record<string, string> {
  return {
    Authorization: "Basic " + Buffer.from(`${token}:`).toString("base64"),
    "Content-Type": "application/json",
  };
}

export interface RespostaFocus {
  http: number;
  corpo: Record<string, unknown>;
}

async function chamar(
  ambiente: AmbienteFiscal,
  token: string,
  metodo: "GET" | "POST" | "DELETE",
  caminho: string,
  corpo?: unknown
): Promise<RespostaFocus> {
  const resp = await fetch(hostFocus(ambiente) + caminho, {
    method: metodo,
    headers: cabecalho(token),
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
    cache: "no-store",
  });
  let json: Record<string, unknown> = {};
  try {
    json = (await resp.json()) as Record<string, unknown>;
  } catch {
    json = {};
  }
  return { http: resp.status, corpo: json };
}

export function enviarNfce(ambiente: AmbienteFiscal, token: string, referencia: string, dados: unknown) {
  return chamar(ambiente, token, "POST", `/v2/nfce?ref=${encodeURIComponent(referencia)}`, dados);
}

export function consultarNfce(ambiente: AmbienteFiscal, token: string, referencia: string) {
  return chamar(ambiente, token, "GET", `/v2/nfce/${encodeURIComponent(referencia)}`);
}

export function cancelarNfce(ambiente: AmbienteFiscal, token: string, referencia: string, justificativa: string) {
  return chamar(ambiente, token, "DELETE", `/v2/nfce/${encodeURIComponent(referencia)}`, { justificativa });
}

export interface NotaNormalizada {
  status: "processando" | "autorizada" | "erro" | "cancelada";
  numero: string | null;
  serie: string | null;
  chave: string | null;
  protocolo: string | null;
  mensagem: string | null;
  url_danfe: string | null;
  url_xml: string | null;
}

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

function urlCompleta(ambiente: AmbienteFiscal, caminho: unknown): string | null {
  const c = texto(caminho);
  if (!c) return null;
  return c.startsWith("http") ? c : hostFocus(ambiente) + c;
}

// Converte a resposta da Focus (que muda um pouco conforme o status) num formato único.
export function normalizarResposta(ambiente: AmbienteFiscal, r: RespostaFocus): NotaNormalizada {
  const c = r.corpo;
  const statusFocus = texto(c.status);
  let status: NotaNormalizada["status"] = "processando";
  if (statusFocus === "autorizado") status = "autorizada";
  else if (statusFocus === "cancelado") status = "cancelada";
  else if (statusFocus === "processando_autorizacao") status = "processando";
  else if (statusFocus === "erro_autorizacao" || statusFocus === "denegado" || r.http >= 400) status = "erro";

  let mensagem = texto(c.mensagem_sefaz) || texto(c.mensagem) || null;
  const erros = c.erros;
  if (Array.isArray(erros) && erros.length > 0) {
    const m = erros
      .map((e) => (e && typeof e === "object" ? texto((e as Record<string, unknown>).mensagem) : null))
      .filter(Boolean)
      .join("; ");
    if (m) mensagem = m;
  }
  if (!mensagem && statusFocus && status === "erro") mensagem = `Status: ${statusFocus}`;

  return {
    status,
    numero: texto(c.numero) || (typeof c.numero === "number" ? String(c.numero) : null),
    serie: texto(c.serie) || (typeof c.serie === "number" ? String(c.serie) : null),
    chave: texto(c.chave_nfe),
    protocolo: texto(c.protocolo),
    mensagem,
    url_danfe: urlCompleta(ambiente, c.caminho_danfe) || urlCompleta(ambiente, c.url_danfe),
    url_xml: urlCompleta(ambiente, c.caminho_xml_nota_fiscal),
  };
}

export function apenasDigitos(s: string | null | undefined): string {
  return (s || "").replace(/\D/g, "");
}

export function cpfValido(cpf: string): boolean {
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  for (const t of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < t; i++) soma += Number(cpf[i]) * (t + 1 - i);
    const dv = ((soma * 10) % 11) % 10;
    if (dv !== Number(cpf[t])) return false;
  }
  return true;
}

// Forma de pagamento do sistema -> código da tabela da SEFAZ.
export function codigoPagamento(forma: string): string {
  switch (forma) {
    case "Dinheiro":
      return "01";
    case "Crédito":
    case "Link":
      return "03";
    case "Débito":
      return "04";
    case "Pix":
      return "17";
    default:
      return "99";
  }
}

export const arred = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
