import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { type AmbienteFiscal, hostFocus, tokenDaLoja } from "@/lib/focusNfe";

export const maxDuration = 30;

async function contexto(notaId: string) {
  const admin = createAdminClient();
  const { data: nota } = await admin.from("notas_fiscais").select("*").eq("id", notaId).maybeSingle();
  if (!nota) return { erro: "Nota não encontrada.", status: 404 as const };
  const { data: loja } = await admin.from("lojas").select("fiscal_chave").eq("id", nota.loja_id).maybeSingle();
  const ambiente = nota.ambiente as AmbienteFiscal;
  const token = loja?.fiscal_chave ? tokenDaLoja(loja.fiscal_chave, ambiente) : null;
  if (!token) return { erro: "Token da Focus não configurado.", status: 500 as const };
  return { admin, nota, ambiente, token };
}

const auth = (token: string) => ({ Authorization: "Basic " + Buffer.from(`${token}:`).toString("base64") });

// Emite uma Carta de Correção (CC-e) de uma NF-e autorizada. Só admin/gerente.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { data: perfil } = await supabase.from("usuarios").select("funcao").eq("id", user.id).maybeSingle();
  if (perfil?.funcao !== "admin" && perfil?.funcao !== "gerente") {
    return NextResponse.json({ error: "Só admin ou gerente emite carta de correção." }, { status: 403 });
  }

  const { notaId, correcao } = (await request.json()) as { notaId?: string; correcao?: string };
  const texto = (correcao || "").trim();
  if (!notaId) return NextResponse.json({ error: "Nota não informada." }, { status: 400 });
  if (texto.length < 15 || texto.length > 1000) {
    return NextResponse.json({ error: "Escreva a correção com 15 a 1000 caracteres." }, { status: 400 });
  }

  const c = await contexto(notaId);
  if ("erro" in c) return NextResponse.json({ error: c.erro }, { status: c.status });
  const { admin, nota, ambiente, token } = c;
  if (nota.tipo !== "nfe" || nota.status !== "autorizada") {
    return NextResponse.json({ error: "Carta de correção só vale para NF-e autorizada." }, { status: 400 });
  }

  const resp = await fetch(`${hostFocus(ambiente)}/v2/nfe/${encodeURIComponent(nota.referencia)}/carta_correcao`, {
    method: "POST",
    headers: { ...auth(token), "Content-Type": "application/json" },
    body: JSON.stringify({ correcao: texto }),
    cache: "no-store",
  });
  let corpo: Record<string, unknown> = {};
  try {
    corpo = (await resp.json()) as Record<string, unknown>;
  } catch {}

  const abs = (v: unknown) => (typeof v === "string" && v ? (v.startsWith("http") ? v : hostFocus(ambiente) + v) : null);
  const ok = resp.ok && corpo.status === "autorizado";
  let mensagem = String(corpo.mensagem_sefaz || corpo.mensagem || "");
  const erros = corpo.erros;
  if (Array.isArray(erros) && erros.length > 0) {
    mensagem = erros.map((e) => (e && typeof e === "object" ? String((e as Record<string, unknown>).mensagem || "") : "")).filter(Boolean).join("; ") || mensagem;
  }

  const { data: registro } = await admin
    .from("cartas_correcao")
    .insert({
      nota_id: nota.id,
      numero: typeof corpo.numero_carta_correcao === "number" ? corpo.numero_carta_correcao : null,
      texto,
      status: ok ? "autorizada" : "erro",
      mensagem: mensagem || null,
      url_pdf: abs(corpo.caminho_pdf_carta_correcao),
      url_xml: abs(corpo.caminho_xml_carta_correcao),
      usuario_id: user.id,
    })
    .select("*")
    .single();

  if (!ok) return NextResponse.json({ error: mensagem || "A SEFAZ não aceitou a carta de correção.", carta: registro }, { status: 400 });
  return NextResponse.json({ carta: registro });
}

// Baixa o PDF ou XML de uma carta: GET ?id=...&arquivo=pdf|xml
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const p = new URL(request.url).searchParams;
  const id = p.get("id");
  const arquivo = p.get("arquivo") === "xml" ? "xml" : "pdf";
  if (!id) return NextResponse.json({ error: "Carta não informada." }, { status: 400 });

  const admin = createAdminClient();
  const { data: carta } = await admin.from("cartas_correcao").select("*").eq("id", id).maybeSingle();
  if (!carta) return NextResponse.json({ error: "Carta não encontrada." }, { status: 404 });
  const c = await contexto(carta.nota_id);
  if ("erro" in c) return NextResponse.json({ error: c.erro }, { status: c.status });

  const url = arquivo === "xml" ? carta.url_xml : carta.url_pdf;
  if (!url || !String(url).startsWith(hostFocus(c.ambiente))) return NextResponse.json({ error: "Arquivo não disponível." }, { status: 404 });
  const r = await fetch(url, { headers: auth(c.token), cache: "no-store" });
  if (!r.ok) return NextResponse.json({ error: "Não consegui baixar o arquivo na Focus." }, { status: 502 });
  const bytes = await r.arrayBuffer();
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": arquivo === "xml" ? "application/xml" : "application/pdf",
      "Content-Disposition": `inline; filename="CCe-${carta.numero ?? "x"}.${arquivo}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
