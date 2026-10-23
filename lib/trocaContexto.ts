import type { SupabaseClient } from "@supabase/supabase-js";
import type { TrocaGrupo } from "@/types";

export interface ItemRestante {
  id: string;
  produto_nome: string;
  variante: string | null;
  quantidade: number;
  tipo_entrega?: string | null;
  origem_deposito?: boolean | null;
}

// Para o comprovante de troca: descobre de onde saiu cada item devolvido
// (loja x depósito) e quais itens continuam no pedido original.
export async function carregarContextoTroca(
  supabase: SupabaseClient,
  t: TrocaGrupo
): Promise<{ troca: TrocaGrupo; restantes: ItemRestante[] }> {
  const { data } = await supabase
    .from("venda_itens")
    .select("id, nome_produto, variante, quantidade, tipo_entrega, origem_deposito, trocado")
    .eq("venda_id", t.venda_original_id);
  const itens = (data || []) as {
    id: string;
    nome_produto: string;
    variante: string | null;
    quantidade: number;
    tipo_entrega: string | null;
    origem_deposito: boolean | null;
    trocado: boolean | null;
  }[];
  const porId = new Map(itens.map((i) => [i.id, i]));
  const troca: TrocaGrupo = {
    ...t,
    trocas_devolvidos: (t.trocas_devolvidos || []).map((d) => {
      const o = porId.get(d.venda_item_original_id);
      return { ...d, tipo_entrega: o?.tipo_entrega ?? null, origem_deposito: o?.origem_deposito ?? false };
    }),
  };
  const restantes = itens
    .filter((i) => !i.trocado)
    .map((i) => ({
      id: i.id,
      produto_nome: i.nome_produto,
      variante: i.variante,
      quantidade: i.quantidade,
      tipo_entrega: i.tipo_entrega,
      origem_deposito: i.origem_deposito,
    }));
  return { troca, restantes };
}
