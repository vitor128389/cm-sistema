export type TipoEstoque = "pronta_entrega" | "sob_encomenda";

export type StatusEncomenda =
  | "aguardando_producao"
  | "produzindo"
  | "pronto"
  | "entregue";

export interface Variacao {
  tipo: string; // ex: "Tecido"
  opcoes: string[]; // ex: ["Suede", "Linho"]
}

export interface Produto {
  id: string;
  nome: string;
  categoria: string;
  foto_url: string | null;
  custo: number;
  preco_venda: number;
  lucro_valor: number;
  lucro_percentual: number;
  tipo_estoque: TipoEstoque;
  quantidade_estoque: number | null;
  variacoes: Variacao[];
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
}

export interface Cliente {
  id: string;
  nome: string;
  telefone: string | null;
  criado_em: string;
}

export interface Encomenda {
  id: string;
  cliente_id: string;
  produto_id: string;
  variacao_escolhida: string | null;
  valor_total: number;
  valor_sinal: number;
  valor_restante: number;
  status: StatusEncomenda;
  prazo_entrega: string | null;
  observacoes: string | null;
  criado_em: string;
  atualizado_em: string;
  // campos vindos de join, preenchidos na consulta
  cliente_nome?: string;
  produto_nome?: string;
}

export interface ItemNota {
  produto: string;
  qtd: number;
  valor: number;
}

export interface Nota {
  id: string;
  tipo: "venda" | "encomenda";
  encomenda_id: string | null;
  cliente_nome: string;
  itens: ItemNota[];
  valor_total: number;
  criado_em: string;
}

export const STATUS_LABEL: Record<StatusEncomenda, string> = {
  aguardando_producao: "Aguardando produção",
  produzindo: "Em produção",
  pronto: "Pronto",
  entregue: "Entregue",
};

export const STATUS_ORDEM: StatusEncomenda[] = [
  "aguardando_producao",
  "produzindo",
  "pronto",
  "entregue",
];

/* ---------------- Tipos usados na tela de Vender ---------------- */

export type TipoPrecificacao = "simples" | "tecido" | "espessura";
export type TipoEntregaItem = "pronta" | "encomenda";
export type FormaPagamento = "Dinheiro" | "Pix" | "Débito" | "Crédito";

export interface ProdutoVariante {
  id: string;
  produto_id: string;
  nome_variante: string; // "Suede", "Linho", "Veludo", "5cm", "7cm", "14cm"
  preco_avista: number;
  custo: number;
  estoque: number;
}

export interface ProdutoComVariantes {
  id: string;
  nome: string;
  categoria: string;
  custo: number;
  preco_venda: number; // preço à vista "base", usado quando tipo_precificacao = simples
  quantidade_estoque: number | null; // estoque simples
  tipo_precificacao: TipoPrecificacao;
  produto_variantes: ProdutoVariante[];
}

export interface TecidoCor {
  id: string;
  tecido: string;
  codigo: string;
  nome: string;
  disponivel: boolean;
}

export interface ItemCarrinho {
  produtoId: string;
  nome: string;
  categoria: string;
  quantidade: number;
  valorUnitario: number; // preço "a prazo" (o que aparece na tela)
  valorAVista: number; // preço à vista dessa variação específica
  varianteId: string | null; // id de produto_variantes, se houver
  varianteNome: string | null; // "Suede", "5cm", etc.
  cor: string | null; // texto tipo "Suede — Cor 12 (Ivory)" ou "Espessura 5cm"
  modelo: string | null; // "Capitonê", "Quadrado", "Vertical", "V" — cabeceiras, Poltrona/Namoradeira Benny
  tipoEntrega: TipoEntregaItem;
  retirada: boolean; // cliente vai retirar na loja (derivado — true quando 100% retirada)
  quantidadeRetirada: number;
  quantidadeEntrega: number;
  observacao: string | null;
}

export type FormaRecebimento = "retirada" | "entrega" | "misto";


/* ---------------- Caixa, Movimento, Administração ---------------- */

export interface Caixa {
  id: string;
  nome: string;
  ativo: boolean;
}

export interface TurnoCaixa {
  id: string;
  caixa_id: string;
  fundo_inicial: number;
  status: "aberto" | "fechado";
  total_vendido: number;
  total_dinheiro: number;
  total_pix: number;
  total_debito: number;
  total_credito: number;
  total_devolvido: number;
  aberto_em: string;
  fechado_em: string | null;
}

export interface VendaItem {
  id: string;
  venda_id: string;
  produto_id: string | null;
  nome_produto: string;
  variante: string | null;
  quantidade: number;
  valor_unitario: number;
  total: number;
  tipo_entrega: TipoEntregaItem;
  status_entrega: "encomenda" | "entregue" | null;
  data_entregue: string | null;
  retirada: boolean;
  quantidade_retirada: number;
  quantidade_entrega: number;
  trocado: boolean;
  observacao: string | null;
  produtos?: { custo: number } | null;
}

export interface Sangria {
  id: string;
  turno_caixa_id: string;
  loja_id: string;
  valor: number;
  motivo: string;
  usuario_id: string | null;
  criado_em: string;
  usuarios?: { nome: string } | null;
}

export interface Troca {
  id: string;
  numero_troca: number;
  venda_original_id: string;
  venda_item_original_id: string;
  produto_original_nome: string;
  variante_original: string | null;
  quantidade: number;
  produto_novo_id: string;
  variante_novo_id: string | null;
  produto_novo_nome: string;
  variante_novo: string | null;
  valor_produto_original: number;
  valor_produto_novo: number;
  diferenca: number;
  forma_pagamento_diferenca: string | null;
  turno_caixa_id: string | null;
  loja_id: string;
  criado_em: string;
}

export interface TrocaItemDevolvido {
  id: string;
  troca_id: string;
  venda_item_original_id: string;
  produto_id: string | null;
  variante_id: string | null;
  produto_nome: string;
  variante: string | null;
  quantidade: number;
  valor_unitario_avista: number;
  valor_unitario_aprazo: number;
}

export interface TrocaItemNovo {
  id: string;
  troca_id: string;
  produto_id: string;
  variante_id: string | null;
  produto_nome: string;
  variante: string | null;
  quantidade: number;
  valor_unitario_avista: number;
  valor_unitario_aprazo: number;
  tipo_entrega: "pronta" | "encomenda";
}

export interface TrocaGrupo {
  id: string;
  numero_troca: number;
  venda_original_id: string;
  tipo_preco: "avista" | "aprazo";
  valor_devolvido_total: number;
  valor_novo_total: number;
  diferenca: number;
  forma_pagamento_diferenca: string | null;
  turno_caixa_id: string | null;
  loja_id: string;
  criado_em: string;
  trocas_devolvidos?: TrocaItemDevolvido[];
  trocas_novos?: TrocaItemNovo[];
  vendas?: {
    numero_pedido: number;
    clientes?: {
      nome: string;
      cpf?: string | null;
      telefone?: string | null;
      endereco?: string | null;
      numero?: string | null;
      complemento?: string | null;
      cidade?: string | null;
    } | null;
  } | null;
}

export interface VendaPagamento {
  id: string;
  venda_id: string;
  forma_pagamento: FormaPagamento;
  parcelas: number;
  valor: number;
}

export interface LojaCompleta {
  id: string;
  nome: string;
  ativo: boolean;
  cep: string | null;
  rua: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  telefone: string | null;
}

export interface Venda {
  id: string;
  numero_pedido: number;
  turno_caixa_id: string | null;
  cliente_id: string | null;
  loja_id: string;
  forma_pagamento: FormaPagamento | "Dividido";
  parcelas: number;
  subtotal: number;
  ajuste: number;
  total: number;
  prazo_entrega_maximo: string | null;
  forma_recebimento: FormaRecebimento | null;
  criado_em: string;
  clientes?: {
    nome: string;
    cpf?: string | null;
    telefone?: string | null;
    endereco?: string | null;
    numero?: string | null;
    complemento?: string | null;
    cidade?: string | null;
  } | null;
  lojas?: LojaCompleta | null;
  venda_itens?: VendaItem[];
  venda_pagamentos?: VendaPagamento[];
}

export interface ClienteCompleto {
  id: string;
  nome: string;
  cpf: string | null;
  telefone: string | null;
  endereco: string | null;
  numero: string | null;
  complemento: string | null;
  cidade: string | null;
  criado_em: string;
}

export interface EstoqueLoja {
  id: string;
  loja_id: string;
  produto_id: string;
  variante_id: string | null;
  quantidade: number;
}

export interface Usuario {
  id: string;
  nome: string;
  funcao: "admin" | "gerente" | "vendedor" | "producao" | "caixa";
  loja_id: string | null;
  caixa_id: string | null;
  cpf: string | null;
  email: string | null;
  ativo: boolean;
}

export interface Permissao {
  funcao: "admin" | "gerente" | "vendedor" | "producao" | "caixa";
  tela: string;
  pode_acessar: boolean;
}


