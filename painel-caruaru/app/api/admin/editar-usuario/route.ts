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
    return NextResponse.json({ error: "Só administradores podem editar usuários." }, { status: 403 });
  }

  const body = await request.json();
  const {
    usuarioId,
    nome,
    cpf,
    email,
    novaSenha,
    funcao,
    lojaId,
    novaLojaNome,
    novaLojaCnpj,
    caixaId,
    novoCaixaNome,
    ativo,
    permissoesTelas,
  } = body as {
    usuarioId: string;
    nome: string;
    cpf?: string | null;
    email: string;
    novaSenha?: string;
    funcao: "admin" | "gerente" | "vendedor" | "producao" | "caixa";
    lojaId?: string | null;
    novaLojaNome?: string | null;
    novaLojaCnpj?: string | null;
    caixaId?: string | null;
    novoCaixaNome?: string | null;
    ativo?: boolean;
    permissoesTelas?: Record<string, boolean>;
  };

  if (!usuarioId || !nome || !email || !funcao) {
    return NextResponse.json({ error: "Preencha todos os campos obrigatórios." }, { status: 400 });
  }
  if (funcao !== "admin" && !lojaId && !novaLojaNome?.trim()) {
    return NextResponse.json({ error: "Escolha ou cadastre a loja em que essa pessoa vai trabalhar." }, { status: 400 });
  }

  const admin = createAdminClient();

  // loja: usa a existente ou cria uma nova
  let lojaIdFinal: string | null = lojaId || null;
  if (funcao !== "admin" && !lojaIdFinal && novaLojaNome?.trim()) {
    const { data: novaLoja, error: erroLoja } = await admin
      .from("lojas")
      .insert({ nome: novaLojaNome.trim(), cnpj: novaLojaCnpj || null })
      .select("id")
      .single();
    if (erroLoja) {
      return NextResponse.json({ error: "Erro ao criar a loja: " + erroLoja.message }, { status: 400 });
    }
    lojaIdFinal = novaLoja.id;
  }

  // caixa: usa o existente ou cria um novo
  let caixaIdFinal: string | null = caixaId || null;
  if (funcao !== "admin" && !caixaIdFinal && novoCaixaNome?.trim() && lojaIdFinal) {
    const { data: novoCaixa, error: erroCaixa } = await admin
      .from("caixas")
      .insert({ nome: novoCaixaNome.trim(), loja_id: lojaIdFinal })
      .select("id")
      .single();
    if (erroCaixa) {
      return NextResponse.json({ error: "Erro ao criar o caixa: " + erroCaixa.message }, { status: 400 });
    }
    caixaIdFinal = novoCaixa.id;
  }

  // atualiza e-mail e/ou senha no Auth, se mudaram
  const dadosAuth: { email?: string; password?: string } = {};
  const { data: usuarioAuthAtual } = await admin.auth.admin.getUserById(usuarioId);
  if (email && email !== usuarioAuthAtual.user?.email) dadosAuth.email = email;
  if (novaSenha && novaSenha.trim()) {
    if (novaSenha.length < 6) {
      return NextResponse.json({ error: "A nova senha precisa ter pelo menos 6 caracteres." }, { status: 400 });
    }
    dadosAuth.password = novaSenha;
  }
  if (Object.keys(dadosAuth).length > 0) {
    const { error: erroAuth } = await admin.auth.admin.updateUserById(usuarioId, dadosAuth);
    if (erroAuth) {
      return NextResponse.json({ error: "Erro ao atualizar login: " + erroAuth.message }, { status: 400 });
    }
  }

  // atualiza o perfil
  const { error: erroPerfil } = await admin
    .from("usuarios")
    .update({
      nome,
      cpf: cpf || null,
      email,
      funcao,
      loja_id: funcao === "admin" ? null : lojaIdFinal,
      caixa_id: funcao === "admin" ? null : caixaIdFinal,
      ativo: ativo ?? true,
    })
    .eq("id", usuarioId);
  if (erroPerfil) {
    return NextResponse.json({ error: erroPerfil.message }, { status: 400 });
  }

  // permissões: substitui tudo que já existia pra esse usuário
  if (permissoesTelas) {
    await admin.from("usuario_permissoes").delete().eq("usuario_id", usuarioId);
    const linhas = Object.entries(permissoesTelas).map(([tela, pode_acessar]) => ({
      usuario_id: usuarioId,
      tela,
      pode_acessar,
    }));
    if (linhas.length > 0) {
      await admin.from("usuario_permissoes").insert(linhas);
    }
  }

  return NextResponse.json({ ok: true, lojaId: lojaIdFinal, caixaId: caixaIdFinal });
}
