import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hostFocus, tokenDaLoja } from "@/lib/focusNfe";

export const maxDuration = 30;

// Baixa o XML de uma NF-e RECEBIDA pela chave de acesso (44 dígitos), usando a Focus NFe.
// Só funciona para notas emitidas contra o CNPJ de uma das lojas com fiscal ligado e com a
// Manifestação do Destinatário ativa na Focus. Se não achar, o usuário usa o XML/PDF.
// GET /api/fiscal/nfe-recebida?chave=...
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const chave = (new URL(request.url).searchParams.get("chave") || "").replace(/\D/g, "");
  if (chave.length !== 44) return NextResponse.json({ error: "A chave de acesso tem 44 números." }, { status: 400 });

  const admin = createAdminClient();
  const { data: lojas } = await admin.from("lojas").select("fiscal_chave").not("fiscal_chave", "is", null);
  const chaves = Array.from(new Set((lojas || []).map((l) => l.fiscal_chave as string).filter(Boolean)));

  for (const c of chaves) {
    const token = tokenDaLoja(c, "producao");
    if (!token) continue;
    try {
      const r = await fetch(`${hostFocus("producao")}/v2/nfes_recebidas/${chave}.xml`, {
        headers: { Authorization: "Basic " + Buffer.from(`${token}:`).toString("base64") },
        cache: "no-store",
      });
      if (!r.ok) continue;
      const xml = await r.text();
      if (xml.includes("<infNFe")) {
        return new NextResponse(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "private, no-store" } });
      }
    } catch {
      /* tenta a próxima loja */
    }
  }
  return NextResponse.json(
    {
      error:
        "Não consegui baixar essa nota pela chave. A Focus só entrega notas emitidas contra o CNPJ de uma das lojas (com Manifestação do Destinatário ativa). Envie o XML ou o PDF.",
    },
    { status: 404 }
  );
}
