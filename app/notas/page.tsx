"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { carregarContextoTroca, type ItemRestante } from "@/lib/trocaContexto";
import { formatarMoeda } from "@/lib/format";
import ComprovanteImpressao from "@/components/ComprovanteImpressao";
import ComprovanteCupom88mm from "@/components/ComprovanteCupom88mm";
import ComprovanteTroca from "@/components/ComprovanteTroca";
import ComprovanteTrocaCupom88mm from "@/components/ComprovanteTrocaCupom88mm";
import { useLoja } from "@/contexts/LojaContext";
import { gerarNotaSimplesPdf } from "@/lib/gerarNotaSimplesPdf";
import { montarNotaDaTroca } from "@/lib/notaDaTroca";
import { definirTamanhoPagina, ajustarEscalaImpressaoA4 } from "@/lib/imprimir";
import { registrarAuditoria } from "@/lib/auditoria";
import type { Venda, LojaCompleta, TrocaGrupo } from "@/types";

function apenasNumeros(v: string) {
  return v.replace(/\D/g, "");
}

const MENSAGENS_PRONTAS: Record<string, (nome: string, pedido: number) => string> = {
  atraso: (nome, pedido) =>
    `Olá, ${nome}! Aqui é da loja. Peço desculpas pelo atraso na entrega do seu pedido #${pedido} — já estamos resolvendo e te avisamos assim que tiver novidade. Obrigado pela paciência!`,
  pronto: (nome, pedido) =>
    `Olá, ${nome}! Seu pedido #${pedido} já está pronto para retirada na loja. Te esperamos!`,
  saindo: (nome, pedido) =>
    `Olá, ${nome}! Seu pedido #${pedido} está saindo para entrega agora. Em breve chega até você!`,
  entregue: (nome, pedido) =>
    `Olá, ${nome}! Confirmamos a entrega do seu pedido #${pedido}. Muito obrigado pela confiança, qualquer coisa estamos à disposição!`,
  lembrete: (nome, pedido) =>
    `Olá, ${nome}! Passando pra lembrar sobre o pedido #${pedido}. Qualquer dúvida, estamos à disposição.`,
  agradecimento: (nome, pedido) =>
    `Olá, ${nome}! Muito obrigado pela sua compra (pedido #${pedido})! Qualquer coisa, estamos à disposição.`,
};

function linkWhatsApp(telefone: string, mensagem: string): string {
  const numero = apenasNumeros(telefone);
  const comDDI = numero.length <= 11 ? `55${numero}` : numero;
  // Link universal (wa.me) em vez do esquema "whatsapp://" — esse esquema
  // força a abrir sempre o WhatsApp normal; o link https:// deixa o
  // celular/computador escolher entre WhatsApp normal e Business (se os
  // dois estiverem instalados).
  return `https://wa.me/${comDDI}?text=${encodeURIComponent(mensagem)}`;
}

function diasRestantes(prazo: string): number {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const dataPrazo = new Date(prazo + "T00:00:00");
  return Math.round((dataPrazo.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
}

function pedidoPendente(v: Venda): boolean {
  return (
    !v.cancelada &&
    !!v.prazo_entrega_maximo &&
    (v.venda_itens || []).some((i) => i.status_entrega === "encomenda")
  );
}

function temItemRetirada(v: Venda): boolean {
  return (v.venda_itens || []).some((i) => i.retirada);
}

function pedidoEntregue(v: Venda): boolean {
  const rastreados = (v.venda_itens || []).filter((i) => i.status_entrega !== null);
  return rastreados.length > 0 && rastreados.every((i) => i.status_entrega === "entregue");
}

// distribui o total realmente pago (com desconto/acréscimo da forma de
// pagamento) proporcionalmente entre os itens, em vez de mostrar o preço
// "a prazo" de cada item isolado (que não bate com o total pago)
// Na lista, sofá "2 e 3 lugares" vendido como conjunto vira UM item só (igual
// na nota impressa) e peça única aparece como "Sofá X 2 lugares — cor".
type ItemLista = Venda["venda_itens"] extends (infer U)[] | undefined ? U : never;
function itensParaLista(itens: ItemLista[]): { item: ItemLista; ids: string[]; total: number }[] {
  const resultado: { item: ItemLista; ids: string[]; total: number }[] = [];
  const usados = new Set<number>();
  itens.forEach((item, i) => {
    if (usados.has(i)) return;
    const variante = item.variante || "";
    const sufixoNome = /\s*2\s*E\s*3\s*LUGARES\s*/i;
    if (variante.endsWith("— 2 Lugares") || variante.endsWith("— 3 Lugares")) {
      const peca = variante.endsWith("— 2 Lugares") ? "2" : "3";
      const prefixo = variante.slice(0, -"2 Lugares".length);
      const outra = peca === "2" ? "3" : "2";
      const idxPar = itens.findIndex(
        (o, j) =>
          j !== i &&
          !usados.has(j) &&
          o.nome_produto === item.nome_produto &&
          (o.variante || "") === `${prefixo}${outra} Lugares` &&
          o.tipo_entrega === item.tipo_entrega &&
          o.retirada === item.retirada
      );
      if (idxPar !== -1 && peca === "3") {
        // a peça de 3 é tratada junto com a de 2 (quando a de 2 chegar)
        const idx2 = itens.findIndex((o, j) => j > i && !usados.has(j) && o.id === itens[idxPar].id);
        if (idx2 !== -1) return;
      }
      if (idxPar !== -1 && peca === "2") {
        const par = itens[idxPar];
        usados.add(i);
        usados.add(idxPar);
        const jaTemNoNome = sufixoNome.test(item.nome_produto);
        resultado.push({
          item: {
            ...item,
            variante: jaTemNoNome ? prefixo.replace(/\s*—\s*$/, "").trim() || null : `${prefixo}2 e 3 Lugares`,
          },
          ids: [item.id, par.id],
          total: item.total + par.total,
        });
        return;
      }
      if (idxPar === -1) {
        // peça única: "Sofá Nobre 2 lugares — cor"
        const nome = item.nome_produto.replace(sufixoNome, " ").replace(/\s+/g, " ").trim();
        const cor = prefixo.replace(/\s*—\s*$/, "").trim();
        resultado.push({
          item: { ...item, nome_produto: `${nome} ${peca} Lugares`, variante: cor || null },
          ids: [item.id],
          total: item.total,
        });
        return;
      }
    }
    resultado.push({ item, ids: [item.id], total: item.total });
  });
  return resultado;
}

function valorPagoItem(item: { total: number }, itensTodos: { total: number }[], totalPago: number): number {
  const somaListada = itensTodos.reduce((s, i) => s + i.total, 0);
  if (somaListada <= 0) return 0;
  return Math.round(totalPago * (item.total / somaListada) * 100) / 100;
}

interface NotaFiscal {
  id: string;
  venda_id: string;
  ambiente: "homologacao" | "producao";
  status: "processando" | "autorizada" | "erro" | "cancelada";
  numero: string | null;
  mensagem: string | null;
  url_danfe: string | null;
}

export default function NotasPage() {
  const { lojaAtual, souAdmin } = useLoja();
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erroCarregar, setErroCarregar] = useState("");
  const [periodo, setPeriodo] = useState<"hoje" | "ontem" | "personalizado" | "todos">("todos");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [busca, setBusca] = useState("");
  const [somenteAberto, setSomenteAberto] = useState(true);
  const [ordenarPorPrazo, setOrdenarPorPrazo] = useState<"" | "atrasado" | "recente">("");
  const [somenteRetirada, setSomenteRetirada] = useState(false);
  const [somenteEntregues, setSomenteEntregues] = useState(false);
  const [filtroDesconto, setFiltroDesconto] = useState<"todas" | "com" | "sem">("todas");
  const [filtroRota, setFiltroRota] = useState<string>("todas");
  const [rotasParaFiltro, setRotasParaFiltro] = useState<{ id: string; nome: string; cor: string; cidade: string | null }[]>([]);
  const [todasLojas, setTodasLojas] = useState<{ id: string; nome: string }[]>([]);
  const [lojasFiscais, setLojasFiscais] = useState<Map<string, string>>(new Map());
  const [notasFiscais, setNotasFiscais] = useState<Record<string, NotaFiscal>>({});
  const [emitindo, setEmitindo] = useState<string | null>(null);
  const [notaImprimindo, setNotaImprimindo] = useState<Venda | null>(null);
  const [editEnd, setEditEnd] = useState<{
    vendaId: string;
    numeroPedido: number;
    clienteId: string;
    campos: Record<"nome" | "telefone" | "telefone2_nome" | "telefone2" | "cpf" | "endereco" | "numero" | "complemento" | "bairro" | "cidade" | "povoado", string>;
    prazo: string;
    rotaId: string;
    itens: {
      id: string;
      nome_produto: string;
      variante: string;
      observacao: string;
      // sofá 2 e 3 lugares = 2 linhas no banco (peça de 2 + peça de 3), mas aqui é UM produto só
      partes?: { id: string; peca: string; sufixo: string; obs: string }[];
    }[];
    original: string;
  } | null>(null);
  const [salvandoEnd, setSalvandoEnd] = useState(false);
  const [erroEnd, setErroEnd] = useState("");
  const [rotuloNota, setRotuloNota] = useState<string | undefined>(undefined);
  const [modoTroca, setModoTroca] = useState<Record<string, boolean>>({});
  const [trocaImprimindo, setTrocaImprimindo] = useState<TrocaGrupo | null>(null);
  const [itensRestantes, setItensRestantes] = useState<ItemRestante[] | undefined>(undefined);
  const [lojaImprimindo, setLojaImprimindo] = useState<LojaCompleta | null>(null);
  const [formatoImpressao, setFormatoImpressao] = useState<"a4" | "cupom88">("a4");
  const [mensagemSelecionada, setMensagemSelecionada] = useState<Record<string, string>>({});
  const [trocas, setTrocas] = useState<TrocaGrupo[]>([]);

  async function carregarTrocas() {
    let query = supabase
      .from("trocas_grupo")
      .select("*, vendas(numero_pedido, clientes(nome, cpf, telefone, telefone2, telefone2_nome, endereco, numero, complemento, cidade, povoado, bairro)), trocas_devolvidos(*), trocas_novos(*)")
      .order("criado_em", { ascending: false });
    if (lojaAtual) query = query.eq("loja_id", lojaAtual);
    const { data, error } = await query;
    if (error) {
      // eslint-disable-next-line no-console
      console.error("Erro ao carregar trocas:", error);
      return;
    }
    setTrocas((data || []) as unknown as TrocaGrupo[]);
  }

  async function carregar() {
    setCarregando(true);
    setErroCarregar("");

    let query = supabase
      .from("vendas")
      .select("*, clientes(nome, cpf, telefone, telefone2, telefone2_nome, endereco, numero, complemento, cidade, povoado, bairro), venda_itens(*), venda_pagamentos(*)")
      .order("criado_em", { ascending: false });
    if (lojaAtual) query = query.eq("loja_id", lojaAtual);
    let { data, error } = await query;

    if (error) {
      // eslint-disable-next-line no-console
      console.error("Erro ao carregar notas (consulta completa):", error);
      // tenta de novo sem venda_pagamentos — pode ser que essa tabela ainda
      // não exista nesse banco (migração v8 não aplicada)
      let queryReserva = supabase
        .from("vendas")
        .select("*, clientes(nome, cpf, telefone, telefone2, telefone2_nome, endereco, numero, complemento, cidade, povoado, bairro), venda_itens(*)")
        .order("criado_em", { ascending: false });
      if (lojaAtual) queryReserva = queryReserva.eq("loja_id", lojaAtual);
      const retry = await queryReserva;
      data = retry.data;
      error = retry.error;
      if (error) {
        // eslint-disable-next-line no-console
        console.error("Erro ao carregar notas (consulta de reserva):", error);
        setErroCarregar(
          "Não deu pra carregar as notas: " +
            (error.message || "erro desconhecido") +
            ". Confira se todas as migrações do banco (v4 a v9) foram aplicadas."
        );
      } else {
        setErroCarregar(
          "Algumas informações de pagamento não carregaram (é possível que a migração supabase-schema-v8.sql ainda não tenha sido rodada nesse banco), mas as notas abaixo já aparecem."
        );
      }
    }

    setVendas((data || []) as unknown as Venda[]);
    setCarregando(false);
  }

  useEffect(() => {
    carregar();
    carregarTrocas();
    carregarRotasParaFiltro();
    setFiltroRota("todas");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lojaAtual]);

  async function carregarRotasParaFiltro() {
    let query = supabase.from("rotas_entrega").select("id, nome, cor, cidade").order("nome");
    if (lojaAtual) query = query.eq("loja_id", lojaAtual);
    const { data } = await query;
    setRotasParaFiltro(data || []);
  }

  async function carregarNotasFiscais() {
    const { data: lojasF } = await supabase.from("lojas").select("id, fiscal_ambiente").eq("fiscal_ativo", true);
    const ambientes = new Map<string, string>((lojasF || []).map((l) => [l.id as string, l.fiscal_ambiente as string]));
    setLojasFiscais(ambientes);
    const { data } = await supabase
      .from("notas_fiscais")
      .select("*")
      .eq("tipo", "nfce")
      .order("criado_em", { ascending: true });
    const mapa: Record<string, NotaFiscal> = {};
    // só vale a nota do ambiente atual da loja (nota de teste não conta quando a loja está em produção);
    // a mais recente de cada venda vence (exceto nota com erro, que não esconde uma autorizada)
    (data || []).forEach((n) => {
      if (ambientes.get(n.loja_id as string) !== n.ambiente) return;
      const atual = mapa[n.venda_id as string];
      if (!atual || n.status !== "erro" || atual.status === "erro") mapa[n.venda_id as string] = n as NotaFiscal;
    });
    setNotasFiscais(mapa);
  }

  async function chamarFiscal(rota: string, corpo: Record<string, unknown>) {
    const resp = await fetch(`/api/fiscal/${rota}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    const json = await resp.json();
    if (!resp.ok) throw new Error(json.error || "Erro ao falar com a nota fiscal.");
    return json.nota as NotaFiscal;
  }

  async function emitirNota(v: Venda) {
    const real = lojasFiscais.get(v.loja_id) === "producao";
    const aviso = real
      ? `ATENÇÃO: isso emite uma NOTA FISCAL REAL (valor fiscal, vai para a SEFAZ) do pedido #${v.numero_pedido}, no valor de ${formatarMoeda(v.total)}. Confirmar?`
      : `Emitir nota fiscal de TESTE (sem valor fiscal) do pedido #${v.numero_pedido}?`;
    if (!confirm(aviso)) return;
    setEmitindo(v.id);
    try {
      const nota = await chamarFiscal("emitir", { vendaId: v.id });
      setNotasFiscais((atual) => ({ ...atual, [v.id]: nota }));
      if (nota.status === "erro") alert("A nota foi rejeitada: " + (nota.mensagem || "sem detalhes"));
      else if (nota.status === "processando") alert("A nota ainda está sendo processada pela SEFAZ. Clique em Atualizar em instantes.");
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setEmitindo(null);
    }
  }

  async function atualizarNota(v: Venda) {
    const n = notasFiscais[v.id];
    if (!n) return;
    setEmitindo(v.id);
    try {
      const nota = await chamarFiscal("consultar", { notaId: n.id });
      setNotasFiscais((atual) => ({ ...atual, [v.id]: nota }));
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setEmitindo(null);
    }
  }

  async function cancelarNota(v: Venda) {
    const n = notasFiscais[v.id];
    if (!n) return;
    const motivo = prompt("Motivo do cancelamento da nota fiscal (mínimo 15 caracteres):");
    if (!motivo) return;
    setEmitindo(v.id);
    try {
      const nota = await chamarFiscal("cancelar", { notaId: n.id, justificativa: motivo });
      setNotasFiscais((atual) => ({ ...atual, [v.id]: nota }));
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setEmitindo(null);
    }
  }

  useEffect(() => {
    carregarNotasFiscais();
  }, [lojaAtual]);

  useEffect(() => {
    async function carregarTodasLojas() {
      const { data } = await supabase.from("lojas").select("id, nome").eq("eh_deposito", false).order("nome");
      setTodasLojas(data || []);
    }
    carregarTodasLojas();
  }, []);

  function dentroDoPeriodo(dataStr: string): boolean {
    if (periodo === "todos") return true;
    const data = new Date(dataStr);
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    if (periodo === "hoje") {
      const fim = new Date(hoje);
      fim.setHours(23, 59, 59, 999);
      return data >= hoje && data <= fim;
    }
    if (periodo === "ontem") {
      const inicio = new Date(hoje);
      inicio.setDate(inicio.getDate() - 1);
      const fim = new Date(inicio);
      fim.setHours(23, 59, 59, 999);
      return data >= inicio && data <= fim;
    }
    if (periodo === "personalizado") {
      const inicio = de ? new Date(de + "T00:00:00") : new Date(2000, 0, 1);
      const fim = ate ? new Date(ate + "T23:59:59") : new Date(2100, 0, 1);
      return data >= inicio && data <= fim;
    }
    return true;
  }

  // busca única: casa por número do pedido, nome do cliente ou CPF
  // (com ou sem pontuação)
  function bateComBusca(v: Venda, termo: string): boolean {
    const alvo = termo.trim().toLowerCase();
    if (!alvo) return true;
    if (String(v.numero_pedido).includes(alvo)) return true;
    if (v.clientes?.nome?.toLowerCase().includes(alvo)) return true;
    if (v.clientes?.cidade?.toLowerCase().includes(alvo)) return true;
    if (v.clientes?.povoado?.toLowerCase().includes(alvo)) return true;
    if (v.clientes?.endereco?.toLowerCase().includes(alvo)) return true;
    if (v.clientes?.bairro?.toLowerCase().includes(alvo)) return true;
    const cpfDigitos = apenasNumeros(alvo);
    if (cpfDigitos.length >= 3 && (v.clientes?.cpf || "").includes(cpfDigitos)) return true;
    if ((v.venda_itens || []).some((i) => i.nome_produto?.toLowerCase().includes(alvo))) return true;
    return false;
  }

  function temDesconto(v: Venda): boolean {
    // só conta como "com desconto" quando tiver valor E motivo preenchido —
    // isso evita mostrar aqui os poucos casos antigos com desconto sem
    // motivo (que já corrigimos, mas podem existir alguns registros assim)
    if ((v.desconto_geral || 0) > 0 && !!v.motivo_desconto_geral?.trim()) return true;
    return (v.venda_itens || []).some((i) => (i.desconto || 0) > 0 && !!i.motivo_desconto?.trim());
  }

  const vendasFiltradas = vendas
    .filter((v) => {
      if (somenteAberto && !pedidoPendente(v)) return false;
      if (somenteRetirada && !temItemRetirada(v)) return false;
      if (somenteEntregues && !pedidoEntregue(v)) return false;
      if (filtroDesconto === "com" && !temDesconto(v)) return false;
      if (filtroDesconto === "sem" && temDesconto(v)) return false;
      if (filtroRota !== "todas" && v.rota_id !== filtroRota) return false;
      if (busca.trim()) return bateComBusca(v, busca);
      return dentroDoPeriodo(v.criado_em);
    })
    .sort((a, b) => {
      if (!ordenarPorPrazo) return 0;
      // pedido sem prazo definido sempre vai pro final, não atrapalha quem tem prazo
      if (!a.prazo_entrega_maximo && !b.prazo_entrega_maximo) return 0;
      if (!a.prazo_entrega_maximo) return 1;
      if (!b.prazo_entrega_maximo) return -1;
      const diasA = diasRestantes(a.prazo_entrega_maximo as string);
      const diasB = diasRestantes(b.prazo_entrega_maximo as string);
      return ordenarPorPrazo === "atrasado" ? diasA - diasB : diasB - diasA;
    });

  const pedidosVencendoLogo = vendas.filter(
    (v) => pedidoPendente(v) && diasRestantes(v.prazo_entrega_maximo as string) <= 2
  );

  async function imprimirTroca(t: TrocaGrupo, formato: "a4" | "cupom88" = "a4") {
    setNotaImprimindo(null);
    const ctx = await carregarContextoTroca(supabase, t);
    setTrocaImprimindo(ctx.troca);
    setItensRestantes(ctx.restantes);
    setFormatoImpressao(formato);
    if (t.loja_id) {
      const { data } = await supabase.from("lojas").select("*").eq("id", t.loja_id).maybeSingle();
      setLojaImprimindo(data as LojaCompleta | null);
    } else {
      setLojaImprimindo(null);
    }
    definirTamanhoPagina(formato);
    setTimeout(async () => {
      if (formato === "a4") await ajustarEscalaImpressaoA4();
      window.print();
    }, 100);
  }

  // Nota da troca = nota normal só com o que o cliente ficou (itens que
  // continuam + produtos novos), com o número da troca no topo.
  async function imprimirNotaTroca(v: Venda, t: TrocaGrupo, formato: "a4" | "cupom88" = "a4") {
    await imprimir(montarNotaDaTroca(v, t), formato, "TROCA");
  }

  async function imprimir(v: Venda, formato: "a4" | "cupom88" = "a4", rotulo?: string) {
    setRotuloNota(rotulo);
    setTrocaImprimindo(null);
    setNotaImprimindo(v);
    setFormatoImpressao(formato);
    if (v.loja_id) {
      const { data } = await supabase.from("lojas").select("*").eq("id", v.loja_id).maybeSingle();
      setLojaImprimindo(data as LojaCompleta | null);
    } else {
      setLojaImprimindo(null);
    }
    definirTamanhoPagina(formato);
    setTimeout(async () => {
      if (formato === "a4") await ajustarEscalaImpressaoA4();
      window.print();
    }, 100);
  }

  async function marcarEntregue(itemIds: string | string[]) {
    const ids = Array.isArray(itemIds) ? itemIds : [itemIds];
    await supabase
      .from("venda_itens")
      .update({ status_entrega: "entregue", data_entregue: new Date().toISOString() })
      .in("id", ids);
    ids.forEach((itemId) =>
      registrarAuditoria({
        lojaId: lojaAtual,
        categoria: "Entregas",
        acao: "alteracao",
        registroTipo: "venda_item",
        registroId: itemId,
        descricao: "Item marcado como entregue",
        dadosDepois: { status_entrega: "entregue" },
      })
    );
    carregar();
  }

  function enviarWhatsApp(v: Venda) {
    const telefone = v.clientes?.telefone;
    if (!telefone) {
      alert("Esse cliente não tem celular cadastrado.");
      return;
    }
    const chave = mensagemSelecionada[v.id] || "agradecimento";
    const mensagem = MENSAGENS_PRONTAS[chave](v.clientes?.nome || "cliente", v.numero_pedido);
    window.open(linkWhatsApp(telefone, mensagem), "_blank", "noopener");
  }

  function abrirEdicaoEndereco(v: Venda) {
    if (!souAdmin || !v.cliente_id || !v.clientes) return;
    const c = v.clientes;
    setErroEnd("");
    const estado = {
      vendaId: v.id,
      numeroPedido: v.numero_pedido,
      clienteId: v.cliente_id,
      campos: {
        nome: c.nome || "",
        telefone: c.telefone || "",
        telefone2_nome: c.telefone2_nome || "",
        telefone2: c.telefone2 || "",
        cpf: c.cpf || "",
        endereco: c.endereco || "",
        numero: c.numero || "",
        complemento: c.complemento || "",
        bairro: c.bairro || "",
        cidade: c.cidade || "",
        povoado: c.povoado || "",
      },
      prazo: v.prazo_entrega_maximo || "",
      rotaId: v.rota_id || "",
      itens: (() => {
        const lista = v.venda_itens || [];
        const usados = new Set<string>();
        const resultado: NonNullable<typeof editEnd>["itens"] = [];
        const padrao = /^(.*) — (2|3) Lugares(.*)$/;
        for (const i of lista) {
          if (usados.has(i.id)) continue;
          const m = i.variante ? padrao.exec(i.variante) : null;
          if (m) {
            const par = lista.find((o) => {
              if (o.id === i.id || usados.has(o.id) || !o.variante) return false;
              const mo = padrao.exec(o.variante);
              return !!mo && mo[2] !== m[2] && mo[1] === m[1] && o.nome_produto === i.nome_produto;
            });
            if (par) {
              const mp = padrao.exec(par.variante as string) as RegExpExecArray;
              usados.add(i.id);
              usados.add(par.id);
              const duas = m[2] === "2" ? { i, m } : { i: par, m: mp };
              const tres = m[2] === "2" ? { i: par, m: mp } : { i, m };
              resultado.push({
                id: duas.i.id,
                nome_produto: i.nome_produto || "",
                variante: m[1],
                observacao: duas.i.observacao || tres.i.observacao || "",
                partes: [
                  { id: duas.i.id, peca: "2", sufixo: duas.m[3], obs: duas.i.observacao || "" },
                  { id: tres.i.id, peca: "3", sufixo: tres.m[3], obs: tres.i.observacao || "" },
                ],
              });
              continue;
            }
          }
          usados.add(i.id);
          resultado.push({
            id: i.id,
            nome_produto: i.nome_produto || "",
            variante: i.variante || "",
            observacao: i.observacao || "",
          });
        }
        return resultado;
      })(),
    };
    setEditEnd({ ...estado, original: JSON.stringify(estado) });
  }

  async function salvarEdicaoEndereco() {
    if (!souAdmin || !editEnd) return;
    if (!editEnd.campos.nome.trim()) return setErroEnd("O nome do cliente não pode ficar vazio.");
    setSalvandoEnd(true);
    setErroEnd("");
    const orig = JSON.parse(editEnd.original) as typeof editEnd;
    const vazioNull = (t: string) => t.trim() || null;
    try {
      const camposCliente = Object.fromEntries(
        Object.entries(editEnd.campos).map(([k, val]) => [k, k === "nome" ? val.trim() : vazioNull(val)])
      );
      if (JSON.stringify(editEnd.campos) !== JSON.stringify(orig.campos)) {
        const { error } = await supabase.from("clientes").update(camposCliente).eq("id", editEnd.clienteId);
        if (error) throw error;
      }
      if (editEnd.prazo !== orig.prazo) {
        const { error } = await supabase
          .from("vendas")
          .update({ prazo_entrega_maximo: editEnd.prazo || null })
          .eq("id", editEnd.vendaId);
        if (error) throw error;
      }
      if (editEnd.rotaId !== orig.rotaId) {
        const rt = rotasParaFiltro.find((x) => x.id === editEnd.rotaId);
        const { error } = await supabase
          .from("vendas")
          .update({
            rota_id: rt?.id ?? null,
            rota_nome: rt?.nome ?? null,
            rota_cidade: rt?.cidade ?? null,
            rota_cor: rt?.cor ?? null,
          })
          .eq("id", editEnd.vendaId);
        if (error) throw error;
      }
      for (const it of editEnd.itens) {
        const o = orig.itens.find((x) => x.id === it.id);
        if (!o || JSON.stringify(o) === JSON.stringify(it)) continue;
        if (!it.nome_produto.trim()) throw new Error("O nome do produto não pode ficar vazio.");
        if (it.partes) {
          // conjunto 2 e 3 lugares: aplica nas duas peças, mantendo "— 2 Lugares" / "— 3 Lugares"
          const comObs = it.partes.filter((pt) => pt.obs.trim());
          const alvos = new Set((comObs.length > 0 ? comObs : [it.partes[0]]).map((pt) => pt.id));
          for (const pt of it.partes) {
            const base = it.variante.trim();
            const variante = base ? `${base} — ${pt.peca} Lugares${pt.sufixo}` : `${pt.peca} Lugares${pt.sufixo}`;
            const mudanca: Record<string, string | null> = { nome_produto: it.nome_produto.trim(), variante };
            if (alvos.has(pt.id)) mudanca.observacao = vazioNull(it.observacao);
            const { error } = await supabase.from("venda_itens").update(mudanca).eq("id", pt.id);
            if (error) throw error;
          }
          continue;
        }
        const { error } = await supabase
          .from("venda_itens")
          .update({
            nome_produto: it.nome_produto.trim(),
            variante: vazioNull(it.variante),
            observacao: vazioNull(it.observacao),
          })
          .eq("id", it.id);
        if (error) throw error;
      }
    } catch (e) {
      setSalvandoEnd(false);
      return setErroEnd("Não consegui salvar: " + (e instanceof Error ? e.message : (e as { message?: string }).message || "erro"));
    }
    setSalvandoEnd(false);
    registrarAuditoria({
      lojaId: lojaAtual,
      categoria: "Vendas",
      acao: "alteracao",
      registroTipo: "venda",
      registroId: editEnd.vendaId,
      registroNome: editEnd.campos.nome,
      numeroPedido: editEnd.numeroPedido,
      descricao: `Dados da nota #${editEnd.numeroPedido} editados pelo admin`,
      dadosAntes: { campos: orig.campos, prazo: orig.prazo, rotaId: orig.rotaId, itens: orig.itens },
      dadosDepois: { campos: editEnd.campos, prazo: editEnd.prazo, rotaId: editEnd.rotaId, itens: editEnd.itens },
    });
    setEditEnd(null);
    carregar();
  }

  function trocaAtiva(v: Venda): TrocaGrupo | null {
    if (!modoTroca[v.id]) return null;
    return trocas.find((t) => t.venda_original_id === v.id && !t.cancelada) ?? null;
  }

  async function enviarPdfTrocaWhatsApp(t: TrocaGrupo, v: Venda) {
    await enviarPdfWhatsApp(montarNotaDaTroca(v, t), "TROCA");
  }

  async function enviarPdfWhatsApp(v: Venda, rotulo?: string) {
    let loja: LojaCompleta | null = null;
    if (v.loja_id) {
      const { data } = await supabase.from("lojas").select("*").eq("id", v.loja_id).maybeSingle();
      loja = data as LojaCompleta | null;
    }

    const blob = await gerarNotaSimplesPdf(v, loja, rotulo || "PEDIDO");
    const nomeArquivo = rotulo ? `troca-${v.numero_pedido}.pdf` : `pedido-${v.numero_pedido}.pdf`;
    const arquivo = new File([blob], nomeArquivo, { type: "application/pdf" });

    // No celular, abre o menu de compartilhar do sistema já com o PDF
    // pronto — o usuário só escolhe o WhatsApp na lista.
    if (typeof navigator !== "undefined" && "canShare" in navigator && navigator.canShare({ files: [arquivo] })) {
      try {
        await navigator.share({
          files: [arquivo],
          title: `${rotulo ? "Troca" : "Pedido"} #${v.numero_pedido}`,
          text: `${rotulo ? "Troca" : "Pedido"} #${v.numero_pedido} — ${v.clientes?.nome || "cliente"}`,
        });
        return;
      } catch {
        // usuário cancelou o compartilhamento — não faz nada
        return;
      }
    }

    // No computador (sem suporte a compartilhar arquivo): baixa o PDF
    // e abre o WhatsApp Web/Desktop pra anexar manualmente.
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = nomeArquivo;
    link.click();
    URL.revokeObjectURL(url);

    const telefone = v.clientes?.telefone;
    if (telefone) {
      alert("PDF baixado. O WhatsApp vai abrir — é só anexar o arquivo baixado na conversa.");
      window.open(linkWhatsApp(telefone, `Segue ${rotulo ? "a nota da troca" : "o pedido"} #${v.numero_pedido} em PDF.`), "_blank", "noopener");
    } else {
      alert("PDF baixado. Esse cliente não tem celular cadastrado pra abrir o WhatsApp direto.");
    }
  }

  return (
    <div className="p-4 md:p-8">
      <div className="no-print">
      <h1 className="font-display text-3xl text-madeira-900">Notas</h1>
      <p className="text-madeira-600 mt-1 mb-6">Histórico de vendas, com número do pedido.</p>

      {erroCarregar && (
        <div className="card p-4 border-amber-300 bg-amber-50 text-amber-800 text-sm mb-6">{erroCarregar}</div>
      )}

      {pedidosVencendoLogo.length > 0 && (
        <div className="card p-4 border-red-300 bg-red-50 text-red-800 text-sm mb-6">
          ⚠️ {pedidosVencendoLogo.length} pedido(s) com prazo de entrega vencendo em até 2 dias:{" "}
          {pedidosVencendoLogo.map((v) => `#${v.numero_pedido}`).join(", ")}
        </div>
      )}

      <div className="flex flex-wrap gap-4 mb-6">
        <label className="block max-w-xs">
          <span className="text-xs text-madeira-600 mb-1 block">Buscar</span>
          <input
            className="input-base"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Nome, CPF, cidade, povoado, endereço, produto ou número do pedido..."
          />
        </label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm text-madeira-700 cursor-pointer">
          <input
            type="checkbox"
            checked={somenteAberto}
            onChange={(e) => setSomenteAberto(e.target.checked)}
          />
          Só pedidos em aberto (encomenda ainda não entregue)
        </label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm text-madeira-700 cursor-pointer">
          <input
            type="checkbox"
            checked={somenteRetirada}
            onChange={(e) => setSomenteRetirada(e.target.checked)}
          />
          Só cliente vai retirar na loja
        </label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm text-madeira-700 cursor-pointer">
          <input
            type="checkbox"
            checked={somenteEntregues}
            onChange={(e) => setSomenteEntregues(e.target.checked)}
          />
          Só entregues
        </label>
        {!busca && (
          <>
            <label className="block">
              <span className="text-xs text-madeira-600 mb-1 block">Período</span>
              <select className="input-base" value={periodo} onChange={(e) => setPeriodo(e.target.value as typeof periodo)}>
                <option value="hoje">Hoje</option>
                <option value="ontem">Ontem</option>
                <option value="personalizado">Personalizado</option>
                <option value="todos">Todos</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-madeira-600 mb-1 block">Ordenar por prazo</span>
              <select
                className="input-base"
                value={ordenarPorPrazo}
                onChange={(e) => setOrdenarPorPrazo(e.target.value as "" | "atrasado" | "recente")}
              >
                <option value="">Padrão</option>
                <option value="atrasado">Mais atrasado primeiro</option>
                <option value="recente">Menos atrasado primeiro</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-madeira-600 mb-1 block">Desconto</span>
              <select
                className="input-base"
                value={filtroDesconto}
                onChange={(e) => setFiltroDesconto(e.target.value as "todas" | "com" | "sem")}
              >
                <option value="todas">Todas</option>
                <option value="com">Com desconto</option>
                <option value="sem">Sem desconto</option>
              </select>
            </label>
            {rotasParaFiltro.length > 0 && (
              <label className="block">
                <span className="text-xs text-madeira-600 mb-1 block">Rota</span>
                <select
                  className="input-base"
                  value={filtroRota}
                  onChange={(e) => setFiltroRota(e.target.value)}
                >
                  <option value="todas">Todas as rotas</option>
                  {rotasParaFiltro.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nome}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {periodo === "personalizado" && (
              <>
                <label className="block">
                  <span className="text-xs text-madeira-600 mb-1 block">De</span>
                  <input className="input-base" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
                </label>
                <label className="block">
                  <span className="text-xs text-madeira-600 mb-1 block">Até</span>
                  <input className="input-base" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
                </label>
              </>
            )}
          </>
        )}
      </div>

      {carregando ? (
        <p className="text-madeira-500 text-sm">Carregando...</p>
      ) : vendasFiltradas.length === 0 ? (
        <div className="card p-8 text-center text-madeira-500 text-sm">Nenhuma nota encontrada.</div>
      ) : (
        <div className="space-y-3">
          {vendasFiltradas.map((v) => (
            <div key={v.id} className="card p-5">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <p className="font-display text-lg text-madeira-900">
                    Pedido #{v.numero_pedido} — {v.clientes?.nome || "Cliente"}
                    {(() => {
                      const troca = trocas.find((t) => t.venda_original_id === v.id && !t.cancelada);
                      if (!troca) return null;
                      return (
                        <span className="ml-2 text-xs px-2 py-0.5 rounded font-medium bg-blue-50 text-blue-700 align-middle">
                          🔁 Trocado — Troca #{troca.numero_troca}
                          <button
                            className="ml-2 px-2 py-0.5 rounded bg-blue-700 text-white font-semibold hover:bg-blue-800"
                            onClick={() => setModoTroca((m) => ({ ...m, [v.id]: !m[v.id] }))}
                            title="Alterna os botões de imprimir/enviar entre a nota da troca e a nota antiga"
                          >
                            {modoTroca[v.id] ? "↩ Nota antiga (antes da troca)" : "🔁 Nota da troca"}
                          </button>
                        </span>
                      );
                    })()}
                  </p>
                  <p className="text-xs text-madeira-500">
                    {new Date(v.criado_em).toLocaleString("pt-BR")} ·{" "}
                    {v.forma_pagamento === "Dividido" && v.venda_pagamentos
                      ? `Dividido (${v.venda_pagamentos
                          .map((p) => `${p.forma_pagamento}${(p.forma_pagamento === "Crédito" || p.forma_pagamento === "Link") && p.parcelas > 1 ? ` ${p.parcelas}x` : ""}`)
                          .join(" + ")})`
                      : `${v.forma_pagamento}${(v.forma_pagamento === "Crédito" || v.forma_pagamento === "Link") && v.parcelas > 1 ? ` ${v.parcelas}x` : ""}`}
                  </p>
                  {v.clientes?.endereco && (
                    <p className="text-xs text-madeira-400">
                      {v.clientes.endereco}
                      {v.clientes.numero ? `, ${v.clientes.numero}` : ""}
                      {v.clientes.cidade ? ` — ${v.clientes.cidade}` : ""}
                      {v.clientes.povoado ? ` — ${v.clientes.povoado}` : ""}
                    </p>
                  )}
                  {v.clientes?.telefone2 && (
                    <p className="text-xs text-madeira-400">
                      📞 {v.clientes.telefone2_nome ? `${v.clientes.telefone2_nome}: ` : "2º contato: "}
                      {v.clientes.telefone2}
                    </p>
                  )}
                  {v.cancelada && (
                    <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded mt-1 bg-red-100 text-red-700">
                      CANCELADA{v.motivo_cancelamento ? ` — ${v.motivo_cancelamento}` : ""}
                    </span>
                  )}
                  {!v.cancelada && pedidoPendente(v) &&
                    (() => {
                      const dias = diasRestantes(v.prazo_entrega_maximo as string);
                      const critico = dias <= 3;
                      return (
                        <span
                          className={`inline-block text-xs font-semibold px-2 py-0.5 rounded mt-1 ${
                            critico ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"
                          }`}
                        >
                          {dias < 0
                            ? `Prazo vencido há ${Math.abs(dias)} dia(s)`
                            : dias === 0
                            ? "Prazo vence hoje"
                            : `Faltam ${dias} dia(s) para o prazo`}
                        </span>
                      );
                    })()}
                  {temItemRetirada(v) && (
                    <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded mt-1 ml-1 bg-blue-50 text-blue-700">
                      Cliente retira na loja
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-display text-lg text-madeira-900">{formatarMoeda(v.total)}</p>
                  {v.clientes?.telefone && (
                    <>
                      <select
                        className="text-xs border border-madeira-200 rounded px-1.5 py-1 max-w-[160px]"
                        value={mensagemSelecionada[v.id] || "agradecimento"}
                        onChange={(e) => setMensagemSelecionada({ ...mensagemSelecionada, [v.id]: e.target.value })}
                      >
                        <option value="agradecimento">Msg: agradecimento</option>
                        <option value="saindo">Msg: saindo para entrega</option>
                        <option value="entregue">Msg: pedido entregue</option>
                        <option value="atraso">Msg: pedido atrasado</option>
                        <option value="pronto">Msg: pronto pra retirada</option>
                        <option value="lembrete">Msg: lembrete</option>
                      </select>
                      <button
                        className="text-xs px-2 py-1 rounded bg-green-600 text-white font-medium hover:bg-green-700"
                        onClick={() => enviarWhatsApp(v)}
                      >
                        WhatsApp
                      </button>
                    </>
                  )}
                  {souAdmin && v.cliente_id && v.clientes && (
                    <button
                      className="btn-secundario text-xs px-2 py-1"
                      onClick={() => abrirEdicaoEndereco(v)}
                      title="Editar os dados desta nota (só admin)"
                    >
                      ✏️ Editar nota
                    </button>
                  )}
                  <button className="btn-secundario text-xs px-2 py-1" onClick={() => { const t = trocaAtiva(v); if (t) imprimirNotaTroca(v, t); else imprimir(v); }}>
                    🖨
                  </button>
                  <button
                    className="btn-secundario text-xs px-2 py-1"
                    onClick={() => { const t = trocaAtiva(v); if (t) imprimirNotaTroca(v, t, "cupom88"); else imprimir(v, "cupom88"); }}
                    title="Imprimir cupom para impressora térmica 88mm"
                  >
                    🧾 88mm
                  </button>
                  <button
                    className="text-xs px-2 py-1 rounded bg-green-700 text-white font-medium hover:bg-green-800"
                    onClick={() => { const t = trocaAtiva(v); if (t) enviarPdfTrocaWhatsApp(t, v); else enviarPdfWhatsApp(v); }}
                    title="Gerar PDF da nota e enviar por WhatsApp"
                  >
                    📄 PDF WhatsApp{modoTroca[v.id] ? " (troca)" : ""}
                  </button>
                  {!v.cancelada && lojasFiscais.has(v.loja_id) && (() => {
                    const nf = notasFiscais[v.id];
                    const ocupado = emitindo === v.id;
                    if (!nf || nf.status === "erro") {
                      return (
                        <button
                          className="text-xs px-2 py-1 rounded bg-blue-700 text-white font-medium hover:bg-blue-800 disabled:opacity-50"
                          disabled={ocupado}
                          onClick={() => emitirNota(v)}
                          title={nf?.mensagem ? "Última tentativa falhou: " + nf.mensagem : "Emitir nota fiscal (NFC-e)"}
                        >
                          {ocupado ? "Emitindo..." : nf ? "🧾 Tentar emitir NFC-e de novo" : lojasFiscais.get(v.loja_id) === "producao" ? "🧾 Emitir NFC-e" : "🧾 Emitir NFC-e (teste)"}
                        </button>
                      );
                    }
                    return (
                      <span className="flex items-center gap-2 text-xs">
                        <span
                          className={`px-2 py-1 rounded font-medium ${
                            nf.status === "autorizada"
                              ? "bg-green-50 text-green-700"
                              : nf.status === "cancelada"
                              ? "bg-red-50 text-red-700"
                              : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          NFC-e {nf.numero ? `nº ${nf.numero} ` : ""}
                          {nf.status === "autorizada" ? "autorizada" : nf.status === "cancelada" ? "cancelada" : "processando"}
                          {nf.ambiente === "homologacao" ? " (TESTE)" : ""}
                        </span>
                        {nf.url_danfe && nf.status === "autorizada" && (
                          <a className="underline text-blue-700" href={nf.url_danfe} target="_blank" rel="noreferrer">
                            DANFE
                          </a>
                        )}
                        {nf.status === "processando" && (
                          <button className="underline text-blue-700" disabled={ocupado} onClick={() => atualizarNota(v)}>
                            Atualizar
                          </button>
                        )}
                        {nf.status === "autorizada" && (
                          <button className="underline text-red-700" disabled={ocupado} onClick={() => cancelarNota(v)}>
                            Cancelar nota
                          </button>
                        )}
                      </span>
                    );
                  })()}
                </div>
              </div>
              <ul className="mt-3 text-sm text-madeira-600 space-y-1">
                {itensParaLista(v.venda_itens || []).map(({ item, ids, total: totalLinha }) => (
                  <li key={item.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <span>
                      {item.quantidade}x {item.nome_produto}
                      {item.tipo_entrega === "encomenda" && !item.retirada && (
                        <span className="tag-encomenda ml-1">ENCOMENDA</span>
                      )}
                      {item.variante ? ` — ${item.variante}` : ""} —{" "}
                      {formatarMoeda(valorPagoItem({ total: totalLinha }, v.venda_itens || [], v.total))}
                      {item.observacao && (
                        <span className="block text-xs text-madeira-700">
                          Obs: <strong>{item.observacao}</strong>
                        </span>
                      )}
                    </span>
                    {item.status_entrega && (
                      <span className="flex items-center gap-2 shrink-0">
                        {v.cancelada ? (
                          <span className="text-xs px-2 py-0.5 rounded font-medium bg-red-50 text-red-700">
                            CANCELADO
                          </span>
                        ) : (
                          <>
                            <span
                              className={`text-xs px-2 py-0.5 rounded font-medium ${
                                item.status_entrega === "entregue"
                                  ? "bg-green-50 text-green-700"
                                  : "bg-amber-50 text-amber-700"
                              }`}
                            >
                              {item.status_entrega === "entregue"
                                ? "✓ ENTREGUE"
                                : item.retirada
                                ? "Cliente vai levar"
                                : item.tipo_entrega === "encomenda"
                                ? "ENCOMENDA"
                                : "AGUARDANDO ENTREGA"}
                            </span>
                            {item.status_entrega === "entregue" && item.data_entregue && (
                              <span className="text-xs text-madeira-500">
                                em {new Date(item.data_entregue).toLocaleDateString("pt-BR")}
                              </span>
                            )}
                            {item.status_entrega !== "entregue" && (
                              <button
                                className="btn-secundario text-xs px-2 py-1"
                                onClick={() => marcarEntregue(ids)}
                              >
                                ENTREGUE
                              </button>
                            )}
                          </>
                        )}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}


      </div>

      {editEnd && souAdmin && (
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/50 p-4 overflow-y-auto">
          <div className="w-full max-w-2xl bg-white rounded-xl shadow-2xl p-5 my-4">
            <div className="text-lg font-bold text-madeira-900">Editar nota — pedido #{editEnd.numeroPedido}</div>
            <div className="text-xs text-madeira-500 mb-3">
              Dados do cliente valem para o cadastro dele (todas as notas). Valores, pagamento e estoque não mudam por aqui.
            </div>

            <div className="text-xs font-semibold text-madeira-700 mb-1">Cliente</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
              {(
                [
                  ["nome", "Nome"],
                  ["telefone", "Telefone / WhatsApp"],
                  ["telefone2_nome", "Nome do 2º contato (ex: esposa, vizinho)"],
                  ["telefone2", "2º número de contato"],
                  ["cpf", "CPF"],
                  ["endereco", "Rua / endereço"],
                  ["numero", "Número"],
                  ["complemento", "Complemento"],
                  ["bairro", "Bairro"],
                  ["cidade", "Cidade"],
                  ["povoado", "Povoado"],
                ] as const
              ).map(([campo, rotulo]) => (
                <label key={campo} className={campo === "nome" || campo === "endereco" ? "sm:col-span-2" : ""}>
                  <span className="text-xs text-madeira-600 block mb-0.5">{rotulo}</span>
                  <input
                    className="input-base"
                    value={editEnd.campos[campo]}
                    onChange={(e) =>
                      setEditEnd({ ...editEnd, campos: { ...editEnd.campos, [campo]: e.target.value } })
                    }
                  />
                </label>
              ))}
            </div>

            <div className="text-xs font-semibold text-madeira-700 mb-1">Pedido</div>
            <label className="block mb-2 max-w-xs">
              <span className="text-xs text-madeira-600 block mb-0.5">Rota de entrega</span>
              <select
                className="input-base"
                value={editEnd.rotaId}
                onChange={(e) => setEditEnd({ ...editEnd, rotaId: e.target.value })}
              >
                <option value="">Sem rota</option>
                {rotasParaFiltro.map((rt) => (
                  <option key={rt.id} value={rt.id}>
                    {rt.nome}
                    {rt.cidade ? ` — ${rt.cidade}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="block mb-3 max-w-xs">
              <span className="text-xs text-madeira-600 block mb-0.5">Prazo máximo de entrega</span>
              <input
                type="date"
                className="input-base"
                value={editEnd.prazo}
                onChange={(e) => setEditEnd({ ...editEnd, prazo: e.target.value })}
              />
            </label>

            <div className="text-xs font-semibold text-madeira-700 mb-1">Produtos</div>
            <div className="space-y-2 mb-2">
              {editEnd.itens.map((it, idx) => (
                <div key={it.id} className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-lg border border-estofado-100 p-2">
                  <label className="sm:col-span-2">
                    <span className="text-xs text-madeira-600 block mb-0.5">Produto</span>
                    <input
                      className="input-base"
                      value={it.nome_produto}
                      onChange={(e) =>
                        setEditEnd({
                          ...editEnd,
                          itens: editEnd.itens.map((x, i) => (i === idx ? { ...x, nome_produto: e.target.value } : x)),
                        })
                      }
                    />
                  </label>
                  <label>
                    <span className="text-xs text-madeira-600 block mb-0.5">
                      Tecido / cor / variação{it.partes ? " (conjunto 2 e 3 lugares — vale para as duas peças)" : ""}
                    </span>
                    <input
                      className="input-base"
                      value={it.variante}
                      onChange={(e) =>
                        setEditEnd({
                          ...editEnd,
                          itens: editEnd.itens.map((x, i) => (i === idx ? { ...x, variante: e.target.value } : x)),
                        })
                      }
                    />
                  </label>
                  <label>
                    <span className="text-xs text-madeira-600 block mb-0.5">Observação</span>
                    <input
                      className="input-base"
                      value={it.observacao}
                      onChange={(e) =>
                        setEditEnd({
                          ...editEnd,
                          itens: editEnd.itens.map((x, i) => (i === idx ? { ...x, observacao: e.target.value } : x)),
                        })
                      }
                    />
                  </label>
                </div>
              ))}
            </div>

            {erroEnd && <div className="text-sm text-red-700 mt-2">{erroEnd}</div>}
            <div className="flex gap-2 mt-4 justify-end">
              <button className="btn-secundario text-sm px-3 py-1.5" onClick={() => setEditEnd(null)}>
                Cancelar
              </button>
              <button className="btn-primario text-sm px-3 py-1.5" disabled={salvandoEnd} onClick={salvarEdicaoEndereco}>
                {salvandoEnd ? "Salvando..." : "Salvar alterações"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div id="area-impressao" className={formatoImpressao === "cupom88" ? "cupom-88mm" : ""}>
        {trocaImprimindo && (() => {
          const T = formatoImpressao === "cupom88" ? ComprovanteTrocaCupom88mm : ComprovanteTroca;
          return (
            <T
              numeroTroca={trocaImprimindo.numero_troca}
              numeroPedidoOriginal={trocaImprimindo.vendas?.numero_pedido || 0}
              cliente={{
                nome: trocaImprimindo.vendas?.clientes?.nome || "Cliente",
                cpf: trocaImprimindo.vendas?.clientes?.cpf ?? null,
                telefone: trocaImprimindo.vendas?.clientes?.telefone ?? null,
                telefone2: trocaImprimindo.vendas?.clientes?.telefone2 ?? null,
                telefone2_nome: trocaImprimindo.vendas?.clientes?.telefone2_nome ?? null,
                endereco: trocaImprimindo.vendas?.clientes?.endereco ?? null,
                numero: trocaImprimindo.vendas?.clientes?.numero ?? null,
                complemento: trocaImprimindo.vendas?.clientes?.complemento ?? null,
                cidade: trocaImprimindo.vendas?.clientes?.cidade ?? null,
                povoado: trocaImprimindo.vendas?.clientes?.povoado ?? null,
                bairro: trocaImprimindo.vendas?.clientes?.bairro ?? null,
              }}
              devolvidos={trocaImprimindo.trocas_devolvidos || []}
              novos={trocaImprimindo.trocas_novos || []}
              tipoPreco={trocaImprimindo.tipo_preco}
              diferenca={trocaImprimindo.diferenca}
              diferencaCobrada={trocaImprimindo.valor_cobrado_diferenca ?? trocaImprimindo.diferenca}
              parcelasDiferenca={trocaImprimindo.parcelas_diferenca ?? 1}
              formaPagamentoDiferenca={trocaImprimindo.forma_pagamento_diferenca}
              loja={lojaImprimindo}
              rotaNome={trocaImprimindo.rota_nome ?? null}
              rotaCor={trocaImprimindo.rota_cor ?? null}
              criadoEm={trocaImprimindo.criado_em}
              itensRestantes={itensRestantes}
            />
          );
        })()}
        {notaImprimindo && formatoImpressao === "cupom88" && (
          <ComprovanteCupom88mm
            numeroPedido={notaImprimindo.numero_pedido}
            rotuloNumero={rotuloNota}
            cliente={
              notaImprimindo.clientes
                ? {
                    nome: notaImprimindo.clientes.nome,
                    telefone: notaImprimindo.clientes.telefone,
                    telefone2: notaImprimindo.clientes.telefone2,
                    telefone2_nome: notaImprimindo.clientes.telefone2_nome,
                    endereco: notaImprimindo.clientes.endereco,
                    numero: notaImprimindo.clientes.numero,
                    complemento: notaImprimindo.clientes.complemento,
                    cidade: notaImprimindo.clientes.cidade,
                    povoado: notaImprimindo.clientes.povoado,
                    bairro: notaImprimindo.clientes.bairro,
                  }
                : null
            }
            loja={lojaImprimindo}
            total={notaImprimindo.total}
            formaPagamento={notaImprimindo.forma_pagamento}
            prazoEntregaMaximo={notaImprimindo.prazo_entrega_maximo}
            prazoDiasUteis={notaImprimindo.prazo_dias_uteis ?? null}
            criadoEm={notaImprimindo.criado_em}
            pagamentos={(notaImprimindo.venda_pagamentos || []).map((p) => ({
              forma: p.forma_pagamento,
              parcelas: p.parcelas,
              valorAPagar: p.valor,
            }))}
            descontoGeral={notaImprimindo.desconto_geral ?? 0}
            motivoDescontoGeral={notaImprimindo.motivo_desconto_geral ?? null}
            custoAdicional={notaImprimindo.custo_adicional ?? 0}
            descricaoCustoAdicional={notaImprimindo.descricao_custo_adicional ?? null}
            itens={notaImprimindo.venda_itens || []}
          />
        )}
        {notaImprimindo && formatoImpressao === "a4" && (
          <ComprovanteImpressao
            numeroPedido={notaImprimindo.numero_pedido}
            rotuloNumero={rotuloNota}
            criadoEm={notaImprimindo.criado_em}
            rotaNome={notaImprimindo.rota_nome ?? null}
            rotaCor={notaImprimindo.rota_cor ?? null}
            descontoGeral={notaImprimindo.desconto_geral ?? 0}
            motivoDescontoGeral={notaImprimindo.motivo_desconto_geral ?? null}
            custoAdicional={notaImprimindo.custo_adicional ?? 0}
            descricaoCustoAdicional={notaImprimindo.descricao_custo_adicional ?? null}
            cliente={{
              nome: notaImprimindo.clientes?.nome || "Cliente",
              cpf: notaImprimindo.clientes?.cpf,
              telefone: notaImprimindo.clientes?.telefone,
              telefone2: notaImprimindo.clientes?.telefone2,
              telefone2_nome: notaImprimindo.clientes?.telefone2_nome,
              endereco: notaImprimindo.clientes?.endereco,
              numero: notaImprimindo.clientes?.numero,
              complemento: notaImprimindo.clientes?.complemento,
              cidade: notaImprimindo.clientes?.cidade,
              povoado: notaImprimindo.clientes?.povoado,
              bairro: notaImprimindo.clientes?.bairro,
            }}
            loja={lojaImprimindo}
            lojasPorId={Object.fromEntries(todasLojas.map((l) => [l.id, l.nome]))}
            total={notaImprimindo.total}
            formaPagamento={notaImprimindo.forma_pagamento}
            pagamentos={(notaImprimindo.venda_pagamentos || []).map((p) => ({
              forma: p.forma_pagamento,
              parcelas: p.parcelas,
              valorAPagar: p.valor,
            }))}
            prazoEntregaMaximo={notaImprimindo.prazo_entrega_maximo}
            prazoDiasUteis={notaImprimindo.prazo_dias_uteis ?? null}
            itens={notaImprimindo.venda_itens || []}
          />
        )}
      </div>
    </div>
  );
}
