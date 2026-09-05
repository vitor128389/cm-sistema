// Edge Function: consulta-cpf
// Recebe { cpf: "12345678900" } e devolve { encontrado: true, nome: "..." } ou { encontrado: false }
// A chave da CPFHub.io fica guardada como secret no Supabase — nunca aparece no navegador.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const { cpf } = await req.json();
    const cpfLimpo = String(cpf || "").replace(/\D/g, "");

    if (cpfLimpo.length !== 11) {
      return new Response(JSON.stringify({ encontrado: false, erro: "CPF inválido" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("CPFHUB_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ encontrado: false, erro: "CPFHUB_API_KEY não configurada no Supabase" }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const resposta = await fetch(`https://api.cpfhub.io/cpf/${cpfLimpo}`, {
      headers: { "x-api-key": apiKey },
    });

    if (!resposta.ok) {
      // CPF não encontrado na base, ou erro da API — não é cobrado se não encontrar.
      return new Response(JSON.stringify({ encontrado: false }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const json = await resposta.json();
    if (!json.success || !json.data) {
      return new Response(JSON.stringify({ encontrado: false }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        encontrado: true,
        nome: json.data.name,
        dataNascimento: json.data.birthDate,
      }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  } catch (erro) {
    return new Response(JSON.stringify({ encontrado: false, erro: String(erro) }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
