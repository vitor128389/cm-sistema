import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const supabaseServidor = await createClient();
  const {
    data: { user },
  } = await supabaseServidor.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { data: perfil } = await supabaseServidor.from("usuarios").select("funcao").eq("id", user.id).maybeSingle();
  if (perfil?.funcao !== "admin") {
    return NextResponse.json({ error: "Só administradores podem ver isso." }, { status: 403 });
  }

  const supabaseAdmin = createAdminClient();

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);

  const { data: consultasHoje, count: qtdHoje } = await supabaseAdmin
    .from("ia_consultas")
    .select("tokens_entrada, tokens_saida, custo_estimado_usd", { count: "exact" })
    .gte("criado_em", hoje.toISOString());

  const { data: consultasMes, count: qtdMes } = await supabaseAdmin
    .from("ia_consultas")
    .select("tokens_entrada, tokens_saida, custo_estimado_usd", { count: "exact" })
    .gte("criado_em", inicioMes.toISOString());

  const { data: ultimasConsultas } = await supabaseAdmin
    .from("ia_consultas")
    .select("criado_em, usuario_nome, loja_nome, pergunta, ferramentas_usadas, erro")
    .order("criado_em", { ascending: false })
    .limit(20);

  function somarTokensECusto(linhas: { tokens_entrada: number | null; tokens_saida: number | null; custo_estimado_usd: number | null }[]) {
    return linhas.reduce(
      (acc, l) => ({
        tokensEntrada: acc.tokensEntrada + (l.tokens_entrada || 0),
        tokensSaida: acc.tokensSaida + (l.tokens_saida || 0),
        custo: acc.custo + (l.custo_estimado_usd || 0),
      }),
      { tokensEntrada: 0, tokensSaida: 0, custo: 0 }
    );
  }

  return NextResponse.json({
    ativa: !!process.env.OPENAI_API_KEY,
    modelo: "gpt-5.6-luna",
    hoje: { quantidade: qtdHoje || 0, ...somarTokensECusto(consultasHoje || []) },
    mes: { quantidade: qtdMes || 0, ...somarTokensECusto(consultasMes || []) },
    ultimasConsultas: ultimasConsultas || [],
  });
}
