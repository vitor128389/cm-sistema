"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { formatarMoeda, normalizarBusca } from "@/lib/format";
import { useLoja } from "@/contexts/LojaContext";
import { carregarProdutosComEstoque } from "@/lib/produtos";
import { definirTamanhoPagina, ajustarEscalaImpressaoA4 } from "@/lib/imprimir";
import { abrirWhatsAppComTexto } from "@/lib/whatsapp";
import ComprovanteOrcamento, { type DadosOrcamentoImpressao } from "@/components/ComprovanteOrcamento";
import {
  calcularTotais,
  dataBrCurta,
  linkWhatsApp,
  somarDias,
  textoWhatsAppOrcamento,
  valorPrazo,
  vencido,
  type FormaExibicao,
  type ItemOrcamento,
  type OrcamentoSalvo,
  type StatusOrcamento,
} from "@/lib/orcamento";
import type { LojaCompleta, ProdutoComVariantes } from "@/types";

interface ClienteBusca {
  id: string;
  nome: string;
  telefone: string | null;
  endereco: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  povoado: string | null;
}

interface OpcaoProduto {
  produtoId: string;
  nome: string;
  variante: string | null;
  preco: number;
}

let contador = 0;
const novaChave = () => `i${Date.now()}_${contador++}`;

const numero = (v: string) => {
  const n = parseFloat(v.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const decimalParaTexto = (n: number) => (n ? String(n).replace(".", ",") : "");

const STATUS_ROTULO: Record<StatusOrcamento, string> = { aberto: "Em aberto", aprovado: "Aprovado", recusado: "Recusado" };
const STATUS_COR: Record<StatusOrcamento, string> = {
  aberto: "bg-amber-100 text-amber-800",
  aprovado: "bg-green-100 text-green-800",
  recusado: "bg-red-100 text-red-700",
};

function enderecoCliente(c: ClienteBusca): string {
  return [[c.endereco, c.numero].filter(Boolean).join(", "), c.bairro || c.povoado, c.cidade].filter(Boolean).join(" - ");
}

export default function OrcamentosPage() {
  const { lojaAtual, lojas } = useLoja();
  const [aba, setAba] = useState<"novo" | "salvos">("novo");

  // ---------- formulário ----------
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editandoNumero, setEditandoNumero] = useState<number | null>(null);
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [clienteNome, setClienteNome] = useState("");
  const [clienteTelefone, setClienteTelefone] = useState("");
  const [clienteEndereco, setClienteEndereco] = useState("");
  const [buscaCliente, setBuscaCliente] = useState("");
  const [sugestoesCliente, setSugestoesCliente] = useState<ClienteBusca[]>([]);
  const [itens, setItens] = useState<ItemOrcamento[]>([]);
  const [buscaProduto, setBuscaProduto] = useState("");
  const [desconto, setDesconto] = useState("");
  const [frete, setFrete] = useState("");
  const [forma, setForma] = useState<FormaExibicao>("ambos");
  const [validadeDias, setValidadeDias] = useState("7");
  const [prazoEntrega, setPrazoEntrega] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  // ---------- dados ----------
  const [produtos, setProdutos] = useState<ProdutoComVariantes[]>([]);
  const [loja, setLoja] = useState<LojaCompleta | null>(null);
  const [salvos, setSalvos] = useState<OrcamentoSalvo[]>([]);
  const [buscaSalvos, setBuscaSalvos] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<"todos" | StatusOrcamento>("todos");
  const [imprimindo, setImprimindo] = useState<DadosOrcamentoImpressao | null>(null);
  const temporizadorCliente = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!lojaAtual) return;
    carregarProdutosComEstoque(supabase, lojaAtual).then(setProdutos);
    supabase.from("lojas").select("*").eq("id", lojaAtual).maybeSingle().then(({ data }) => setLoja(data as LojaCompleta | null));
    carregarSalvos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lojaAtual]);

  async function carregarSalvos() {
    if (!lojaAtual) return;
    const { data, error } = await supabase
      .from("orcamentos")
      .select("*, orcamento_itens(*)")
      .eq("loja_id", lojaAtual)
      .order("criado_em", { ascending: false })
      .limit(300);
    if (error) {
      // eslint-disable-next-line no-console
      console.error("Erro ao carregar orçamentos:", error);
      return;
    }
    setSalvos(((data || []) as unknown as OrcamentoSalvo[]).map((o) => ({ ...o, desconto: Number(o.desconto), frete: Number(o.frete), total_avista: Number(o.total_avista), total_prazo: Number(o.total_prazo) })));
  }

  // ---------- cliente ----------
  function aoDigitarCliente(valor: string) {
    setBuscaCliente(valor);
    if (temporizadorCliente.current) clearTimeout(temporizadorCliente.current);
    if (valor.trim().length < 2 || !lojaAtual) {
      setSugestoesCliente([]);
      return;
    }
    temporizadorCliente.current = setTimeout(async () => {
      const termo = valor.trim().replace(/[%,]/g, " ");
      const { data } = await supabase
        .from("clientes")
        .select("id, nome, telefone, endereco, numero, bairro, cidade, povoado")
        .eq("loja_id", lojaAtual)
        .or(`nome.ilike.%${termo}%,telefone.ilike.%${termo}%`)
        .order("nome")
        .limit(8);
      setSugestoesCliente((data || []) as ClienteBusca[]);
    }, 250);
  }

  function escolherCliente(c: ClienteBusca) {
    setClienteId(c.id);
    setClienteNome(c.nome);
    setClienteTelefone(c.telefone || "");
    setClienteEndereco(enderecoCliente(c));
    setBuscaCliente("");
    setSugestoesCliente([]);
  }

  function trocarCliente() {
    setClienteId(null);
    setClienteNome("");
    setClienteTelefone("");
    setClienteEndereco("");
  }

  // ---------- produtos ----------
  const opcoes: OpcaoProduto[] = useMemo(() => {
    const lista: OpcaoProduto[] = [];
    produtos.forEach((p) => {
      if (p.produto_variantes?.length) {
        p.produto_variantes.forEach((v) =>
          lista.push({ produtoId: p.id, nome: p.nome, variante: v.nome_variante === "Padrão" ? null : v.nome_variante, preco: Number(v.preco_avista) })
        );
      } else {
        lista.push({ produtoId: p.id, nome: p.nome, variante: null, preco: Number(p.preco_venda) });
      }
    });
    return lista;
  }, [produtos]);

  const resultadosProduto = useMemo(() => {
    const q = normalizarBusca(buscaProduto.trim());
    if (q.length < 2) return [];
    const palavras = q.split(/\s+/);
    return opcoes
      .filter((o) => {
        const alvo = normalizarBusca(`${o.nome} ${o.variante || ""}`);
        return palavras.every((w) => alvo.includes(w));
      })
      .slice(0, 12);
  }, [buscaProduto, opcoes]);

  function adicionarOpcao(o: OpcaoProduto) {
    setItens((atual) => {
      const igual = atual.find((i) => i.produto_id === o.produtoId && i.variante === o.variante && i.valor_avista === o.preco);
      if (igual) return atual.map((i) => (i === igual ? { ...i, quantidade: i.quantidade + 1 } : i));
      return [...atual, { chave: novaChave(), produto_id: o.produtoId, nome: o.nome, variante: o.variante, quantidade: 1, valor_avista: o.preco }];
    });
    setBuscaProduto("");
  }

  function adicionarAvulso() {
    const nome = buscaProduto.trim();
    if (!nome) return;
    setItens((atual) => [...atual, { chave: novaChave(), produto_id: null, nome: nome.toUpperCase(), variante: null, quantidade: 1, valor_avista: 0 }]);
    setBuscaProduto("");
  }

  const alterarItem = (chave: string, mudanca: Partial<ItemOrcamento>) =>
    setItens((atual) => atual.map((i) => (i.chave === chave ? { ...i, ...mudanca } : i)));
  const removerItem = (chave: string) => setItens((atual) => atual.filter((i) => i.chave !== chave));

  const totais = calcularTotais(itens, numero(desconto), numero(frete));

  // ---------- salvar / limpar ----------
  function limpar() {
    setEditandoId(null);
    setEditandoNumero(null);
    trocarCliente();
    setBuscaCliente("");
    setItens([]);
    setDesconto("");
    setFrete("");
    setForma("ambos");
    setValidadeDias("7");
    setPrazoEntrega("");
    setObservacoes("");
    setMensagem(null);
  }

  function validar(): string | null {
    if (!clienteNome.trim()) return "Informe o nome do cliente.";
    if (itens.length === 0) return "Adicione ao menos um produto.";
    if (itens.some((i) => i.valor_avista <= 0)) return "Tem produto sem valor — preencha o valor de todos.";
    return null;
  }

  function dadosParaImpressao(numeroOrc: number | null, criadoEm: string | null): DadosOrcamentoImpressao {
    return {
      numero: numeroOrc,
      criadoEm,
      validade: validadeDias ? somarDias(parseInt(validadeDias, 10) || 0) : null,
      prazoEntrega: prazoEntrega.trim() || null,
      clienteNome: clienteNome.trim(),
      clienteTelefone: clienteTelefone.trim() || null,
      clienteEndereco: clienteEndereco.trim() || null,
      itens: itens.map((i) => ({ nome: i.nome, variante: i.variante, quantidade: i.quantidade, valor_avista: i.valor_avista })),
      desconto: totais.desconto,
      frete: totais.frete,
      forma,
      observacoes: observacoes.trim() || null,
      loja,
    };
  }

  async function salvar(): Promise<{ id: string; numero: number; criadoEm: string; validade: string | null } | null> {
    const erro = validar();
    if (erro) {
      setMensagem({ tipo: "erro", texto: erro });
      return null;
    }
    if (!lojaAtual) {
      setMensagem({ tipo: "erro", texto: "Escolha a loja antes de salvar." });
      return null;
    }
    setSalvando(true);
    setMensagem(null);
    const { data: auth } = await supabase.auth.getUser();
    const validade = validadeDias ? somarDias(parseInt(validadeDias, 10) || 0) : null;
    const base = {
      cliente_id: clienteId,
      cliente_nome: clienteNome.trim(),
      cliente_telefone: clienteTelefone.trim() || null,
      cliente_endereco: clienteEndereco.trim() || null,
      validade,
      prazo_entrega: prazoEntrega.trim() || null,
      desconto: totais.desconto,
      frete: totais.frete,
      forma_exibicao: forma,
      observacoes: observacoes.trim() || null,
      total_avista: totais.totalAvista,
      total_prazo: totais.totalPrazo,
      atualizado_em: new Date().toISOString(),
    };
    let id = editandoId;
    let numeroOrc = editandoNumero;
    let criadoEm = new Date().toISOString();
    if (id) {
      const { error } = await supabase.from("orcamentos").update(base).eq("id", id);
      if (error) {
        setSalvando(false);
        setMensagem({ tipo: "erro", texto: "Não consegui salvar: " + error.message });
        return null;
      }
      await supabase.from("orcamento_itens").delete().eq("orcamento_id", id);
      criadoEm = salvos.find((s) => s.id === id)?.criado_em || criadoEm;
    } else {
      const { data, error } = await supabase
        .from("orcamentos")
        .insert({ ...base, loja_id: lojaAtual, criado_por: auth.user?.id ?? null })
        .select("id, numero, criado_em")
        .single();
      if (error || !data) {
        setSalvando(false);
        setMensagem({ tipo: "erro", texto: "Não consegui salvar: " + (error?.message || "erro desconhecido") });
        return null;
      }
      id = data.id as string;
      numeroOrc = Number(data.numero);
      criadoEm = data.criado_em as string;
    }
    const { error: erroItens } = await supabase.from("orcamento_itens").insert(
      itens.map((i, idx) => ({
        orcamento_id: id,
        produto_id: i.produto_id,
        nome: i.nome,
        variante: i.variante,
        quantidade: i.quantidade,
        valor_avista: i.valor_avista,
        ordem: idx,
      }))
    );
    setSalvando(false);
    if (erroItens) {
      setMensagem({ tipo: "erro", texto: "Salvou o orçamento mas deu erro nos itens: " + erroItens.message });
      return null;
    }
    setEditandoId(id);
    setEditandoNumero(numeroOrc);
    setMensagem({ tipo: "ok", texto: `Orçamento nº ${numeroOrc} salvo.` });
    carregarSalvos();
    return { id: id as string, numero: numeroOrc as number, criadoEm, validade };
  }

  function imprimir(dados: DadosOrcamentoImpressao) {
    setImprimindo(dados);
    definirTamanhoPagina("a4");
    setTimeout(async () => {
      await ajustarEscalaImpressaoA4();
      window.print();
    }, 150);
  }

  async function salvarEImprimir() {
    const r = await salvar();
    if (r) imprimir({ ...dadosParaImpressao(r.numero, r.criadoEm), validade: r.validade });
  }

  function mensagemAtual(numeroOrc: number | null) {
    return textoWhatsAppOrcamento({
      numero: numeroOrc,
      clienteNome: clienteNome.trim() || "cliente",
      itens,
      desconto: totais.desconto,
      frete: totais.frete,
      forma,
      validade: validadeDias ? somarDias(parseInt(validadeDias, 10) || 0) : null,
      prazoEntrega: prazoEntrega.trim() || null,
      observacoes: observacoes.trim() || null,
      lojaNome: loja?.nome || "Caruaru Móveis",
    });
  }

  async function salvarEWhatsApp() {
    const r = await salvar();
    if (!r) return;
    const texto = mensagemAtual(r.numero);
    if (clienteTelefone.replace(/\D/g, "").length >= 8) window.open(linkWhatsApp(clienteTelefone, texto), "_blank", "noopener");
    else abrirWhatsAppComTexto(texto);
  }

  // ---------- lista de salvos ----------
  function abrirParaEditar(o: OrcamentoSalvo, duplicar = false) {
    setEditandoId(duplicar ? null : o.id);
    setEditandoNumero(duplicar ? null : o.numero);
    setClienteId(o.cliente_id);
    setClienteNome(o.cliente_nome);
    setClienteTelefone(o.cliente_telefone || "");
    setClienteEndereco(o.cliente_endereco || "");
    setItens(
      [...o.orcamento_itens]
        .sort((a, b) => a.ordem - b.ordem)
        .map((i) => ({ chave: novaChave(), produto_id: i.produto_id, nome: i.nome, variante: i.variante, quantidade: i.quantidade, valor_avista: Number(i.valor_avista) }))
    );
    setDesconto(decimalParaTexto(o.desconto));
    setFrete(decimalParaTexto(o.frete));
    setForma(o.forma_exibicao);
    setValidadeDias("7");
    setPrazoEntrega(o.prazo_entrega || "");
    setObservacoes(o.observacoes || "");
    setMensagem(duplicar ? { tipo: "ok", texto: "Orçamento copiado — ajuste e salve como um novo." } : null);
    setAba("novo");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function dadosDoSalvo(o: OrcamentoSalvo): DadosOrcamentoImpressao {
    return {
      numero: o.numero,
      criadoEm: o.criado_em,
      validade: o.validade,
      prazoEntrega: o.prazo_entrega,
      clienteNome: o.cliente_nome,
      clienteTelefone: o.cliente_telefone,
      clienteEndereco: o.cliente_endereco,
      itens: [...o.orcamento_itens].sort((a, b) => a.ordem - b.ordem).map((i) => ({ nome: i.nome, variante: i.variante, quantidade: i.quantidade, valor_avista: Number(i.valor_avista) })),
      desconto: o.desconto,
      frete: o.frete,
      forma: o.forma_exibicao,
      observacoes: o.observacoes,
      loja,
    };
  }

  function whatsappDoSalvo(o: OrcamentoSalvo) {
    const d = dadosDoSalvo(o);
    const texto = textoWhatsAppOrcamento({ ...d, forma: d.forma, lojaNome: loja?.nome || "Caruaru Móveis", validade: o.validade, prazoEntrega: o.prazo_entrega });
    if ((o.cliente_telefone || "").replace(/\D/g, "").length >= 8) window.open(linkWhatsApp(o.cliente_telefone!, texto), "_blank", "noopener");
    else abrirWhatsAppComTexto(texto);
  }

  async function mudarStatus(o: OrcamentoSalvo, status: StatusOrcamento) {
    await supabase.from("orcamentos").update({ status, atualizado_em: new Date().toISOString() }).eq("id", o.id);
    setSalvos((atual) => atual.map((x) => (x.id === o.id ? { ...x, status } : x)));
  }

  async function excluir(o: OrcamentoSalvo) {
    if (!window.confirm(`Excluir o orçamento nº ${o.numero} de ${o.cliente_nome}? Isso não pode ser desfeito.`)) return;
    await supabase.from("orcamentos").delete().eq("id", o.id);
    if (editandoId === o.id) limpar();
    carregarSalvos();
  }

  const salvosFiltrados = salvos.filter((o) => {
    if (filtroStatus !== "todos" && o.status !== filtroStatus) return false;
    const q = normalizarBusca(buscaSalvos.trim());
    if (!q) return true;
    return normalizarBusca(o.cliente_nome).includes(q) || String(o.numero).includes(q) || (o.cliente_telefone || "").includes(buscaSalvos.trim());
  });

  const resumo = useMemo(() => {
    const abertos = salvos.filter((o) => o.status === "aberto");
    return { qtdAbertos: abertos.length, valorAbertos: abertos.reduce((s, o) => s + o.total_avista, 0) };
  }, [salvos]);

  const nomeLoja = lojas.find((l) => l.id === lojaAtual)?.nome;

  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto">
      <div className="no-print">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-1">
          <h1 className="font-display text-3xl text-madeira-900">Orçamentos</h1>
          <div className="flex gap-2">
            <button className={aba === "novo" ? "btn-primario" : "btn-secundario"} onClick={() => setAba("novo")}>
              {editandoId ? `Editando nº ${editandoNumero}` : "Novo orçamento"}
            </button>
            <button className={aba === "salvos" ? "btn-primario" : "btn-secundario"} onClick={() => setAba("salvos")}>
              Salvos ({salvos.length})
            </button>
          </div>
        </div>
        <p className="text-sm text-madeira-700 mb-5">
          Monte o orçamento do cliente, imprima ou mande pelo WhatsApp. Não baixa estoque nem gera nota{nomeLoja ? ` — loja ${nomeLoja}` : ""}.
        </p>

        {mensagem && (
          <div className={`mb-4 rounded px-3 py-2 text-sm ${mensagem.tipo === "ok" ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
            {mensagem.texto}
          </div>
        )}

        {aba === "novo" && (
          <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
            <div className="space-y-5">
              {/* CLIENTE */}
              <section className="card p-4">
                <h2 className="font-semibold text-madeira-900 mb-2">1. Cliente</h2>
                {clienteNome && clienteId ? (
                  <div className="flex items-start justify-between gap-3 rounded bg-green-50 border border-green-200 p-3 text-sm">
                    <div>
                      <div className="font-semibold">{clienteNome}</div>
                      <div>{clienteTelefone || "sem telefone"}</div>
                      {clienteEndereco && <div className="text-madeira-700">{clienteEndereco}</div>}
                    </div>
                    <button className="text-xs underline" onClick={trocarCliente}>trocar</button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="relative">
                      <input className="input-base" placeholder="Buscar cliente cadastrado (nome ou telefone)…" value={buscaCliente} onChange={(e) => aoDigitarCliente(e.target.value)} />
                      {sugestoesCliente.length > 0 && (
                        <ul className="absolute z-20 left-0 right-0 mt-1 bg-white border rounded shadow max-h-64 overflow-auto">
                          {sugestoesCliente.map((c) => (
                            <li key={c.id}>
                              <button type="button" className="w-full text-left px-3 py-2 hover:bg-green-50 text-sm" onClick={() => escolherCliente(c)}>
                                <b>{c.nome}</b> <span className="text-madeira-700">{c.telefone || ""} {c.bairro || c.povoado || c.cidade ? `• ${c.bairro || c.povoado || c.cidade}` : ""}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <p className="text-xs text-madeira-700">Ou digite os dados abaixo (cliente que ainda não é cadastrado):</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <input className="input-base" placeholder="Nome do cliente *" value={clienteNome} onChange={(e) => setClienteNome(e.target.value)} />
                      <input className="input-base" placeholder="Telefone / WhatsApp" value={clienteTelefone} onChange={(e) => setClienteTelefone(e.target.value)} />
                    </div>
                    <input className="input-base" placeholder="Endereço / cidade (opcional)" value={clienteEndereco} onChange={(e) => setClienteEndereco(e.target.value)} />
                  </div>
                )}
              </section>

              {/* ITENS */}
              <section className="card p-4">
                <h2 className="font-semibold text-madeira-900 mb-2">2. Produtos</h2>
                <div className="relative">
                  <input
                    className="input-base"
                    placeholder="Buscar produto (ex.: guarda roupa, kit milano, cama)…"
                    value={buscaProduto}
                    onChange={(e) => setBuscaProduto(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (resultadosProduto.length === 1) adicionarOpcao(resultadosProduto[0]);
                      }
                    }}
                  />
                  {buscaProduto.trim().length >= 2 && (
                    <ul className="absolute z-20 left-0 right-0 mt-1 bg-white border rounded shadow max-h-72 overflow-auto">
                      {resultadosProduto.map((o, idx) => (
                        <li key={o.produtoId + idx}>
                          <button type="button" className="w-full text-left px-3 py-2 hover:bg-green-50 text-sm flex justify-between gap-3" onClick={() => adicionarOpcao(o)}>
                            <span>{o.nome}{o.variante ? ` — ${o.variante}` : ""}</span>
                            <span className="font-semibold whitespace-nowrap">{formatarMoeda(o.preco)}</span>
                          </button>
                        </li>
                      ))}
                      <li>
                        <button type="button" className="w-full text-left px-3 py-2 hover:bg-amber-50 text-sm text-madeira-700 border-t" onClick={adicionarAvulso}>
                          + Adicionar “{buscaProduto.trim()}” como item avulso (você digita o valor)
                        </button>
                      </li>
                    </ul>
                  )}
                </div>

                {itens.length === 0 ? (
                  <p className="text-sm text-madeira-700 mt-3">Nenhum produto ainda. Busque acima e clique pra adicionar.</p>
                ) : (
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-madeira-700 border-b">
                          <th className="py-1 pr-2">Produto</th>
                          <th className="py-1 px-2 w-20">Qtd</th>
                          <th className="py-1 px-2 w-32">Valor à vista (un.)</th>
                          <th className="py-1 px-2 w-28 text-right">A prazo (un.)</th>
                          <th className="py-1 px-2 w-28 text-right">Subtotal à vista</th>
                          <th className="w-8" />
                        </tr>
                      </thead>
                      <tbody>
                        {itens.map((i) => (
                          <tr key={i.chave} className="border-b align-middle">
                            <td className="py-2 pr-2">
                              {i.produto_id ? (
                                <>{i.nome}{i.variante ? <span className="text-madeira-700"> — {i.variante}</span> : null}</>
                              ) : (
                                <input className="input-base" value={i.nome} onChange={(e) => alterarItem(i.chave, { nome: e.target.value })} />
                              )}
                            </td>
                            <td className="py-2 px-2">
                              <input className="input-base" inputMode="numeric" value={i.quantidade} onChange={(e) => alterarItem(i.chave, { quantidade: Math.max(1, parseInt(e.target.value.replace(/\D/g, ""), 10) || 1) })} />
                            </td>
                            <td className="py-2 px-2">
                              <input className="input-base" inputMode="decimal" value={decimalParaTexto(i.valor_avista)} placeholder="0,00" onChange={(e) => alterarItem(i.chave, { valor_avista: numero(e.target.value) })} />
                            </td>
                            <td className="py-2 px-2 text-right whitespace-nowrap">{formatarMoeda(valorPrazo(i.valor_avista))}</td>
                            <td className="py-2 px-2 text-right whitespace-nowrap font-semibold">{formatarMoeda(i.valor_avista * i.quantidade)}</td>
                            <td className="py-2 text-right">
                              <button className="text-red-600 text-lg leading-none" title="Remover" onClick={() => removerItem(i.chave)}>×</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="text-xs text-madeira-700 mt-2">Dá pra mexer no valor de cada produto (pra dar desconto só num item). O “a prazo” é o à vista + 10%.</p>
                  </div>
                )}
              </section>

              {/* CONDIÇÕES */}
              <section className="card p-4">
                <h2 className="font-semibold text-madeira-900 mb-2">3. Condições</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm">Mostrar no orçamento
                    <select className="input-base mt-1" value={forma} onChange={(e) => setForma(e.target.value as FormaExibicao)}>
                      <option value="ambos">Os dois: à vista e a prazo</option>
                      <option value="avista">Só à vista</option>
                      <option value="prazo">Só a prazo</option>
                    </select>
                  </label>
                  <label className="text-sm">Validade do orçamento
                    <select className="input-base mt-1" value={validadeDias} onChange={(e) => setValidadeDias(e.target.value)}>
                      <option value="3">3 dias</option>
                      <option value="7">7 dias</option>
                      <option value="15">15 dias</option>
                      <option value="30">30 dias</option>
                      <option value="">Sem validade</option>
                    </select>
                  </label>
                  <label className="text-sm">Desconto (R$)
                    <input className="input-base mt-1" inputMode="decimal" placeholder="0,00" value={desconto} onChange={(e) => setDesconto(e.target.value)} />
                  </label>
                  <label className="text-sm">Frete / montagem (R$)
                    <input className="input-base mt-1" inputMode="decimal" placeholder="0,00" value={frete} onChange={(e) => setFrete(e.target.value)} />
                  </label>
                  <label className="text-sm sm:col-span-2">Prazo de entrega
                    <input className="input-base mt-1" placeholder="Ex.: pronta entrega · 7 dias úteis · 15 a 20 dias" value={prazoEntrega} onChange={(e) => setPrazoEntrega(e.target.value)} />
                  </label>
                  <label className="text-sm sm:col-span-2">Observações
                    <textarea className="input-base mt-1" rows={2} placeholder="Ex.: cor Freijó/Off White, entrega no povoado X…" value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
                  </label>
                </div>
              </section>
            </div>

            {/* RESUMO */}
            <aside className="lg:sticky lg:top-4 h-fit">
              <div className="card p-4 space-y-2">
                <h2 className="font-semibold text-madeira-900">Resumo</h2>
                <div className="flex justify-between text-sm"><span>Subtotal à vista</span><span>{formatarMoeda(totais.subtotalAvista)}</span></div>
                {totais.desconto > 0 && <div className="flex justify-between text-sm text-red-700"><span>Desconto</span><span>- {formatarMoeda(totais.desconto)}</span></div>}
                {totais.frete > 0 && <div className="flex justify-between text-sm"><span>Frete / montagem</span><span>{formatarMoeda(totais.frete)}</span></div>}
                <div className="rounded bg-[#123C2E] text-white px-3 py-2 flex justify-between font-bold"><span>À vista</span><span>{formatarMoeda(totais.totalAvista)}</span></div>
                <div className="rounded bg-[#E8F1EC] text-[#123C2E] px-3 py-2 flex justify-between font-bold"><span>A prazo</span><span>{formatarMoeda(totais.totalPrazo)}</span></div>
                <div className="grid gap-2 pt-2">
                  <button className="btn-primario" disabled={salvando} onClick={salvar}>{salvando ? "Salvando…" : editandoId ? "Salvar alterações" : "Salvar orçamento"}</button>
                  <button className="btn-secundario" disabled={salvando} onClick={salvarEImprimir}>Salvar e imprimir</button>
                  <button className="btn-secundario" disabled={salvando} onClick={salvarEWhatsApp}>Salvar e enviar no WhatsApp</button>
                  <button className="text-sm underline text-madeira-700" onClick={limpar}>Limpar tudo / novo</button>
                </div>
              </div>
            </aside>
          </div>
        )}

        {aba === "salvos" && (
          <div>
            <div className="flex flex-wrap gap-2 mb-3">
              <input className="input-base max-w-xs" placeholder="Buscar por cliente, telefone ou nº…" value={buscaSalvos} onChange={(e) => setBuscaSalvos(e.target.value)} />
              <select className="input-base max-w-[180px]" value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value as "todos" | StatusOrcamento)}>
                <option value="todos">Todos</option>
                <option value="aberto">Em aberto</option>
                <option value="aprovado">Aprovados</option>
                <option value="recusado">Recusados</option>
              </select>
              <div className="text-sm text-madeira-700 self-center">
                {resumo.qtdAbertos} em aberto · {formatarMoeda(resumo.valorAbertos)} à vista
              </div>
            </div>
            {salvosFiltrados.length === 0 ? (
              <p className="text-sm text-madeira-700">Nenhum orçamento encontrado.</p>
            ) : (
              <div className="space-y-2">
                {salvosFiltrados.map((o) => (
                  <div key={o.id} className="card p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold">
                          Nº {o.numero} — {o.cliente_nome}
                          <span className={`ml-2 text-xs font-medium px-2 py-0.5 rounded ${STATUS_COR[o.status]}`}>{STATUS_ROTULO[o.status]}</span>
                          {o.status === "aberto" && vencido(o.validade) && <span className="ml-1 text-xs font-medium px-2 py-0.5 rounded bg-gray-200 text-gray-700">vencido</span>}
                        </div>
                        <div className="text-xs text-madeira-700">
                          {new Date(o.criado_em).toLocaleDateString("pt-BR")} · válido até {dataBrCurta(o.validade)} · {o.cliente_telefone || "sem telefone"}
                        </div>
                        <div className="text-sm mt-1">
                          {o.orcamento_itens.map((i) => `${i.quantidade}x ${i.nome}${i.variante ? ` (${i.variante})` : ""}`).join(" · ")}
                        </div>
                      </div>
                      <div className="text-right text-sm">
                        <div className="font-bold">{formatarMoeda(o.total_avista)} <span className="font-normal text-xs">à vista</span></div>
                        <div className="text-madeira-700">{formatarMoeda(o.total_prazo)} a prazo</div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2 text-sm">
                      <button className="btn-secundario !py-1 !px-3" onClick={() => abrirParaEditar(o)}>Editar</button>
                      <button className="btn-secundario !py-1 !px-3" onClick={() => imprimir(dadosDoSalvo(o))}>Imprimir</button>
                      <button className="btn-secundario !py-1 !px-3" onClick={() => whatsappDoSalvo(o)}>WhatsApp</button>
                      <button className="btn-secundario !py-1 !px-3" onClick={() => abrirParaEditar(o, true)}>Duplicar</button>
                      {o.status !== "aprovado" && <button className="btn-secundario !py-1 !px-3" onClick={() => mudarStatus(o, "aprovado")}>Marcar aprovado</button>}
                      {o.status !== "recusado" && <button className="btn-secundario !py-1 !px-3" onClick={() => mudarStatus(o, "recusado")}>Recusado</button>}
                      {o.status !== "aberto" && <button className="btn-secundario !py-1 !px-3" onClick={() => mudarStatus(o, "aberto")}>Reabrir</button>}
                      <button className="text-red-600 underline ml-auto" onClick={() => excluir(o)}>Excluir</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {imprimindo && (
        <div id="area-impressao">
          <ComprovanteOrcamento {...imprimindo} />
        </div>
      )}
    </div>
  );
}
