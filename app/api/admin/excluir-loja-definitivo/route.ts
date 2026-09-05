import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Exclui uma loja PRA VALER — inclusive tudo que está vinculado a ela
// (vendas, clientes, caixas, estoque, trocas, sangrias). Usuários que
// trabalhavam nela ficam sem loja/caixa (não são apagados).
// Só um admin pode chamar essa rota, e o frontend exige digitar "EXCLUIR".
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
    return NextResponse.json({ error: "Só administradores podem excluir uma loja definitivamente." }, { status: 403 });
  }

  const { lojaId, confirmacao } = (await request.json()) as { lojaId: string; confirmacao: string };
  if (!lojaId) {
    return NextResponse.json({ error: "Loja não informada." }, { status: 400 });
  }
  if (confirmacao !== "EXCLUIR") {
    return NextResponse.json({ error: "Confirmação incorreta." }, { status: 400 });
  }

  const admin = createAdminClient();

  try {
    // usuários dessa loja ficam sem loja/caixa, mas continuam existindo
    await admin.from("usuarios").update({ loja_id: null, caixa_id: null }).eq("loja_id", lojaId);

    // trocas: apaga os itens antes dos grupos (FK)
    const { data: grupos } = await admin.from("trocas_grupo").select("id").eq("loja_id", lojaId);
    const idsGrupos = (grupos || []).map((g) => g.id);
    if (idsGrupos.length > 0) {
      await admin.from("trocas_devolvidos").delete().in("troca_id", idsGrupos);
      await admin.from("trocas_novos").delete().in("troca_id", idsGrupos);
      await admin.from("trocas_grupo").delete().in("id", idsGrupos);
    }

    // sangrias dessa loja
    await admin.from("sangrias").delete().eq("loja_id", lojaId);

    // vendas: apaga itens e pagamentos antes das vendas
    const { data: vendas } = await admin.from("vendas").select("id").eq("loja_id", lojaId);
    const idsVendas = (vendas || []).map((v) => v.id);
    if (idsVendas.length > 0) {
      await admin.from("venda_itens").delete().in("venda_id", idsVendas);
      await admin.from("venda_pagamentos").delete().in("venda_id", idsVendas);
      await admin.from("vendas").delete().in("id", idsVendas);
    }

    // caixas e turnos dessa loja
    const { data: caixas } = await admin.from("caixas").select("id").eq("loja_id", lojaId);
    const idsCaixas = (caixas || []).map((c) => c.id);
    if (idsCaixas.length > 0) {
      await admin.from("turnos_caixa").delete().in("caixa_id", idsCaixas);
      await admin.from("caixas").delete().in("id", idsCaixas);
    }

    // clientes dessa loja (e os celulares deles)
    const { data: clientes } = await admin.from("clientes").select("id").eq("loja_id", lojaId);
    const idsClientes = (clientes || []).map((c) => c.id);
    if (idsClientes.length > 0) {
      await admin.from("cliente_celulares").delete().in("cliente_id", idsClientes);
      await admin.from("clientes").delete().in("id", idsClientes);
    }

    // estoque dessa loja
    await admin.from("estoque_loja").delete().eq("loja_id", lojaId);

    // por fim, a loja em si
    const { error: erroLoja } = await admin.from("lojas").delete().eq("id", lojaId);
    if (erroLoja) throw erroLoja;

    return NextResponse.json({ ok: true });
  } catch (erro: unknown) {
    const erroObj = erro as { message?: string } | null;
    return NextResponse.json(
      { error: "Erro ao excluir a loja definitivamente: " + (erroObj?.message || "tente novamente.") },
      { status: 400 }
    );
  }
}
