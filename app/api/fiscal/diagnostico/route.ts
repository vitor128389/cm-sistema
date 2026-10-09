import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { type AmbienteFiscal, hostFocus, tokenDaLoja } from "@/lib/focusNfe";

export const maxDuration = 30;

// Consulta a nota na Focus (com dados completos) e devolve só campos simples de diagnóstico.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { notaId } = (await request.json()) as { notaId?: string };
  if (!notaId) return NextResponse.json({ error: "Nota não informada." }, { status: 400 });

  const admin = createAdminClient();
  const { data: nota } = await admin.from("notas_fiscais").select("*").eq("id", notaId).maybeSingle();
  if (!nota) return NextResponse.json({ error: "Nota não encontrada." }, { status: 404 });
  const { data: loja } = await admin.from("lojas").select("fiscal_chave").eq("id", nota.loja_id).maybeSingle();
  const ambiente = nota.ambiente as AmbienteFiscal;
  const token = loja?.fiscal_chave ? tokenDaLoja(loja.fiscal_chave, ambiente) : null;
  if (!token) return NextResponse.json({ error: "Token da Focus não configurado." }, { status: 500 });

  const tipo = nota.tipo === "nfe" ? "nfe" : "nfce";
  const resp = await fetch(`${hostFocus(ambiente)}/v2/${tipo}/${encodeURIComponent(nota.referencia)}?completa=1`, {
    headers: { Authorization: "Basic " + Buffer.from(`${token}:`).toString("base64") },
    cache: "no-store",
  });
  let corpo: Record<string, unknown> = {};
  try {
    corpo = (await resp.json()) as Record<string, unknown>;
  } catch {}

  // só valores simples (texto/número); nada de XML, tokens ou listas grandes
  const campos: Record<string, string> = {};
  const pegar = (obj: Record<string, unknown>, prefixo = "") => {
    for (const [k, v] of Object.entries(obj)) {
      if (/token|senha|csc|xml_|certificado/i.test(k)) continue;
      if (typeof v === "string" && v.length <= 200) campos[prefixo + k] = v;
      else if (typeof v === "number" || typeof v === "boolean") campos[prefixo + k] = String(v);
      else if (v && typeof v === "object" && !Array.isArray(v) && prefixo === "") pegar(v as Record<string, unknown>, k + ".");
    }
  };
  pegar(corpo);
  const ordem = ["status", "status_sefaz", "mensagem_sefaz", "numero", "serie", "chave_nfe", "protocolo", "data_emissao", "tipo_emissao", "modalidade", "ambiente"];
  const ordenado = Object.fromEntries(
    [...Object.entries(campos)].sort(([a], [b]) => {
      const ia = ordem.indexOf(a);
      const ib = ordem.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
    })
  );
  return NextResponse.json({ http: resp.status, campos: ordenado });
}
