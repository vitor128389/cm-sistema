import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  // 1. confirma que quem está chamando essa rota é um admin de verdade
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
    return NextResponse.json(
      { error: "Só administradores podem cadastrar novos usuários." },
      { status: 403 }
    );
  }

  // 2. lê os dados do novo usuário
  const body = await request.json();
  const {
    nome,
    cpf,
    email,
    senha,
    funcao,
    lojaId,
    novaLojaNome,
    novaLojaCnpj,
    caixaId,
    novoCaixaNome,
    ativo,
    permissoesTelas,
  } = body as {
    nome: string;
    cpf?: string | null;
    email: string;
    senha: string;
    funcao: "admin" | "gerente" | "vendedor" | "producao" | "caixa";
    lojaId?: string | null;
    novaLojaNome?: string | null;
    novaLojaCnpj?: string | null;
    caixaId?: string | null;
    novoCaixaNome?: string | null;
    ativo?: boolean;
    permissoesTelas?: Record<string, boolean>;
  };

  if (!nome || !email || !senha || !funcao) {
    return NextResponse.json({ error: "Preencha todos os campos obrigatórios." }, { status: 400 });
  }
  if (funcao !== "admin" && !lojaId && !novaLojaNome?.trim()) {
    return NextResponse.json({ error: "Escolha ou cadastre a loja em que essa pessoa vai trabalhar." }, { status: 400 });
  }
  if (senha.length < 6) {
    return NextResponse.json({ error: "A senha precisa ter pelo menos 6 caracteres." }, { status: 400 });
  }

  const admin = createAdminClient();

  // 3. loja: usa a existente ou cria uma nova, na mesma tela
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

  // 4. caixa: usa o existente ou cria um novo, vinculado à loja acima
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

  // 5. cria o login de verdade no Supabase Auth (usa a service role — só no servidor)
  const { data: novoUsuario, error: erroAuth } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  });

  if (erroAuth || !novoUsuario.user) {
    return NextResponse.json({ error: erroAuth?.message || "Erro ao criar o login." }, { status: 400 });
  }

  // 6. vincula o perfil na tabela usuarios, já com loja e caixa
  const { error: erroPerfil } = await admin.from("usuarios").insert({
    id: novoUsuario.user.id,
    nome,
    cpf: cpf || null,
    email,
    funcao,
    loja_id: funcao === "admin" ? null : lojaIdFinal,
    caixa_id: funcao === "admin" ? null : caixaIdFinal,
    ativo: ativo ?? true,
  });
  if (erroPerfil) {
    return NextResponse.json({ error: erroPerfil.message }, { status: 400 });
  }

  // 7. permissões (já vêm pré-marcadas do cargo, ajustáveis na mesma tela)
  if (permissoesTelas) {
    const linhas = Object.entries(permissoesTelas).map(([tela, pode_acessar]) => ({
      usuario_id: novoUsuario.user.id,
      tela,
      pode_acessar,
    }));
    if (linhas.length > 0) {
      await admin.from("usuario_permissoes").insert(linhas);
    }
  }

  return NextResponse.json({ ok: true, id: novoUsuario.user.id, lojaId: lojaIdFinal, caixaId: caixaIdFinal });
}
