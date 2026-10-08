import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { type AmbienteFiscal, consultarNfce, normalizarResposta, tokenDaLoja } from "@/lib/focusNfe";

// Atualiza o status de uma nota (útil quando ficou "processando").
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

  const norm = normalizarResposta(ambiente, await consultarNfce(ambiente, token, nota.referencia));
  const { data: atualizada } = await admin
    .from("notas_fiscais")
    .update({ ...norm, atualizado_em: new Date().toISOString() })
    .eq("id", nota.id)
    .select("*")
    .single();
  return NextResponse.json({ nota: atualizada });
}
