import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProdutoComVariantes } from "@/types";

/**
 * Produtos e preços são um catálogo ÚNICO, compartilhado entre todas as
 * lojas. O que muda de loja pra loja é só a quantidade em estoque — que
 * vem da tabela `estoque_loja` e é "encaixada" aqui por cima do produto,
 * pra o resto do app poder continuar lendo `produto.quantidade_estoque`
 * e `variante.estoque` normalmente, sem precisar saber que por trás
 * agora existe uma tabela separada.
 */
export async function carregarProdutosComEstoque(
  supabase: SupabaseClient,
  lojaId: string | null
): Promise<ProdutoComVariantes[]> {
  const { data: produtosData } = await supabase
    .from("produtos")
    .select("id, nome, categoria, custo, preco_venda, tipo_precificacao, produto_variantes(*)")
    .eq("ativo", true)
    .order("nome");

  const produtos = (produtosData || []) as unknown as ProdutoComVariantes[];

  if (!lojaId) {
    return produtos.map((p) => ({
      ...p,
      quantidade_estoque: 0,
      produto_variantes: p.produto_variantes.map((v) => ({ ...v, estoque: 0 })),
    }));
  }

  const { data: estoques } = await supabase
    .from("estoque_loja")
    .select("produto_id, variante_id, quantidade")
    .eq("loja_id", lojaId);

  const estoqueSimples = new Map<string, number>();
  const estoqueVariante = new Map<string, number>();
  (estoques || []).forEach((e) => {
    if (e.variante_id) estoqueVariante.set(e.variante_id, e.quantidade);
    else estoqueSimples.set(e.produto_id, e.quantidade);
  });

  return produtos.map((p) => ({
    ...p,
    quantidade_estoque: estoqueSimples.get(p.id) ?? 0,
    produto_variantes: p.produto_variantes.map((v) => ({
      ...v,
      estoque: estoqueVariante.get(v.id) ?? 0,
    })),
  }));
}

/** Salva a quantidade em estoque de um produto (ou variante) numa loja específica. */
export async function salvarEstoqueLoja(
  supabase: SupabaseClient,
  lojaId: string,
  produtoId: string,
  varianteId: string | null,
  quantidade: number
) {
  return supabase.from("estoque_loja").upsert(
    {
      loja_id: lojaId,
      produto_id: produtoId,
      variante_id: varianteId,
      chave_variante: varianteId || "simples",
      quantidade,
    },
    { onConflict: "loja_id,produto_id,chave_variante" }
  );
}

/** Desconta (ou devolve, se negativo) uma certa quantidade do estoque de uma loja. */
export async function ajustarEstoqueLoja(
  supabase: SupabaseClient,
  lojaId: string,
  produtoId: string,
  varianteId: string | null,
  diferenca: number
) {
  const chave = varianteId || "simples";
  const { data: atual } = await supabase
    .from("estoque_loja")
    .select("quantidade")
    .eq("loja_id", lojaId)
    .eq("produto_id", produtoId)
    .eq("chave_variante", chave)
    .maybeSingle();

  const novaQuantidade = Math.max((atual?.quantidade || 0) + diferenca, 0);
  return salvarEstoqueLoja(supabase, lojaId, produtoId, varianteId, novaQuantidade);
}
