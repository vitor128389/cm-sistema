import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { type AmbienteFiscal, cancelarNota, normalizarResposta, type TipoNota, tokenDaLoja } from "@/lib/focusNfe";

// Cancela uma NFC-e já autorizada (só admin/gerente; a SEFAZ exige justificativa de 15+ caracteres
// e limita o prazo de cancelamento).
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { data: perfil } = await supabase.from("usuarios").select("funcao").eq("id", user.id).maybeSingle();
  if (perfil?.funcao !== "admin" && perfil?.funcao !== "gerente") {
    return NextResponse.json({ error: "Só admin ou gerente cancela nota fiscal." }, { status: 403 });
  }

  const { notaId, justificativa } = (await request.json()) as { notaId?: string; justificativa?: string };
  if (!notaId) return NextResponse.json({ error: "Nota não informada." }, { status: 400 });
  if (!justificativa || justificativa.trim().length < 15) {
    return NextResponse.json({ error: "Informe o motivo com pelo menos 15 caracteres." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: nota } = await admin.from("notas_fiscais").select("*").eq("id", notaId).maybeSingle();
  if (!nota) return NextResponse.json({ error: "Nota não encontrada." }, { status: 404 });
  if (nota.status !== "autorizada") return NextResponse.json({ error: "Só nota autorizada pode ser cancelada." }, { status: 400 });

  const { data: loja } = await admin.from("lojas").select("fiscal_chave").eq("id", nota.loja_id).maybeSingle();
  const ambiente = nota.ambiente as AmbienteFiscal;
  const token = loja?.fiscal_chave ? tokenDaLoja(loja.fiscal_chave, ambiente) : null;
  if (!token) return NextResponse.json({ error: "Token da Focus não configurado." }, { status: 500 });

  const resp = await cancelarNota((nota.tipo || "nfce") as TipoNota, ambiente, token, nota.referencia, justificativa.trim());
  const norm = normalizarResposta(ambiente, resp);
  const cancelou = resp.http < 400 && (resp.corpo.status === "cancelado" || resp.corpo.status_sefaz === "135");
  if (!cancelou) {
    return NextResponse.json({ error: norm.mensagem || "A SEFAZ não aceitou o cancelamento." }, { status: 400 });
  }
  const { data: atualizada } = await admin
    .from("notas_fiscais")
    .update({ status: "cancelada", mensagem: justificativa.trim(), atualizado_em: new Date().toISOString() })
    .eq("id", nota.id)
    .select("*")
    .single();
  return NextResponse.json({ nota: atualizada });
}
