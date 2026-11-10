import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";

// Lê a FOTO de uma DANFE (nota fiscal) e devolve os itens. Mesma chave da OpenAI do Assistente IA.
const MODELO = "gpt-5.6-luna";
export const maxDuration = 60;

export async function POST(request: Request) {
  const supabaseServidor = await createClient();
  const {
    data: { user },
  } = await supabaseServidor.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { data: perfil } = await supabaseServidor.from("usuarios").select("funcao").eq("id", user.id).maybeSingle();
  if (!perfil || (perfil.funcao !== "admin" && perfil.funcao !== "gerente")) {
    return NextResponse.json({ error: "Só admin e gerente podem usar essa função." }, { status: 403 });
  }
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "A IA não está configurada (falta OPENAI_API_KEY)." }, { status: 500 });
  }

  const { imagem } = (await request.json().catch(() => ({}))) as { imagem?: string };
  if (!imagem || !imagem.startsWith("data:image/")) return NextResponse.json({ error: "Envie uma foto." }, { status: 400 });
  if (imagem.length > 8_000_000) return NextResponse.json({ error: "Foto muito grande." }, { status: 413 });

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const resposta = await openai.responses.create({
      model: MODELO,
      instructions:
        "Você lê fotos de DANFE (nota fiscal eletrônica brasileira) e transcreve os dados com exatidão. " +
        "Copie EXATAMENTE o que está impresso, sem inventar nem corrigir. Se um número estiver ilegível, use 0 (ou string vazia para texto). " +
        "Itens: cada linha da tabela 'DADOS DOS PRODUTOS / SERVIÇOS' com código, descrição, unidade, quantidade, valor unitário e valor total. " +
        "Números em formato decimal com ponto (ex.: 322.92). 'fornecedor' é o emitente (topo). 'numero' é o número da nota (N° 000.107.928 → 107928). " +
        "'chave' é a chave de acesso de 44 dígitos, só dígitos. 'total_produtos' é o 'VALOR TOTAL DOS PRODUTOS'.",
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: "Transcreva esta nota fiscal." },
            { type: "input_image", image_url: imagem, detail: "high" },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "danfe",
          strict: true,
          schema: {
            type: "object",
            properties: {
              fornecedor: { type: "string" },
              numero: { type: "string" },
              chave: { type: "string" },
              total_produtos: { type: "number" },
              itens: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    codigo: { type: "string" },
                    descricao: { type: "string" },
                    unidade: { type: "string" },
                    quantidade: { type: "number" },
                    valor_unitario: { type: "number" },
                    valor_total: { type: "number" },
                  },
                  required: ["codigo", "descricao", "unidade", "quantidade", "valor_unitario", "valor_total"],
                  additionalProperties: false,
                },
              },
            },
            required: ["fornecedor", "numero", "chave", "total_produtos", "itens"],
            additionalProperties: false,
          },
        },
      },
    });
    return NextResponse.json(JSON.parse(resposta.output_text || "{}"));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro desconhecido";
    return NextResponse.json({ error: "Não consegui ler a foto: " + msg }, { status: 500 });
  }
}
