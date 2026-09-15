import type { SupabaseClient } from "@supabase/supabase-js";

// Contexto de quem está perguntando — sempre resolvido no servidor a
// partir da sessão autenticada, nunca confiado vindo do cliente.
export interface ContextoIA {
  funcao: string; // "admin" | "gerente" | "vendedor" | "producao" | "caixa"
  lojaId: string | null; // loja fixa do usuário — null só pra admin/gerente sem loja fixa
  podeVerFinanceiro: boolean; // já resolvido a partir da tabela "permissoes" (tela "movimento")
}

function ehAdminOuGerente(ctx: ContextoIA): boolean {
  return ctx.funcao === "admin" || ctx.funcao === "gerente";
}

// Resolve qual(is) loja_id realmente usar numa consulta: se o usuário não
// é admin/gerente, SEMPRE força a loja dele, ignorando qualquer loja que a
// IA (ou a pergunta) tenha tentado passar — isso é o que impede um
// vendedor de "pedir pra IA" dados de outra loja.
async function resolverLojaIds(
  supabase: SupabaseClient,
  ctx: ContextoIA,
  nomeLojaPedida?: string
): Promise<{ ids: string[] | null; nomes: string[] }> {
  if (!ehAdminOuGerente(ctx)) {
    if (!ctx.lojaId) return { ids: [], nomes: [] };
    const { data } = await supabase.from("lojas").select("nome").eq("id", ctx.lojaId).maybeSingle();
    return { ids: [ctx.lojaId], nomes: data ? [data.nome] : [] };
  }
  // admin/gerente: se pediu uma loja específica, filtra por ela; senão, todas
  if (nomeLojaPedida && nomeLojaPedida.toLowerCase() !== "todas") {
    const { data } = await supabase
      .from("lojas")
      .select("id, nome")
      .ilike("nome", `%${nomeLojaPedida}%`)
      .eq("eh_deposito", false);
    return { ids: (data || []).map((l) => l.id), nomes: (data || []).map((l) => l.nome) };
  }
  const { data } = await supabase.from("lojas").select("id, nome").eq("eh_deposito", false).eq("ativo", true);
  return { ids: (data || []).map((l) => l.id), nomes: (data || []).map((l) => l.nome) };
}

function intervaloPeriodo(periodo: string, de?: string, ate?: string): { inicio: Date; fim: Date } {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  if (periodo === "ontem") {
    const inicio = new Date(hoje);
    inicio.setDate(inicio.getDate() - 1);
    const fim = new Date(inicio);
    fim.setHours(23, 59, 59, 999);
    return { inicio, fim };
  }
  if (periodo === "7dias") {
    const inicio = new Date(hoje);
    inicio.setDate(inicio.getDate() - 6);
    const fim = new Date();
    fim.setHours(23, 59, 59, 999);
    return { inicio, fim };
  }
  if (periodo === "30dias") {
    const inicio = new Date(hoje);
    inicio.setDate(inicio.getDate() - 29);
    const fim = new Date();
    fim.setHours(23, 59, 59, 999);
    return { inicio, fim };
  }
  if (periodo === "mes_atual") {
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const fim = new Date();
    fim.setHours(23, 59, 59, 999);
    return { inicio, fim };
  }
  if (periodo === "personalizado" && de) {
    const inicio = new Date(de + "T00:00:00");
    const fim = ate ? new Date(ate + "T23:59:59") : new Date();
    return { inicio, fim };
  }
  // "hoje" e qualquer valor desconhecido caem aqui
  const fim = new Date(hoje);
  fim.setHours(23, 59, 59, 999);
  return { inicio: hoje, fim };
}

// -------------------- consultar_vendas --------------------
export async function consultarVendas(
  supabase: SupabaseClient,
  ctx: ContextoIA,
  args: { periodo?: string; de?: string; ate?: string; loja?: string; forma_pagamento?: string }
) {
  const { inicio, fim } = intervaloPeriodo(args.periodo || "hoje", args.de, args.ate);
  const { ids: lojaIds, nomes: lojaNomes } = await resolverLojaIds(supabase, ctx, args.loja);
  if (lojaIds && lojaIds.length === 0) {
    return { erro: "Não encontrei essa loja, ou você não tem acesso a ela." };
  }

  let query = supabase
    .from("vendas")
    .select("id, total, forma_pagamento, loja_id, lojas(nome)")
    .eq("cancelada", false)
    .gte("criado_em", inicio.toISOString())
    .lte("criado_em", fim.toISOString());
  if (lojaIds) query = query.in("loja_id", lojaIds);
  if (args.forma_pagamento) query = query.eq("forma_pagamento", args.forma_pagamento);

  const { data, error } = await query;
  if (error) return { erro: error.message };

  const vendas = data || [];
  const totalVendido = vendas.reduce((s, v) => s + v.total, 0);
  const qtdVendas = vendas.length;
  const ticketMedio = qtdVendas > 0 ? totalVendido / qtdVendas : 0;

  const porLoja = new Map<string, { total: number; qtd: number }>();
  vendas.forEach((v) => {
    const nome = (v.lojas as unknown as { nome: string } | null)?.nome || "Sem loja";
    const atual = porLoja.get(nome) || { total: 0, qtd: 0 };
    atual.total += v.total;
    atual.qtd += 1;
    porLoja.set(nome, atual);
  });

  const porForma = new Map<string, number>();
  vendas.forEach((v) => {
    porForma.set(v.forma_pagamento, (porForma.get(v.forma_pagamento) || 0) + v.total);
  });

  return {
    periodo_consultado: args.periodo || "hoje",
    lojas_consideradas: lojaNomes,
    total_vendido: Math.round(totalVendido * 100) / 100,
    quantidade_vendas: qtdVendas,
    ticket_medio: Math.round(ticketMedio * 100) / 100,
    por_loja: Array.from(porLoja.entries()).map(([loja, d]) => ({
      loja,
      total: Math.round(d.total * 100) / 100,
      quantidade: d.qtd,
    })),
    por_forma_pagamento: Array.from(porForma.entries()).map(([forma, total]) => ({
      forma,
      total: Math.round(total * 100) / 100,
    })),
    observacao:
      "O sistema não registra qual vendedor fez cada venda, só quem abriu o caixa — não é possível ranquear vendedores.",
  };
}

// -------------------- consultar_estoque --------------------
export async function consultarEstoque(
  supabase: SupabaseClient,
  ctx: ContextoIA,
  args: { produto?: string; loja?: string; apenas_estoque_baixo?: boolean; limite?: number }
) {
  const { ids: lojaIds, nomes: lojaNomes } = await resolverLojaIds(supabase, ctx, args.loja);
  if (lojaIds && lojaIds.length === 0) {
    return { erro: "Não encontrei essa loja, ou você não tem acesso a ela." };
  }

  let query = supabase
    .from("estoque_loja")
    .select("quantidade, loja_id, lojas(nome), produtos(nome, categoria), produto_variantes(nome_variante)")
    .gt("quantidade", 0);
  if (lojaIds) query = query.in("loja_id", lojaIds);

  const { data, error } = await query;
  if (error) return { erro: error.message };

  let linhas = (data || []).map((l) => ({
    produto: (l.produtos as unknown as { nome: string } | null)?.nome || "?",
    categoria: (l.produtos as unknown as { categoria: string } | null)?.categoria || null,
    variante: (l.produto_variantes as unknown as { nome_variante: string } | null)?.nome_variante || null,
    loja: (l.lojas as unknown as { nome: string } | null)?.nome || "?",
    quantidade: l.quantidade,
  }));

  if (args.produto) {
    const termo = args.produto.toLowerCase();
    linhas = linhas.filter((l) => l.produto.toLowerCase().includes(termo));
  }

  if (args.apenas_estoque_baixo) {
    linhas = linhas.filter((l) => l.quantidade <= 3).sort((a, b) => a.quantidade - b.quantidade);
  }

  const limite = args.limite || 25;
  return {
    lojas_consideradas: lojaNomes,
    quantidade_encontrada: linhas.length,
    itens: linhas.slice(0, limite),
  };
}

// -------------------- consultar_produtos --------------------
export async function consultarProdutos(
  supabase: SupabaseClient,
  ctx: ContextoIA,
  args: { nome?: string; categoria?: string; limite?: number }
) {
  let query = supabase
    .from("produtos")
    .select("nome, categoria, preco_venda, custo, tipo_precificacao, produto_variantes(nome_variante, preco_avista, custo)")
    .eq("ativo", true);
  if (args.nome) query = query.ilike("nome", `%${args.nome}%`);
  if (args.categoria) query = query.ilike("categoria", `%${args.categoria}%`);

  const { data, error } = await query.limit(args.limite || 20);
  if (error) return { erro: error.message };

  const produtos = (data || []).map((p) => ({
    nome: p.nome,
    categoria: p.categoria,
    preco_venda: p.preco_venda,
    custo: ctx.podeVerFinanceiro ? p.custo : undefined,
    variantes: (p.produto_variantes || []).map((v: { nome_variante: string; preco_avista: number; custo: number }) => ({
      nome: v.nome_variante,
      preco_avista: v.preco_avista,
      custo: ctx.podeVerFinanceiro ? v.custo : undefined,
    })),
  }));

  return { quantidade_encontrada: produtos.length, produtos };
}

// -------------------- consultar_encomendas --------------------
export async function consultarEncomendas(
  supabase: SupabaseClient,
  ctx: ContextoIA,
  args: { filtro?: "abertas" | "atrasadas" | "proximas" | "todas"; loja?: string }
) {
  const { ids: lojaIds, nomes: lojaNomes } = await resolverLojaIds(supabase, ctx, args.loja);
  if (lojaIds && lojaIds.length === 0) {
    return { erro: "Não encontrei essa loja, ou você não tem acesso a ela." };
  }

  let query = supabase
    .from("vendas")
    .select("numero_pedido, prazo_entrega_maximo, loja_id, lojas(nome), clientes(nome), venda_itens(tipo_entrega, status_entrega)")
    .eq("cancelada", false)
    .not("prazo_entrega_maximo", "is", null);
  if (lojaIds) query = query.in("loja_id", lojaIds);

  const { data, error } = await query;
  if (error) return { erro: error.message };

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  type ItemVenda = { tipo_entrega: string; status_entrega: string | null };
  let pedidos = (data || [])
    .filter((v) => (v.venda_itens as unknown as ItemVenda[]).some((i) => i.tipo_entrega === "encomenda" && i.status_entrega !== "entregue"))
    .map((v) => {
      const prazo = new Date(`${v.prazo_entrega_maximo}T00:00:00`);
      const diasRestantes = Math.round((prazo.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
      return {
        pedido: v.numero_pedido,
        cliente: (v.clientes as unknown as { nome: string } | null)?.nome || "?",
        loja: (v.lojas as unknown as { nome: string } | null)?.nome || "?",
        prazo: v.prazo_entrega_maximo,
        dias_restantes: diasRestantes,
        situacao: diasRestantes < 0 ? "atrasado" : diasRestantes <= 3 ? "próximo do prazo" : "no prazo",
      };
    });

  if (args.filtro === "atrasadas") pedidos = pedidos.filter((p) => p.dias_restantes < 0);
  else if (args.filtro === "proximas") pedidos = pedidos.filter((p) => p.dias_restantes >= 0 && p.dias_restantes <= 3);

  pedidos.sort((a, b) => a.dias_restantes - b.dias_restantes);

  return { lojas_consideradas: lojaNomes, quantidade_encontrada: pedidos.length, pedidos: pedidos.slice(0, 30) };
}

// -------------------- consultar_clientes --------------------
export async function consultarClientes(
  supabase: SupabaseClient,
  ctx: ContextoIA,
  args: { nome?: string; loja?: string; limite?: number }
) {
  const { ids: lojaIds } = await resolverLojaIds(supabase, ctx, args.loja);
  if (lojaIds && lojaIds.length === 0) {
    return { erro: "Não encontrei essa loja, ou você não tem acesso a ela." };
  }

  let query = supabase.from("clientes").select("id, nome, cidade, vendas(total, criado_em, cancelada)");
  if (lojaIds) query = query.in("loja_id", lojaIds);
  if (args.nome) query = query.ilike("nome", `%${args.nome}%`);

  const { data, error } = await query.limit(args.limite || 20);
  if (error) return { erro: error.message };

  type VendaResumo = { total: number; criado_em: string; cancelada: boolean };
  const clientes = (data || []).map((c) => {
    const vendasValidas = (c.vendas as unknown as VendaResumo[]).filter((v) => !v.cancelada);
    const totalGasto = vendasValidas.reduce((s, v) => s + v.total, 0);
    const ultima = vendasValidas.sort((a, b) => b.criado_em.localeCompare(a.criado_em))[0];
    return {
      nome: c.nome,
      cidade: c.cidade,
      quantidade_compras: vendasValidas.length,
      total_gasto: Math.round(totalGasto * 100) / 100,
      ultima_compra: ultima?.criado_em?.slice(0, 10) || null,
    };
  });

  return { quantidade_encontrada: clientes.length, clientes };
}

// -------------------- consultar_financeiro --------------------
export async function consultarFinanceiro(
  supabase: SupabaseClient,
  ctx: ContextoIA,
  args: { periodo?: string; de?: string; ate?: string; loja?: string }
) {
  if (!ctx.podeVerFinanceiro) {
    return { erro: "Você não tem permissão pra ver informações financeiras (custo, lucro, caixa)." };
  }
  const { inicio, fim } = intervaloPeriodo(args.periodo || "hoje", args.de, args.ate);
  const { ids: lojaIds, nomes: lojaNomes } = await resolverLojaIds(supabase, ctx, args.loja);
  if (lojaIds && lojaIds.length === 0) {
    return { erro: "Não encontrei essa loja, ou você não tem acesso a ela." };
  }

  let query = supabase
    .from("vendas")
    .select("total, subtotal, ajuste, loja_id, venda_itens(total, quantidade, desconto, produtos(custo), produto_variantes(custo))")
    .eq("cancelada", false)
    .gte("criado_em", inicio.toISOString())
    .lte("criado_em", fim.toISOString());
  if (lojaIds) query = query.in("loja_id", lojaIds);

  const { data, error } = await query;
  if (error) return { erro: error.message };

  type ItemFin = {
    total: number;
    quantidade: number;
    desconto: number | null;
    produtos: { custo: number } | null;
    produto_variantes: { custo: number } | null;
  };
  let faturamento = 0;
  let lucro = 0;
  let descontoTotal = 0;
  (data || []).forEach((v) => {
    faturamento += v.total;
    (v.venda_itens as unknown as ItemFin[]).forEach((item) => {
      const custoUnit = item.produto_variantes?.custo ?? item.produtos?.custo ?? 0;
      const totalAVista = Math.round((item.total / 1.1) * 100) / 100;
      lucro += totalAVista - custoUnit * item.quantidade;
      descontoTotal += item.desconto || 0;
    });
  });

  const { data: sangriasData } = await supabase
    .from("sangrias")
    .select("valor, criado_em, loja_id")
    .gte("criado_em", inicio.toISOString())
    .lte("criado_em", fim.toISOString());
  const sangrias = lojaIds
    ? (sangriasData || []).filter((s) => lojaIds.includes(s.loja_id))
    : sangriasData || [];
  const totalSangrias = sangrias.reduce((s, sg) => s + sg.valor, 0);

  return {
    periodo_consultado: args.periodo || "hoje",
    lojas_consideradas: lojaNomes,
    faturamento: Math.round(faturamento * 100) / 100,
    lucro_aproximado: Math.round(lucro * 100) / 100,
    desconto_total: Math.round(descontoTotal * 100) / 100,
    sangrias_total: Math.round(totalSangrias * 100) / 100,
  };
}
