import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { type AmbienteFiscal, hostFocus, tokenDaLoja } from "@/lib/focusNfe";

export const maxDuration = 30;

// O DANFE da NFC-e que a Focus entrega é uma página HTML (cupom). Aqui buscamos essa página,
// embutimos as imagens (QR Code) nela e devolvemos pelo nosso domínio, pronta para imprimir
// ou virar PDF no navegador.
// GET /api/fiscal/danfe?notaId=...
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const notaId = new URL(request.url).searchParams.get("notaId");
  if (!notaId) return NextResponse.json({ error: "Nota não informada." }, { status: 400 });

  const admin = createAdminClient();
  const { data: nota } = await admin.from("notas_fiscais").select("*").eq("id", notaId).maybeSingle();
  if (!nota || !nota.url_danfe) return NextResponse.json({ error: "DANFE não disponível." }, { status: 404 });

  const ambiente = nota.ambiente as AmbienteFiscal;
  const host = hostFocus(ambiente);
  if (!String(nota.url_danfe).startsWith(host)) {
    return NextResponse.json({ error: "Endereço do DANFE inválido." }, { status: 400 });
  }
  const { data: loja } = await admin.from("lojas").select("fiscal_chave").eq("id", nota.loja_id).maybeSingle();
  const token = loja?.fiscal_chave ? tokenDaLoja(loja.fiscal_chave, ambiente) : null;
  const auth: Record<string, string> = token ? { Authorization: "Basic " + Buffer.from(`${token}:`).toString("base64") } : {};

  const resp = await fetch(nota.url_danfe, { headers: auth, cache: "no-store" });
  if (!resp.ok) return NextResponse.json({ error: "Não consegui buscar o DANFE na Focus." }, { status: 502 });
  const bytes = Buffer.from(await resp.arrayBuffer());

  // PDF de verdade (caso a Focus passe a mandar): devolve como está.
  if (bytes.subarray(0, 4).toString() === "%PDF") {
    return new NextResponse(bytes, { headers: { "Content-Type": "application/pdf", "Cache-Control": "private, no-store" } });
  }

  const charset = /charset=([\w-]+)/i.exec(resp.headers.get("content-type") || "")?.[1] || /<meta[^>]+charset=["']?([\w-]+)/i.exec(bytes.toString("latin1", 0, 2000))?.[1] || "utf-8";
  let html = new TextDecoder(/utf-?8/i.test(charset) ? "utf-8" : "windows-1252").decode(bytes);

  // embute as imagens como data URI (evita imagem quebrada/bloqueada e permite gerar o PDF)
  const imgs = Array.from(new Set(Array.from(html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)).map((m) => m[1])));
  const baixadas = await Promise.all(
    imgs.map(async (src) => {
      if (src.startsWith("data:")) return null;
      try {
        const abs = new URL(src, nota.url_danfe).toString();
        if (!(abs.startsWith(host) || abs.startsWith("https://"))) return null;
        const r = await fetch(abs, { headers: abs.startsWith(host) ? auth : {}, cache: "no-store" });
        if (!r.ok) return null;
        const tipo = r.headers.get("content-type") || "image/png";
        return { src, uri: `data:${tipo};base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}` };
      } catch {
        return null; // imagem que não carregar fica como veio
      }
    }),
  );
  for (const i of baixadas) if (i) html = html.split(i.src).join(i.uri);
  if (!/<base\s/i.test(html)) html = html.replace(/<head[^>]*>/i, (m) => `${m}<base href="${host}/">`);

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" },
  });
}
