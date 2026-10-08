import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { type AmbienteFiscal, hostFocus, tokenDaLoja } from "@/lib/focusNfe";

export const maxDuration = 30;

// Entrega o PDF do DANFE pelo nosso domínio (inline, para imprimir direto; ou como download).
// GET /api/fiscal/danfe?notaId=...&baixar=1
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const url = new URL(request.url);
  const notaId = url.searchParams.get("notaId");
  const baixar = url.searchParams.get("baixar") === "1";
  if (!notaId) return NextResponse.json({ error: "Nota não informada." }, { status: 400 });

  const admin = createAdminClient();
  const { data: nota } = await admin.from("notas_fiscais").select("*, vendas(numero_pedido)").eq("id", notaId).maybeSingle();
  if (!nota || !nota.url_danfe) return NextResponse.json({ error: "DANFE não disponível." }, { status: 404 });

  const ambiente = nota.ambiente as AmbienteFiscal;
  // só busca arquivos do próprio domínio da Focus
  if (!String(nota.url_danfe).startsWith(hostFocus(ambiente))) {
    return NextResponse.json({ error: "Endereço do DANFE inválido." }, { status: 400 });
  }
  const { data: loja } = await admin.from("lojas").select("fiscal_chave").eq("id", nota.loja_id).maybeSingle();
  const token = loja?.fiscal_chave ? tokenDaLoja(loja.fiscal_chave, ambiente) : null;

  const resp = await fetch(nota.url_danfe, {
    headers: token ? { Authorization: "Basic " + Buffer.from(`${token}:`).toString("base64") } : {},
    cache: "no-store",
  });
  if (!resp.ok) return NextResponse.json({ error: "Não consegui buscar o DANFE na Focus." }, { status: 502 });
  const pdf = await resp.arrayBuffer();

  const pedido = (nota.vendas as { numero_pedido?: number } | null)?.numero_pedido;
  const nome = `NFCe-pedido-${pedido ?? "x"}-${nota.numero ?? "s-n"}.pdf`;
  return new NextResponse(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${baixar ? "attachment" : "inline"}; filename="${nome}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
