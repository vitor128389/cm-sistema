import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Reconhece um produto a partir de uma foto, comparando com o catálogo.
// Reaproveita a mesma chave da OpenAI do Assistente IA.
const MODELO = "gpt-5.6-luna";

export const maxDuration = 60;

export async function POST(request: Request) {
  const supabaseServidor = await createClient();
  const {
    data: { user },
  } = await supabaseServidor.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { data: perfil } = await supabaseServidor
    .from("usuarios")
    .select("funcao")
    .eq("id", user.id)
    .maybeSingle();
  if (!perfil || (perfil.funcao !== "admin" && perfil.funcao !== "gerente")) {
    return NextResponse.json({ error: "Só admin e gerente podem usar essa função." }, { status: 403 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "A IA não está configurada (falta OPENAI_API_KEY)." }, { status: 500 });
  }

  const { imagem } = (await request.json().catch(() => ({}))) as { imagem?: string };
  if (!imagem || !imagem.startsWith("data:image/")) {
    return NextResponse.json({ error: "Envie uma foto." }, { status: 400 });
  }
  if (imagem.length > 6_000_000) {
    return NextResponse.json({ error: "Foto muito grande." }, { status: 413 });
  }

  const admin = createAdminClient();
  const { data: produtos } = await admin
    .from("produtos")
    .select("id, nome, categoria")
    .eq("ativo", true)
    .order("nome")
    .limit(2000);
  const lista = produtos || [];
  const catalogo = lista.map((p, i) => `${i}|${p.nome}|${p.categoria}`).join("\n");

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const resposta = await openai.responses.create({
      model: MODELO,
      instructions:
        "Você ajuda uma loja de móveis a identificar o produto de uma foto. Compare a foto com o catálogo (formato: índice|nome|categoria). " +
        "Devolva até 5 índices do catálogo que mais parecem com o móvel da foto, do mais provável ao menos provável. " +
        "Se a foto tiver etiqueta ou texto com nome/modelo, dê preferência a isso. Se nada parecer, devolva lista vazia. " +
        "Em 'tipo_sugerido' diga em poucas palavras que móvel é (ex.: roupeiro, painel de TV, sofá) e em 'categoria_sugerida' a categoria mais adequada entre as do catálogo.",
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: `Catálogo:\n${catalogo}\n\nQual produto da lista aparece na foto?` },
            { type: "input_image", image_url: imagem, detail: "low" },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "reconhecimento",
          strict: true,
          schema: {
            type: "object",
            properties: {
              indices: { type: "array", items: { type: "integer" } },
              tipo_sugerido: { type: "string" },
              categoria_sugerida: { type: "string" },
            },
            required: ["indices", "tipo_sugerido", "categoria_sugerida"],
            additionalProperties: false,
          },
        },
      },
    });

    const bruto = JSON.parse(resposta.output_text || "{}") as {
      indices?: number[];
      tipo_sugerido?: string;
      categoria_sugerida?: string;
    };
    const vistos = new Set<string>();
    const candidatos = (bruto.indices || [])
      .map((i) => lista[i])
      .filter((p) => p && !vistos.has(p.id) && vistos.add(p.id))
      .slice(0, 5);

    return NextResponse.json({
      candidatos,
      tipo_sugerido: bruto.tipo_sugerido || "",
      categoria_sugerida: bruto.categoria_sugerida || "",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro desconhecido";
    return NextResponse.json({ error: "Não consegui analisar a foto: " + msg }, { status: 500 });
  }
}
