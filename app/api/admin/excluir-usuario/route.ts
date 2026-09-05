import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const supabaseServidor = await createClient();
  const {
    data: { user },
  } = await supabaseServidor.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { data: perfil } = await supabaseServidor
    .from("usuarios")
    .select("funcao")
    .eq("id", user.id)
    .maybeSingle();

  if (perfil?.funcao !== "admin") {
    return NextResponse.json({ error: "Só administradores podem excluir usuários." }, { status: 403 });
  }

  const { usuarioId } = (await request.json()) as { usuarioId: string };
  if (!usuarioId) {
    return NextResponse.json({ error: "Usuário não informado." }, { status: 400 });
  }
  if (usuarioId === user.id) {
    return NextResponse.json({ error: "Você não pode excluir a si mesmo." }, { status: 400 });
  }

  const admin = createAdminClient();

  // apaga o perfil primeiro (senão fica um perfil órfão se o passo seguinte falhar)
  await admin.from("usuarios").delete().eq("id", usuarioId);

  const { error } = await admin.auth.admin.deleteUser(usuarioId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
