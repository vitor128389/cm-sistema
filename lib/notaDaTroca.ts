import type { TrocaGrupo, Venda, VendaItem } from "@/types";

// Monta uma "nota normal" do pedido DEPOIS da troca: só o que o cliente fica
// (itens que não foram trocados + produtos novos), com o número da troca no
// lugar do número do pedido. Serve pros 3 formatos (A4, cupom 88mm e PDF).
export function montarNotaDaTroca(venda: Venda, troca: TrocaGrupo): Venda {
  const restantes = (venda.venda_itens || []).filter((i) => !i.trocado);
  const novos: VendaItem[] = (troca.trocas_novos || []).map((n) => ({
    id: n.id,
    venda_id: venda.id,
    produto_id: n.produto_id,
    variante_id: n.variante_id,
    nome_produto: n.produto_nome,
    variante: n.variante,
    quantidade: n.quantidade,
    // o item guarda o preço a prazo (o à vista é esse valor ÷ 1,1), igual nas vendas
    valor_unitario: n.valor_unitario_aprazo,
    total: Math.round(n.valor_unitario_aprazo * n.quantidade * 100) / 100,
    tipo_entrega: n.tipo_entrega,
    status_entrega: n.tipo_entrega === "encomenda" ? "encomenda" : null,
    data_entregue: null,
    retirada: false,
    quantidade_retirada: 0,
    quantidade_entrega: n.quantidade,
    trocado: false,
    observacao: n.observacao ?? null,
    origem_deposito: !!n.origem_deposito,
    origem_loja_id: null,
  })) as VendaItem[];

  // o que o cliente pagou no total: o valor da venda + a diferença da troca
  // (ou menos o que a loja devolveu)
  const diferencaPaga = troca.diferenca > 0 ? troca.valor_cobrado_diferenca ?? troca.diferenca : troca.diferenca;
  const total = Math.round((venda.total + diferencaPaga) * 100) / 100;

  const pagamentos = [...(venda.venda_pagamentos || [])];
  if (pagamentos.length === 0) {
    pagamentos.push({
      forma_pagamento: venda.forma_pagamento,
      parcelas: venda.parcelas,
      valor: venda.total,
    } as NonNullable<Venda["venda_pagamentos"]>[number]);
  }
  if (troca.diferenca > 0 && troca.forma_pagamento_diferenca) {
    pagamentos.push({
      forma_pagamento: troca.forma_pagamento_diferenca,
      parcelas: troca.parcelas_diferenca ?? 1,
      valor: diferencaPaga,
    } as NonNullable<Venda["venda_pagamentos"]>[number]);
  }

  return {
    ...venda,
    numero_pedido: troca.numero_troca,
    criado_em: troca.criado_em,
    total,
    forma_pagamento: pagamentos.length > 1 ? "Dividido" : venda.forma_pagamento,
    venda_pagamentos: pagamentos,
    venda_itens: [...restantes, ...novos],
  };
}
