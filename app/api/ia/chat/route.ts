import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatarMoeda as formatarMoedaAuditoria } from "@/lib/format";
import {
  consultarVendas,
  consultarEstoque,
  consultarProdutos,
  consultarEncomendas,
  consultarClientes,
  consultarFinanceiro,
  cadastrarProduto,
  adicionarEstoque,
  transferirEstoque,
  editarPrecoProduto,
  cancelarVendaPorIA,
  criarOuEditarClientePorIA,
  fazerSangriaPorIA,
  marcarItemEntreguePorIA,
  type ContextoIA,
} from "@/lib/ia-tools";

const MODELO = "gpt-5.6-luna";

// Preço aproximado por 1M de tokens desse modelo — só pra dar uma
// estimativa de custo no painel, não é um valor de cobrança oficial.
const PRECO_ENTRADA_POR_MILHAO = 0.2;
const PRECO_SAIDA_POR_MILHAO = 1.2;

const INSTRUCOES_SISTEMA = `Você é o assistente de gestão do sistema da Caruaru Móveis e Estofados (rede de lojas de móveis).
Responda sempre em português brasileiro, de forma clara, direta e objetiva.
Use as ferramentas disponíveis pra buscar dados reais — nunca invente vendas, valores, estoque, clientes, pedidos, lucros ou datas.
Se uma ferramenta retornar "erro" ou não encontrar o que foi pedido, diga isso claramente ao usuário, sem inventar um resultado.
Se a pergunta pedir uma informação que o sistema não tem (por exemplo, "qual vendedor vendeu mais" — o sistema não registra vendedor por venda), explique essa limitação em vez de adivinhar.
Formate valores em reais (R$) e datas no padrão brasileiro (dd/mm/aaaa).
Seja conciso — respostas de poucas frases, direto ao ponto, do jeito que alguém correndo numa loja precisa.
Se o usuário pedir pra cadastrar um produto novo, você pode fazer isso usando a ferramenta cadastrar_produto — mas só chame essa ferramenta quando já tiver nome, categoria e preço de venda claros na conversa. Se faltar alguma dessas informações, pergunte antes de cadastrar; nunca invente um preço ou categoria. Depois de cadastrar, confirme pro usuário exatamente o que foi criado (nome, categoria, preço, cores, estoque se houver).
Se o usuário pedir pra adicionar/somar estoque de um produto que já existe, use a ferramenta adicionar_estoque — ela sempre SOMA ao estoque atual, nunca substitui. Se o produto tiver mais de uma variação de cor/tecido e o usuário não disser qual, pergunte antes de executar.
Se o usuário pedir pra mover/transferir produto do Depósito pra uma loja, use transferir_estoque.
Se o usuário pedir pra mudar o preço de venda ou o custo de um produto, use editar_preco_produto — confirme os novos valores antes de executar se não estiverem claros.
Se o usuário pedir pra cancelar uma venda, use cancelar_venda — sempre exija um motivo antes; essa ação é só pra admin.
Se o usuário pedir pra cadastrar ou atualizar um cliente, use criar_ou_editar_cliente.
Se o usuário pedir pra registrar uma sangria, use fazer_sangria — sempre exija o motivo.
Se o usuário pedir pra marcar um pedido (ou item de um pedido) como entregue, use marcar_item_entregue.
Todas essas ações mudam dado de verdade no sistema — só execute quando o pedido do usuário for claro e direto; se faltar alguma informação obrigatória (motivo, valor, produto, loja), pergunte antes de agir. Depois de executar, confirme pro usuário exatamente o que foi feito.
Se uma ferramenta responder que encontrou mais de um produto com nome parecido (campo produtos_encontrados), pergunte ao usuário qual dos dois ele quer, mostrando a lista exata. Na próxima chamada, use o nome EXATO como veio nessa lista, letra por letra — não parafraseie nem abrevie, senão a busca falha de novo.`;

const FERRAMENTAS: OpenAI.Responses.Tool[] = [
  {
    type: "function",
    name: "consultar_vendas",
    description: "Consulta vendas realizadas — total vendido, quantidade, ticket médio, por loja e por forma de pagamento.",
    parameters: {
      type: "object",
      properties: {
        periodo: {
          type: "string",
          enum: ["hoje", "ontem", "7dias", "30dias", "mes_atual", "personalizado"],
          description: "Período a consultar. Padrão: hoje.",
        },
        de: { type: "string", description: "Data inicial (YYYY-MM-DD), só se periodo=personalizado." },
        ate: { type: "string", description: "Data final (YYYY-MM-DD), só se periodo=personalizado." },
        loja: { type: "string", description: "Nome da loja, ou 'todas'. Se omitido, considera todas as lojas que o usuário pode ver." },
        forma_pagamento: { type: "string", description: "Filtra por forma de pagamento específica (ex.: Dinheiro, Pix, Crédito)." },
      },
      required: [],
      additionalProperties: false,
    },
    strict: false,
  },
  {
    type: "function",
    name: "consultar_estoque",
    description: "Consulta o estoque de produtos — quantidade por produto/variante/loja. Use apenas_estoque_baixo=true pra achar produtos acabando.",
    parameters: {
      type: "object",
      properties: {
        produto: { type: "string", description: "Nome do produto (busca parcial)." },
        loja: { type: "string", description: "Nome da loja, ou 'todas'." },
        apenas_estoque_baixo: { type: "boolean", description: "Se true, só mostra itens com 3 unidades ou menos." },
        limite: { type: "number", description: "Máximo de itens a retornar (padrão 25)." },
      },
      required: [],
      additionalProperties: false,
    },
    strict: false,
  },
  {
    type: "function",
    name: "consultar_produtos",
    description: "Consulta o catálogo de produtos — nome, categoria, preço, variantes de tecido/cor.",
    parameters: {
      type: "object",
      properties: {
        nome: { type: "string", description: "Nome do produto (busca parcial)." },
        categoria: { type: "string", description: "Categoria do produto." },
        limite: { type: "number", description: "Máximo de itens a retornar (padrão 20)." },
      },
      required: [],
      additionalProperties: false,
    },
    strict: false,
  },
  {
    type: "function",
    name: "consultar_encomendas",
    description: "Consulta pedidos de encomenda em aberto — prazo, cliente, se está atrasado ou próximo do prazo.",
    parameters: {
      type: "object",
      properties: {
        filtro: { type: "string", enum: ["abertas", "atrasadas", "proximas", "todas"], description: "Padrão: abertas." },
        loja: { type: "string", description: "Nome da loja, ou 'todas'." },
      },
      required: [],
      additionalProperties: false,
    },
    strict: false,
  },
  {
    type: "function",
    name: "consultar_clientes",
    description: "Consulta clientes cadastrados — histórico de compras, quantidade, total gasto, última compra.",
    parameters: {
      type: "object",
      properties: {
        nome: { type: "string", description: "Nome do cliente (busca parcial)." },
        loja: { type: "string", description: "Nome da loja, ou 'todas'." },
        limite: { type: "number", description: "Máximo de clientes a retornar (padrão 20)." },
      },
      required: [],
      additionalProperties: false,
    },
    strict: false,
  },
  {
    type: "function",
    name: "consultar_financeiro",
    description: "Consulta dados financeiros — faturamento, lucro aproximado, descontos, sangrias. Só funciona se o usuário tiver permissão financeira.",
    parameters: {
      type: "object",
      properties: {
        periodo: { type: "string", enum: ["hoje", "ontem", "7dias", "30dias", "mes_atual", "personalizado"] },
        de: { type: "string" },
        ate: { type: "string" },
        loja: { type: "string", description: "Nome da loja, ou 'todas'." },
      },
      required: [],
      additionalProperties: false,
    },
    strict: false,
  },
];

// Ferramenta de ESCRITA — só é oferecida à IA quando o usuário é admin ou
// gerente (ver montagem de "tools" mais abaixo). Vendedor/produção/caixa
// nunca recebem essa ferramenta na lista, então a IA nem tenta usá-la.
const FERRAMENTA_CADASTRAR_PRODUTO: OpenAI.Responses.Tool = {
  type: "function",
  name: "cadastrar_produto",
  description:
    "Cadastra um produto novo no catálogo. Use só quando o usuário pedir claramente pra cadastrar/criar um produto E você já tiver nome, categoria e preço de venda — se faltar alguma dessas 3 informações, pergunte antes de chamar essa ferramenta, não invente valores.",
  parameters: {
    type: "object",
    properties: {
      nome: { type: "string", description: "Nome do produto." },
      categoria: { type: "string", description: "Categoria do produto (ex.: Sofás, Móveis Montados)." },
      preco_venda: { type: "number", description: "Preço de venda à vista." },
      custo: { type: "number", description: "Custo do produto, se informado." },
      cores: {
        type: "array",
        items: { type: "string" },
        description: "Lista de cores/tecidos, se o produto tiver variação de cor (ex.: ['Suede','Linho']). Omita se for um produto de cor única.",
      },
      estoque_inicial: { type: "number", description: "Quantidade inicial em estoque, se informado." },
      loja: { type: "string", description: "Loja onde lançar o estoque inicial, se estoque_inicial foi informado." },
    },
    required: ["nome", "categoria", "preco_venda"],
    additionalProperties: false,
  },
  strict: false,
};

const FERRAMENTA_ADICIONAR_ESTOQUE: OpenAI.Responses.Tool = {
  type: "function",
  name: "adicionar_estoque",
  description:
    "Adiciona (soma) uma quantidade ao estoque de um produto já existente numa loja. NUNCA substitui o estoque atual, sempre soma. Use quando o usuário pedir pra adicionar/lançar/somar estoque de um produto que já existe no catálogo.",
  parameters: {
    type: "object",
    properties: {
      produto: { type: "string", description: "Nome do produto (busca parcial)." },
      loja: { type: "string", description: "Nome da loja onde adicionar o estoque." },
      cor: { type: "string", description: "Tecido/cor da variação, se o produto tiver mais de uma. Omita se o produto só tem uma variação ou nenhuma." },
      quantidade: { type: "number", description: "Quantidade a ADICIONAR (soma ao que já existe)." },
    },
    required: ["produto", "loja", "quantidade"],
    additionalProperties: false,
  },
  strict: false,
};

const FERRAMENTA_TRANSFERIR_ESTOQUE: OpenAI.Responses.Tool = {
  type: "function",
  name: "transferir_estoque",
  description:
    "Move uma quantidade de um produto do Depósito para uma loja específica. Baixa do Depósito e soma na loja de destino ao mesmo tempo.",
  parameters: {
    type: "object",
    properties: {
      produto: { type: "string", description: "Nome do produto (busca parcial)." },
      cor: { type: "string", description: "Tecido/cor da variação, se o produto tiver mais de uma." },
      loja_destino: { type: "string", description: "Nome da loja que vai receber o produto." },
      quantidade: { type: "number", description: "Quantidade a transferir." },
    },
    required: ["produto", "loja_destino", "quantidade"],
    additionalProperties: false,
  },
  strict: false,
};

const FERRAMENTA_EDITAR_PRECO_PRODUTO: OpenAI.Responses.Tool = {
  type: "function",
  name: "editar_preco_produto",
  description: "Altera o preço de venda e/ou o custo de um produto (ou de uma variação específica dele) já existente.",
  parameters: {
    type: "object",
    properties: {
      produto: { type: "string", description: "Nome do produto (busca parcial)." },
      cor: { type: "string", description: "Tecido/cor da variação, se o produto tiver mais de uma." },
      novo_preco_venda: { type: "number", description: "Novo preço de venda à vista, se for alterar." },
      novo_custo: { type: "number", description: "Novo custo, se for alterar." },
    },
    required: ["produto"],
    additionalProperties: false,
  },
  strict: false,
};

const FERRAMENTA_CANCELAR_VENDA: OpenAI.Responses.Tool = {
  type: "function",
  name: "cancelar_venda",
  description:
    "Cancela uma venda pelo número do pedido, devolvendo pro estoque os produtos de pronta entrega (encomenda não mexe no estoque). Exige um motivo. Ação sensível — só admin pode usar.",
  parameters: {
    type: "object",
    properties: {
      numero_pedido: { type: "number", description: "Número do pedido a cancelar." },
      motivo: { type: "string", description: "Motivo do cancelamento — obrigatório." },
    },
    required: ["numero_pedido", "motivo"],
    additionalProperties: false,
  },
  strict: false,
};

const FERRAMENTA_CRIAR_OU_EDITAR_CLIENTE: OpenAI.Responses.Tool = {
  type: "function",
  name: "criar_ou_editar_cliente",
  description: "Cadastra um cliente novo, ou atualiza um já existente (identificado pelo CPF, se informado).",
  parameters: {
    type: "object",
    properties: {
      nome: { type: "string", description: "Nome do cliente." },
      cpf: { type: "string", description: "CPF do cliente, se informado." },
      telefone: { type: "string", description: "Telefone/celular." },
      endereco: { type: "string", description: "Endereço." },
      cidade: { type: "string", description: "Cidade." },
      loja: { type: "string", description: "Loja do cliente — só necessário se for um cadastro novo e o usuário não tiver loja fixa." },
    },
    required: ["nome"],
    additionalProperties: false,
  },
  strict: false,
};

const FERRAMENTA_FAZER_SANGRIA: OpenAI.Responses.Tool = {
  type: "function",
  name: "fazer_sangria",
  description: "Registra uma sangria (retirada de dinheiro) no caixa aberto de uma loja. Exige valor e motivo.",
  parameters: {
    type: "object",
    properties: {
      valor: { type: "number", description: "Valor da sangria." },
      motivo: { type: "string", description: "Motivo da sangria — obrigatório." },
      loja: { type: "string", description: "Loja onde fazer a sangria." },
    },
    required: ["valor", "motivo", "loja"],
    additionalProperties: false,
  },
  strict: false,
};

const FERRAMENTA_MARCAR_ENTREGUE: OpenAI.Responses.Tool = {
  type: "function",
  name: "marcar_item_entregue",
  description: "Marca item(ns) de um pedido como entregues.",
  parameters: {
    type: "object",
    properties: {
      numero_pedido: { type: "number", description: "Número do pedido." },
      produto: {
        type: "string",
        description: "Nome do produto a marcar, se o pedido tiver mais de um item pendente. Omita pra marcar todos os pendentes desse pedido.",
      },
    },
    required: ["numero_pedido"],
    additionalProperties: false,
  },
  strict: false,
};

async function executarFerramenta(
  nome: string,
  args: Record<string, unknown>,
  supabaseAdmin: ReturnType<typeof createAdminClient>,
  ctx: ContextoIA
): Promise<unknown> {
  switch (nome) {
    case "consultar_vendas":
      return consultarVendas(supabaseAdmin, ctx, args);
    case "consultar_estoque":
      return consultarEstoque(supabaseAdmin, ctx, args);
    case "consultar_produtos":
      return consultarProdutos(supabaseAdmin, ctx, args);
    case "consultar_encomendas":
      return consultarEncomendas(supabaseAdmin, ctx, args);
    case "consultar_clientes":
      return consultarClientes(supabaseAdmin, ctx, args);
    case "consultar_financeiro":
      return consultarFinanceiro(supabaseAdmin, ctx, args);
    case "cadastrar_produto":
      // @ts-expect-error args vem tipado genérico do JSON da IA, a própria função valida os campos
      return cadastrarProduto(supabaseAdmin, ctx, args);
    case "adicionar_estoque":
      // @ts-expect-error args vem tipado genérico do JSON da IA, a própria função valida os campos
      return adicionarEstoque(supabaseAdmin, ctx, args);
    case "transferir_estoque":
      // @ts-expect-error args vem tipado genérico do JSON da IA, a própria função valida os campos
      return transferirEstoque(supabaseAdmin, ctx, args);
    case "editar_preco_produto":
      // @ts-expect-error args vem tipado genérico do JSON da IA, a própria função valida os campos
      return editarPrecoProduto(supabaseAdmin, ctx, args);
    case "cancelar_venda":
      // @ts-expect-error args vem tipado genérico do JSON da IA, a própria função valida os campos
      return cancelarVendaPorIA(supabaseAdmin, ctx, args);
    case "criar_ou_editar_cliente":
      // @ts-expect-error args vem tipado genérico do JSON da IA, a própria função valida os campos
      return criarOuEditarClientePorIA(supabaseAdmin, ctx, args);
    case "fazer_sangria":
      // @ts-expect-error args vem tipado genérico do JSON da IA, a própria função valida os campos
      return fazerSangriaPorIA(supabaseAdmin, ctx, args);
    case "marcar_item_entregue":
      // @ts-expect-error args vem tipado genérico do JSON da IA, a própria função valida os campos
      return marcarItemEntreguePorIA(supabaseAdmin, ctx, args);
    default:
      return { erro: `Ferramenta desconhecida: ${nome}` };
  }
}

export async function POST(request: Request) {
  // 1. confirma quem está logado — nunca confia em nada vindo do cliente
  const supabaseServidor = await createClient();
  const {
    data: { user },
  } = await supabaseServidor.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { data: perfil } = await supabaseServidor
    .from("usuarios")
    .select("nome, funcao, loja_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!perfil) {
    return NextResponse.json({ error: "Usuário não encontrado." }, { status: 403 });
  }

  let podeVerFinanceiro = perfil.funcao === "admin";
  if (!podeVerFinanceiro) {
    const { data: permissao } = await supabaseServidor
      .from("permissoes")
      .select("pode_acessar")
      .eq("funcao", perfil.funcao)
      .eq("tela", "movimento")
      .maybeSingle();
    podeVerFinanceiro = !!permissao?.pode_acessar;
  }

  const ctx: ContextoIA = {
    funcao: perfil.funcao,
    lojaId: perfil.loja_id,
    podeVerFinanceiro,
  };

  // ferramentas de escrita — cada nível vê só o que pode usar de verdade,
  // a própria função ainda valida de novo no servidor (dupla checagem)
  const ferramentasEscritaComuns = [
    FERRAMENTA_CADASTRAR_PRODUTO,
    FERRAMENTA_ADICIONAR_ESTOQUE,
    FERRAMENTA_TRANSFERIR_ESTOQUE,
    FERRAMENTA_EDITAR_PRECO_PRODUTO,
    FERRAMENTA_CRIAR_OU_EDITAR_CLIENTE,
    FERRAMENTA_FAZER_SANGRIA,
    FERRAMENTA_MARCAR_ENTREGUE,
  ];
  const ferramentasDisponiveis: OpenAI.Responses.Tool[] =
    perfil.funcao === "admin"
      ? [...FERRAMENTAS, ...ferramentasEscritaComuns, FERRAMENTA_CANCELAR_VENDA]
      : perfil.funcao === "gerente"
      ? [...FERRAMENTAS, ...ferramentasEscritaComuns]
      : FERRAMENTAS;

  let lojaNome: string | null = null;
  if (perfil.loja_id) {
    const { data: loja } = await supabaseServidor.from("lojas").select("nome").eq("id", perfil.loja_id).maybeSingle();
    lojaNome = loja?.nome || null;
  }

  const body = await request.json();
  const { mensagem, historico } = body as {
    mensagem: string;
    historico?: { role: "user" | "assistant"; content: string }[];
  };
  if (!mensagem || !mensagem.trim()) {
    return NextResponse.json({ error: "Mensagem vazia." }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { resposta: "Assistente IA temporariamente indisponível. Tente novamente.", indisponivel: true },
      { status: 200 }
    );
  }

  const supabaseAdmin = createAdminClient();
  const openai = new OpenAI({ apiKey });

  // mantém só as últimas mensagens do histórico, pra não gastar tokens à toa
  const historicoCurto = (historico || []).slice(-8);
  const inputInicial: OpenAI.Responses.ResponseInput = [
    ...historicoCurto.map((h) => ({ role: h.role, content: h.content }) as OpenAI.Responses.EasyInputMessage),
    { role: "user", content: mensagem },
  ];

  const ferramentasUsadas: string[] = [];
  let tokensEntrada = 0;
  let tokensSaida = 0;

  try {
    let resposta = await openai.responses.create({
      model: MODELO,
      instructions: INSTRUCOES_SISTEMA,
      input: inputInicial,
      tools: ferramentasDisponiveis,
    });
    tokensEntrada += resposta.usage?.input_tokens || 0;
    tokensSaida += resposta.usage?.output_tokens || 0;

    // até 5 rodadas de chamada de ferramenta, pra evitar loop infinito
    for (let rodada = 0; rodada < 5; rodada++) {
      const chamadas = resposta.output.filter(
        (item): item is OpenAI.Responses.ResponseFunctionToolCall => item.type === "function_call"
      );
      if (chamadas.length === 0) break;

      const saidas: OpenAI.Responses.ResponseInputItem[] = [];
      for (const chamada of chamadas) {
        ferramentasUsadas.push(chamada.name);
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(chamada.arguments || "{}");
        } catch {
          // argumentos inválidos — segue com objeto vazio
        }
        const resultado = await executarFerramenta(chamada.name, args, supabaseAdmin, ctx);

        // ação que muda dado de verdade (cadastro de produto) — registra
        // na Auditoria, deixando claro que foi via Assistente IA
        if (chamada.name === "cadastrar_produto" && (resultado as { sucesso?: boolean }).sucesso) {
          const r = resultado as { produto_criado: string; categoria: string; preco_venda: number };
          supabaseAdmin
            .from("auditoria")
            .insert({
              usuario_id: user.id,
              usuario_nome: perfil.nome,
              usuario_email: user.email || null,
              usuario_funcao: perfil.funcao,
              loja_id: perfil.loja_id,
              loja_nome: lojaNome,
              categoria: "Produtos",
              acao: "criacao",
              tipo_execucao: "manual",
              registro_tipo: "produto",
              registro_nome: r.produto_criado,
              descricao: `Produto "${r.produto_criado}" cadastrado via Assistente IA (pedido: "${mensagem}")`,
              dados_depois: { nome: r.produto_criado, categoria: r.categoria, preco_venda: r.preco_venda },
            })
            .then(
              () => {},
              () => {}
            );
        }
        if (chamada.name === "adicionar_estoque" && (resultado as { sucesso?: boolean }).sucesso) {
          const r = resultado as {
            produto: string;
            variante?: string;
            loja: string;
            estoque_antes: number;
            quantidade_adicionada: number;
            novo_estoque: number;
          };
          supabaseAdmin
            .from("auditoria")
            .insert({
              usuario_id: user.id,
              usuario_nome: perfil.nome,
              usuario_email: user.email || null,
              usuario_funcao: perfil.funcao,
              loja_id: perfil.loja_id,
              loja_nome: lojaNome,
              categoria: "Estoque",
              acao: "entrada_estoque",
              tipo_execucao: "manual",
              registro_tipo: "produto",
              registro_nome: r.variante ? `${r.produto} — ${r.variante}` : r.produto,
              descricao: `Estoque de "${r.produto}${r.variante ? ` — ${r.variante}` : ""}" em ${r.loja} alterado de ${r.estoque_antes} para ${r.novo_estoque} via Assistente IA (pedido: "${mensagem}")`,
              dados_antes: { estoque: r.estoque_antes },
              dados_depois: { estoque: r.novo_estoque },
            })
            .then(
              () => {},
              () => {}
            );
        }

        if (chamada.name === "transferir_estoque" && (resultado as { sucesso?: boolean }).sucesso) {
          const r = resultado as {
            produto: string;
            variante?: string | null;
            quantidade_transferida: number;
            loja_destino: string;
          };
          supabaseAdmin
            .from("auditoria")
            .insert({
              usuario_id: user.id,
              usuario_nome: perfil.nome,
              usuario_email: user.email || null,
              usuario_funcao: perfil.funcao,
              loja_id: perfil.loja_id,
              loja_nome: lojaNome,
              categoria: "Estoque",
              acao: "transferencia",
              tipo_execucao: "manual",
              registro_tipo: "produto",
              registro_nome: r.variante ? `${r.produto} — ${r.variante}` : r.produto,
              descricao: `${r.quantidade_transferida} unidade(s) de "${r.produto}${
                r.variante ? ` — ${r.variante}` : ""
              }" transferida(s) do Depósito para ${r.loja_destino} via Assistente IA (pedido: "${mensagem}")`,
            })
            .then(
              () => {},
              () => {}
            );
        }
        if (chamada.name === "editar_preco_produto" && (resultado as { sucesso?: boolean }).sucesso) {
          const r = resultado as {
            produto: string;
            variante?: string;
            preco_venda_antes: number;
            preco_venda_novo: number;
            custo_antes: number;
            custo_novo: number;
          };
          supabaseAdmin
            .from("auditoria")
            .insert({
              usuario_id: user.id,
              usuario_nome: perfil.nome,
              usuario_email: user.email || null,
              usuario_funcao: perfil.funcao,
              loja_id: perfil.loja_id,
              loja_nome: lojaNome,
              categoria: "Produtos",
              acao: "alteracao",
              tipo_execucao: "manual",
              registro_tipo: "produto",
              registro_nome: r.variante ? `${r.produto} — ${r.variante}` : r.produto,
              descricao: `Preço/custo de "${r.produto}${r.variante ? ` — ${r.variante}` : ""}" alterado via Assistente IA (pedido: "${mensagem}")`,
              dados_antes: { preco_venda: r.preco_venda_antes, custo: r.custo_antes },
              dados_depois: { preco_venda: r.preco_venda_novo, custo: r.custo_novo },
            })
            .then(
              () => {},
              () => {}
            );
        }
        if (chamada.name === "cancelar_venda" && (resultado as { sucesso?: boolean }).sucesso) {
          const r = resultado as { pedido: number; total: number };
          supabaseAdmin
            .from("auditoria")
            .insert({
              usuario_id: user.id,
              usuario_nome: perfil.nome,
              usuario_email: user.email || null,
              usuario_funcao: perfil.funcao,
              loja_id: perfil.loja_id,
              loja_nome: lojaNome,
              categoria: "Vendas",
              acao: "cancelamento",
              tipo_execucao: "manual",
              registro_tipo: "venda",
              registro_nome: `Pedido #${r.pedido}`,
              numero_pedido: r.pedido,
              descricao: `Venda #${r.pedido} (${formatarMoedaAuditoria(r.total)}) cancelada via Assistente IA (pedido: "${mensagem}")`,
            })
            .then(
              () => {},
              () => {}
            );
        }
        if (chamada.name === "criar_ou_editar_cliente" && (resultado as { sucesso?: boolean }).sucesso) {
          const r = resultado as { acao: string; cliente: string };
          supabaseAdmin
            .from("auditoria")
            .insert({
              usuario_id: user.id,
              usuario_nome: perfil.nome,
              usuario_email: user.email || null,
              usuario_funcao: perfil.funcao,
              loja_id: perfil.loja_id,
              loja_nome: lojaNome,
              categoria: "Clientes",
              acao: r.acao === "criado" ? "criacao" : "alteracao",
              tipo_execucao: "manual",
              registro_tipo: "cliente",
              registro_nome: r.cliente,
              descricao: `Cliente "${r.cliente}" ${r.acao} via Assistente IA (pedido: "${mensagem}")`,
            })
            .then(
              () => {},
              () => {}
            );
        }
        if (chamada.name === "fazer_sangria" && (resultado as { sucesso?: boolean }).sucesso) {
          const r = resultado as { valor: number; loja: string; motivo: string };
          supabaseAdmin
            .from("auditoria")
            .insert({
              usuario_id: user.id,
              usuario_nome: perfil.nome,
              usuario_email: user.email || null,
              usuario_funcao: perfil.funcao,
              loja_id: perfil.loja_id,
              loja_nome: r.loja,
              categoria: "Sangrias",
              acao: "saida_estoque",
              tipo_execucao: "manual",
              registro_tipo: "caixa",
              descricao: `Sangria de ${formatarMoedaAuditoria(r.valor)} registrada via Assistente IA (pedido: "${mensagem}")`,
              motivo: r.motivo,
            })
            .then(
              () => {},
              () => {}
            );
        }
        if (chamada.name === "marcar_item_entregue" && (resultado as { sucesso?: boolean }).sucesso) {
          const r = resultado as { pedido: number; itens_marcados: string[] };
          supabaseAdmin
            .from("auditoria")
            .insert({
              usuario_id: user.id,
              usuario_nome: perfil.nome,
              usuario_email: user.email || null,
              usuario_funcao: perfil.funcao,
              loja_id: perfil.loja_id,
              loja_nome: lojaNome,
              categoria: "Entregas",
              acao: "alteracao",
              tipo_execucao: "manual",
              registro_tipo: "venda_item",
              numero_pedido: r.pedido,
              descricao: `Item(ns) do pedido #${r.pedido} marcado(s) como entregue via Assistente IA: ${r.itens_marcados.join(", ")} (pedido: "${mensagem}")`,
            })
            .then(
              () => {},
              () => {}
            );
        }

        saidas.push({
          type: "function_call_output",
          call_id: chamada.call_id,
          output: JSON.stringify(resultado),
        });
      }

      resposta = await openai.responses.create({
        model: MODELO,
        instructions: INSTRUCOES_SISTEMA,
        previous_response_id: resposta.id,
        input: saidas,
        tools: ferramentasDisponiveis,
      });
      tokensEntrada += resposta.usage?.input_tokens || 0;
      tokensSaida += resposta.usage?.output_tokens || 0;
    }

    const textoResposta = resposta.output_text || "Não consegui gerar uma resposta.";
    const custoEstimado =
      (tokensEntrada / 1_000_000) * PRECO_ENTRADA_POR_MILHAO + (tokensSaida / 1_000_000) * PRECO_SAIDA_POR_MILHAO;

    // registra o uso (não trava a resposta se der erro aqui)
    supabaseAdmin
      .from("ia_consultas")
      .insert({
        usuario_id: user.id,
        usuario_nome: perfil.nome,
        usuario_funcao: perfil.funcao,
        loja_id: perfil.loja_id,
        loja_nome: lojaNome,
        pergunta: mensagem,
        resposta: textoResposta,
        ferramentas_usadas: ferramentasUsadas,
        modelo: MODELO,
        tokens_entrada: tokensEntrada,
        tokens_saida: tokensSaida,
        custo_estimado_usd: Math.round(custoEstimado * 1_000_000) / 1_000_000,
      })
      .then(
        () => {},
        () => {}
      );

    return NextResponse.json({ resposta: textoResposta });
  } catch (erro) {
    console.error("Erro no Assistente IA:", erro);
    supabaseAdmin
      .from("ia_consultas")
      .insert({
        usuario_id: user.id,
        usuario_nome: perfil.nome,
        usuario_funcao: perfil.funcao,
        loja_id: perfil.loja_id,
        loja_nome: lojaNome,
        pergunta: mensagem,
        modelo: MODELO,
        erro: (erro as Error).message?.slice(0, 500) || "erro desconhecido",
      })
      .then(
        () => {},
        () => {}
      );

    return NextResponse.json(
      { resposta: "Assistente IA temporariamente indisponível. Tente novamente.", indisponivel: true },
      { status: 200 }
    );
  }
}
