"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { formatarMoeda } from "@/lib/format";
import { useLoja } from "@/contexts/LojaContext";
import { carregarProdutosComEstoque, ajustarEstoqueLoja } from "@/lib/produtos";
import ComprovanteTroca from "@/components/ComprovanteTroca";
import type {
  Venda,
  VendaItem,
  ProdutoComVariantes,
  LojaCompleta,
  TrocaItemDevolvido,
  TrocaItemNovo,
} from "@/types";

const ESPESSURAS = ["5cm", "7cm", "14cm"];
const TECIDOS = ["Suede", "Linho", "Veludo"];

interface LinhaNova {
  chave: number;
  produto: ProdutoComVariantes | null;
  busca: string;
  tecidoSel: string;
  espessuraSel: string;
  quantidade: number;
  valorAVistaUnit: number;
  valorAPrazoUnit: number;
  tipoEntrega: "pronta" | "encomenda";
}

function estoqueDaLinha(linha: LinhaNova): number {
  if (!linha.produto) return 0;
  if (linha.produto.tipo_precificacao === "tecido") {
    return linha.produto.produto_variantes.find((v) => v.nome_variante === linha.tecidoSel)?.estoque || 0;
  }
  if (linha.produto.tipo_precificacao === "espessura") {
    return linha.produto.produto_variantes.find((v) => v.nome_variante === linha.espessuraSel)?.estoque || 0;
  }
  return linha.produto.quantidade_estoque || 0;
}

function valorAVistaOriginal(item: VendaItem): number {
  // o valor "a prazo" já está salvo (item.valor_unitario); a base à vista é
  // sempre esse valor dividido por 1.1, do mesmo jeito que o resto do sistema
  // calcula em toda parte
  return Math.round((item.valor_unitario / 1.1) * 100) / 100;
}

export default function TrocasPage() {
  const { lojaAtual } = useLoja();
  const [buscaPedido, setBuscaPedido] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [vendaEncontrada, setVendaEncontrada] = useState<Venda | null>(null);
  const [produtos, setProdutos] = useState<ProdutoComVariantes[]>([]);

  const [devolvidosSelecionados, setDevolvidosSelecionados] = useState<Record<string, boolean>>({});
  const [novasLinhas, setNovasLinhas] = useState<LinhaNova[]>([]);
  const [proxChave, setProxChave] = useState(1);
  const [tipoPreco, setTipoPreco] = useState<"avista" | "aprazo">("avista");
  const [formaPagDiferenca, setFormaPagDiferenca] = useState("");
  const [salvando, setSalvando] = useState(false);

  const [concluida, setConcluida] = useState<{
    numeroTroca: number;
    numeroPedidoOriginal: number;
    cliente: { nome: string; cpf: string | null; telefone: string | null; endereco: string | null; numero: string | null; complemento: string | null; cidade: string | null };
    devolvidos: TrocaItemDevolvido[];
    novos: TrocaItemNovo[];
    diferenca: number;
  } | null>(null);
  const [lojaInfo, setLojaInfo] = useState<LojaCompleta | null>(null);

  async function buscarPedido() {
    if (!buscaPedido.trim()) return;
    setBuscando(true);
    setVendaEncontrada(null);
    setDevolvidosSelecionados({});
    setNovasLinhas([]);
    setConcluida(null);
    let query = supabase
      .from("vendas")
      .select("*, clientes(nome, cpf, telefone, endereco, numero, complemento, cidade), venda_itens(*)")
      .eq("numero_pedido", buscaPedido.trim());
    if (lojaAtual) query = query.eq("loja_id", lojaAtual);
    const { data } = await query.maybeSingle();
    if (!data) {
      alert("Pedido não encontrado nessa loja.");
    } else {
      setVendaEncontrada(data as unknown as Venda);
      const lista = await carregarProdutosComEstoque(supabase, lojaAtual);
      setProdutos(lista);
    }
    setBuscando(false);
  }

  function alternarDevolvido(itemId: string) {
    setDevolvidosSelecionados((atual) => ({ ...atual, [itemId]: !atual[itemId] }));
  }

  function adicionarLinhaNova() {
    setNovasLinhas((atual) => [
      ...atual,
      {
        chave: proxChave,
        produto: null,
        busca: "",
        tecidoSel: "Suede",
        espessuraSel: "5cm",
        quantidade: 1,
        valorAVistaUnit: 0,
        valorAPrazoUnit: 0,
        tipoEntrega: "pronta",
      },
    ]);
    setProxChave((c) => c + 1);
  }

  function removerLinhaNova(chave: number) {
    setNovasLinhas((atual) => atual.filter((l) => l.chave !== chave));
  }

  function atualizarLinha(chave: number, mudanca: Partial<LinhaNova>) {
    setNovasLinhas((atual) => atual.map((l) => (l.chave === chave ? { ...l, ...mudanca } : l)));
  }

  function selecionarProdutoNaLinha(chave: number, p: ProdutoComVariantes) {
    let avista = 0;
    let tecido = "Suede";
    let espessura = "5cm";
    if (p.tipo_precificacao === "tecido") {
      tecido = p.produto_variantes[0]?.nome_variante || "Suede";
      avista = p.produto_variantes.find((v) => v.nome_variante === tecido)?.preco_avista || 0;
    } else if (p.tipo_precificacao === "espessura") {
      espessura = p.produto_variantes[0]?.nome_variante || "5cm";
      avista = p.produto_variantes.find((v) => v.nome_variante === espessura)?.preco_avista || 0;
    } else {
      avista = p.preco_venda;
    }
    atualizarLinha(chave, {
      produto: p,
      busca: p.nome,
      tecidoSel: tecido,
      espessuraSel: espessura,
      valorAVistaUnit: avista,
      valorAPrazoUnit: Math.round(avista * 1.1 * 100) / 100,
    });
  }

  function trocarVarianteLinha(chave: number, linha: LinhaNova, campo: "tecidoSel" | "espessuraSel", valor: string) {
    if (!linha.produto) return;
    const v = linha.produto.produto_variantes.find((vv) => vv.nome_variante === valor);
    const avista = v?.preco_avista || 0;
    atualizarLinha(chave, {
      [campo]: valor,
      valorAVistaUnit: avista,
      valorAPrazoUnit: Math.round(avista * 1.1 * 100) / 100,
    } as Partial<LinhaNova>);
  }

  function varianteNomeLinha(linha: LinhaNova): string | null {
    if (!linha.produto) return null;
    if (linha.produto.tipo_precificacao === "tecido") return linha.tecidoSel;
    if (linha.produto.tipo_precificacao === "espessura") return linha.espessuraSel;
    return null;
  }

  function varianteIdLinha(linha: LinhaNova): string | null {
    if (!linha.produto) return null;
    const nome = varianteNomeLinha(linha);
    return linha.produto.produto_variantes.find((v) => v.nome_variante === nome)?.id || null;
  }

  const itensDevolvidos = (vendaEncontrada?.venda_itens || []).filter((i) => devolvidosSelecionados[i.id]);
  const linhasNovasProntas = novasLinhas.filter((l) => l.produto);

  const valorDevolvidoTotal = Math.round(
    itensDevolvidos.reduce((s, item) => {
      const unit = tipoPreco === "avista" ? valorAVistaOriginal(item) : item.valor_unitario;
      return s + unit * item.quantidade;
    }, 0) * 100
  ) / 100;

  const valorNovoTotal = Math.round(
    linhasNovasProntas.reduce((s, l) => {
      const unit = tipoPreco === "avista" ? l.valorAVistaUnit : l.valorAPrazoUnit;
      return s + unit * l.quantidade;
    }, 0) * 100
  ) / 100;

  const diferenca = Math.round((valorNovoTotal - valorDevolvidoTotal) * 100) / 100;

  async function confirmarTroca() {
    if (!vendaEncontrada || !lojaAtual) return;
    if (itensDevolvidos.length === 0) {
      alert("Marque pelo menos um produto devolvido.");
      return;
    }
    if (linhasNovasProntas.length === 0) {
      alert("Adicione pelo menos um produto novo.");
      return;
    }
    if (diferenca !== 0 && !formaPagDiferenca) {
      alert(diferenca > 0 ? "Escolha a forma de pagamento da diferença." : "Escolha a forma de devolução.");
      return;
    }
    for (const l of linhasNovasProntas) {
      if (l.tipoEntrega === "pronta" && l.quantidade > estoqueDaLinha(l)) {
        alert(
          `"${l.produto?.nome}" não tem estoque suficiente pra pronta entrega (disponível: ${estoqueDaLinha(l)}). Marque como Encomenda ou reduza a quantidade.`
        );
        return;
      }
    }

    setSalvando(true);
    try {
      const { data: turno } = await supabase
        .from("turnos_caixa")
        .select("id")
        .eq("status", "aberto")
        .eq("loja_id", lojaAtual)
        .order("aberto_em", { ascending: false })
        .limit(1)
        .maybeSingle();

      const { data: grupo, error: erroGrupo } = await supabase
        .from("trocas_grupo")
        .insert({
          venda_original_id: vendaEncontrada.id,
          tipo_preco: tipoPreco,
          valor_devolvido_total: valorDevolvidoTotal,
          valor_novo_total: valorNovoTotal,
          diferenca,
          forma_pagamento_diferenca: diferenca !== 0 ? formaPagDiferenca : null,
          turno_caixa_id: turno?.id || null,
          loja_id: lojaAtual,
        })
        .select("id, numero_troca")
        .single();
      if (erroGrupo) throw erroGrupo;

      const devolvidosParaInserir = itensDevolvidos.map((item) => ({
        troca_id: grupo.id,
        venda_item_original_id: item.id,
        produto_id: item.produto_id,
        variante_id: null,
        produto_nome: item.nome_produto,
        variante: item.variante,
        quantidade: item.quantidade,
        valor_unitario_avista: valorAVistaOriginal(item),
        valor_unitario_aprazo: item.valor_unitario,
      }));
      const { data: devolvidosInseridos, error: erroDevolvidos } = await supabase
        .from("trocas_devolvidos")
        .insert(devolvidosParaInserir)
        .select("*");
      if (erroDevolvidos) throw erroDevolvidos;

      const novosParaInserir = linhasNovasProntas.map((l) => ({
        troca_id: grupo.id,
        produto_id: l.produto!.id,
        variante_id: varianteIdLinha(l),
        produto_nome: l.produto!.nome,
        variante: varianteNomeLinha(l),
        quantidade: l.quantidade,
        valor_unitario_avista: l.valorAVistaUnit,
        valor_unitario_aprazo: l.valorAPrazoUnit,
        tipo_entrega: l.tipoEntrega,
      }));
      const { data: novosInseridos, error: erroNovos } = await supabase
        .from("trocas_novos")
        .insert(novosParaInserir)
        .select("*");
      if (erroNovos) throw erroNovos;

      // marca os itens originais como trocados
      await supabase
        .from("venda_itens")
        .update({ trocado: true })
        .in("id", itensDevolvidos.map((i) => i.id));

      // devolve ao estoque os produtos devolvidos (se eram pronta entrega)
      for (const item of itensDevolvidos) {
        if (item.tipo_entrega === "pronta" && item.produto_id) {
          const produtoOriginal = produtos.find((p) => p.id === item.produto_id);
          const varianteOriginalId =
            produtoOriginal?.produto_variantes.find((v) => v.nome_variante === item.variante?.split(" — ")[0])
              ?.id || null;
          await ajustarEstoqueLoja(supabase, lojaAtual, item.produto_id, varianteOriginalId, item.quantidade);
        }
      }

      // desconta do estoque os produtos novos — só quando é pronta entrega;
      // encomenda não mexe no estoque agora (o produto ainda não existe na loja)
      for (const l of linhasNovasProntas) {
        if (l.tipoEntrega === "pronta") {
          await ajustarEstoqueLoja(supabase, lojaAtual, l.produto!.id, varianteIdLinha(l), -l.quantidade);
        }
      }

      // Atualiza o caixa com a diferença — mas SEM misturar venda com devolução:
      // se o cliente pagou mais (diferença positiva), isso SOMA em "total vendido"
      // normalmente. Se a loja devolveu dinheiro (diferença negativa), isso NUNCA
      // mexe em "total vendido" — vai só pro indicador separado "total devolvido".
      // O dinheiro físico do caixa só é descontado quando a devolução foi em
      // Dinheiro (Pix/Outro não saem do caixa físico).
      if (turno?.id && diferenca !== 0 && formaPagDiferenca) {
        const { data: turnoAtual } = await supabase
          .from("turnos_caixa")
          .select("total_vendido, total_dinheiro, total_pix, total_debito, total_credito, total_devolvido")
          .eq("id", turno.id)
          .single();
        if (turnoAtual) {
          const totaisAtualizados: Record<string, number> = {};

          if (diferenca > 0) {
            totaisAtualizados.total_vendido = (turnoAtual.total_vendido || 0) + diferenca;
            const campoForma =
              formaPagDiferenca === "Dinheiro"
                ? "total_dinheiro"
                : formaPagDiferenca === "Pix"
                ? "total_pix"
                : formaPagDiferenca === "Débito"
                ? "total_debito"
                : formaPagDiferenca === "Crédito"
                ? "total_credito"
                : null;
            if (campoForma) {
              totaisAtualizados[campoForma] = ((turnoAtual as Record<string, number>)[campoForma] || 0) + diferenca;
            }
          } else {
            totaisAtualizados.total_devolvido = (turnoAtual.total_devolvido || 0) + Math.abs(diferenca);
            if (formaPagDiferenca === "Dinheiro") {
              totaisAtualizados.total_dinheiro = (turnoAtual.total_dinheiro || 0) + diferenca; // diferenca já é negativa
            }
          }

          await supabase.from("turnos_caixa").update(totaisAtualizados).eq("id", turno.id);
        }
      }

      const { data: lojaData } = await supabase.from("lojas").select("*").eq("id", lojaAtual).maybeSingle();
      setLojaInfo(lojaData as LojaCompleta | null);

      setConcluida({
        numeroTroca: grupo.numero_troca,
        numeroPedidoOriginal: vendaEncontrada.numero_pedido,
        cliente: {
          nome: vendaEncontrada.clientes?.nome || "Cliente",
          cpf: vendaEncontrada.clientes?.cpf ?? null,
          telefone: vendaEncontrada.clientes?.telefone ?? null,
          endereco: (vendaEncontrada.clientes as { endereco?: string | null })?.endereco ?? null,
          numero: (vendaEncontrada.clientes as { numero?: string | null })?.numero ?? null,
          complemento: (vendaEncontrada.clientes as { complemento?: string | null })?.complemento ?? null,
          cidade: (vendaEncontrada.clientes as { cidade?: string | null })?.cidade ?? null,
        },
        devolvidos: (devolvidosInseridos || []) as unknown as TrocaItemDevolvido[],
        novos: (novosInseridos || []) as unknown as TrocaItemNovo[],
        diferenca,
      });
    } catch (erro: unknown) {
      // eslint-disable-next-line no-console
      console.error("Erro ao processar troca:", erro);
      const erroObj = erro as { message?: string } | null;
      alert("Erro ao processar a troca: " + (erroObj?.message || "tente novamente."));
    } finally {
      setSalvando(false);
    }
  }

  function novaTroca() {
    setBuscaPedido("");
    setVendaEncontrada(null);
    setDevolvidosSelecionados({});
    setNovasLinhas([]);
    setFormaPagDiferenca("");
    setConcluida(null);
  }

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="font-display text-3xl text-madeira-900">Trocas</h1>
      <p className="text-madeira-600 mt-1 mb-6">
        Troque quantos produtos precisar por quantos produtos novos precisar. Estoque e caixa são
        ajustados automaticamente.
      </p>

      {concluida ? (
        <div className="card p-6">
          <p className="font-display text-lg mb-2">✅ Troca #{concluida.numeroTroca} registrada!</p>
          <p className="text-sm text-madeira-600 mb-4">
            {concluida.diferenca > 0 && `O cliente pagou ${formatarMoeda(concluida.diferenca)} de diferença.`}
            {concluida.diferenca < 0 &&
              `A loja devolveu ${formatarMoeda(Math.abs(concluida.diferenca))} ao cliente.`}
            {concluida.diferenca === 0 && "Troca sem diferença de valor."}
          </p>
          <div className="flex gap-3">
            <button className="btn-secundario" onClick={() => window.print()}>
              🖨 IMPRIMIR COMPROVANTE DE TROCA
            </button>
            <button className="btn-primario" onClick={novaTroca}>
              Fazer outra troca
            </button>
          </div>

          <div id="area-impressao">
            <ComprovanteTroca
              numeroTroca={concluida.numeroTroca}
              numeroPedidoOriginal={concluida.numeroPedidoOriginal}
              cliente={concluida.cliente}
              devolvidos={concluida.devolvidos}
              novos={concluida.novos}
              tipoPreco={tipoPreco}
              diferenca={concluida.diferenca}
              formaPagamentoDiferenca={diferenca !== 0 ? formaPagDiferenca : null}
              loja={lojaInfo}
            />
          </div>
        </div>
      ) : (
        <>
          <div className="card p-5 mb-6">
            <label className="block max-w-xs">
              <span className="text-xs text-madeira-600 mb-1 block">Número do pedido</span>
              <div className="flex gap-2">
                <input
                  className="input-base"
                  value={buscaPedido}
                  onChange={(e) => setBuscaPedido(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && buscarPedido()}
                  placeholder="Ex: 42"
                />
                <button className="btn-secundario" onClick={buscarPedido} disabled={buscando}>
                  {buscando ? "..." : "Buscar"}
                </button>
              </div>
            </label>
          </div>

          {vendaEncontrada && (
            <>
              <div className="card p-5 mb-6">
                <p className="font-display text-lg mb-1">
                  Pedido #{vendaEncontrada.numero_pedido} — {vendaEncontrada.clientes?.nome}
                </p>
                <p className="text-xs text-madeira-500 mb-4">
                  Marque um ou mais produtos que o cliente está devolvendo:
                </p>
                <div className="space-y-2">
                  {(vendaEncontrada.venda_itens || []).map((item) => (
                    <label
                      key={item.id}
                      className={`flex items-center justify-between border rounded p-3 cursor-pointer ${
                        devolvidosSelecionados[item.id] ? "border-madeira-700 bg-madeira-50" : "border-estofado-100"
                      } ${item.trocado ? "opacity-50" : ""}`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={!!devolvidosSelecionados[item.id]}
                          disabled={item.trocado}
                          onChange={() => alternarDevolvido(item.id)}
                        />
                        <p className="text-sm">
                          {item.quantidade}x {item.nome_produto}
                          {item.variante ? ` — ${item.variante}` : ""}
                          {item.trocado && <span className="text-xs text-red-700 ml-2">(já trocado)</span>}
                        </p>
                      </div>
                      <span className="text-sm font-display">
                        {tipoPreco === "avista"
                          ? formatarMoeda(valorAVistaOriginal(item) * item.quantidade)
                          : formatarMoeda(item.total)}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="card p-5 mb-6">
                <div className="flex justify-between items-center mb-3">
                  <p className="font-display text-lg">Novos produtos</p>
                  <button className="btn-secundario text-xs px-3 py-1.5" onClick={adicionarLinhaNova}>
                    + Adicionar outro produto
                  </button>
                </div>

                {novasLinhas.length === 0 && (
                  <p className="text-sm text-madeira-500">Nenhum produto novo adicionado ainda.</p>
                )}

                {novasLinhas.map((linha) => {
                  const produtosFiltrados = produtos.filter(
                    (p) => !linha.busca || p.nome.toLowerCase().includes(linha.busca.toLowerCase())
                  );
                  return (
                    <div key={linha.chave} className="border border-estofado-100 rounded p-3 mb-3">
                      <div className="flex justify-between items-start mb-2">
                        <label className="block relative flex-1 mr-3">
                          <span className="text-xs text-madeira-600 mb-1 block">Buscar produto</span>
                          <input
                            className="input-base"
                            value={linha.busca}
                            onChange={(e) => atualizarLinha(linha.chave, { busca: e.target.value, produto: null })}
                          />
                          {linha.busca && !linha.produto && (
                            <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-madeira-200 rounded shadow-lg max-h-56 overflow-y-auto">
                              {produtosFiltrados.slice(0, 20).map((p) => (
                                <div
                                  key={p.id}
                                  className="px-3 py-2 text-sm hover:bg-madeira-50 cursor-pointer border-b border-estofado-100 last:border-0"
                                  onClick={() => selecionarProdutoNaLinha(linha.chave, p)}
                                >
                                  {p.nome}
                                </div>
                              ))}
                            </div>
                          )}
                        </label>
                        <button
                          className="text-xs text-red-700 mt-5"
                          onClick={() => removerLinhaNova(linha.chave)}
                        >
                          remover
                        </button>
                      </div>

                      {linha.produto && (
                        <>
                          {linha.produto.tipo_precificacao === "tecido" && (
                            <div className="mb-2">
                              <span className="text-xs text-madeira-600 mb-1 block">Tecido</span>
                              <div className="grid grid-cols-3 gap-2">
                                {TECIDOS.map((t) => (
                                  <button
                                    key={t}
                                    type="button"
                                    className={`opcao-btn ${linha.tecidoSel === t ? "ativo" : ""}`}
                                    onClick={() => trocarVarianteLinha(linha.chave, linha, "tecidoSel", t)}
                                  >
                                    {t}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                          {linha.produto.tipo_precificacao === "espessura" && (
                            <div className="mb-2">
                              <span className="text-xs text-madeira-600 mb-1 block">Espessura</span>
                              <div className="grid grid-cols-3 gap-2">
                                {ESPESSURAS.map((e) => (
                                  <button
                                    key={e}
                                    type="button"
                                    className={`opcao-btn ${linha.espessuraSel === e ? "ativo" : ""}`}
                                    onClick={() => trocarVarianteLinha(linha.chave, linha, "espessuraSel", e)}
                                  >
                                    {e}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                          <div className="grid grid-cols-2 gap-3 mb-3">
                            <label className="block">
                              <span className="text-xs text-madeira-600 mb-1 block">Recebimento</span>
                              <div className="grid grid-cols-2 gap-2">
                                <button
                                  type="button"
                                  className={`opcao-btn ${linha.tipoEntrega === "pronta" ? "ativo" : ""}`}
                                  onClick={() => atualizarLinha(linha.chave, { tipoEntrega: "pronta" })}
                                >
                                  Pronta entrega
                                </button>
                                <button
                                  type="button"
                                  className={`opcao-btn ${linha.tipoEntrega === "encomenda" ? "ativo" : ""}`}
                                  onClick={() => atualizarLinha(linha.chave, { tipoEntrega: "encomenda" })}
                                >
                                  Encomenda
                                </button>
                              </div>
                            </label>
                            <div>
                              <span className="text-xs text-madeira-600 mb-1 block">Estoque disponível</span>
                              <p
                                className={`text-sm font-semibold mt-2 ${
                                  estoqueDaLinha(linha) > 0 ? "text-green-700" : "text-red-700"
                                }`}
                              >
                                {estoqueDaLinha(linha)} unidade(s)
                              </p>
                              {linha.tipoEntrega === "pronta" && linha.quantidade > estoqueDaLinha(linha) && (
                                <p className="text-xs text-red-700">Estoque insuficiente pra pronta entrega.</p>
                              )}
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-3">
                            <label className="block">
                              <span className="text-xs text-madeira-600 mb-1 block">Quantidade</span>
                              <input
                                className="input-base"
                                type="number"
                                min={1}
                                value={linha.quantidade}
                                onChange={(e) =>
                                  atualizarLinha(linha.chave, { quantidade: Math.max(1, Number(e.target.value) || 1) })
                                }
                              />
                            </label>
                            <label className="block">
                              <span className="text-xs text-madeira-600 mb-1 block">Preço à vista (un.)</span>
                              <input
                                className="input-base bg-madeira-50"
                                type="text"
                                readOnly
                                value={formatarMoeda(linha.valorAVistaUnit)}
                                title="Preço do cadastro do produto — não editável"
                              />
                            </label>
                            <label className="block">
                              <span className="text-xs text-madeira-600 mb-1 block">Preço a prazo (un.)</span>
                              <input
                                className="input-base bg-madeira-50"
                                type="text"
                                readOnly
                                value={formatarMoeda(linha.valorAPrazoUnit)}
                                title="Preço do cadastro do produto — não editável"
                              />
                            </label>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="card p-5 mb-6">
                <p className="text-xs font-semibold text-madeira-700 mb-2">Tipo de preço usado no cálculo</p>
                <div className="grid grid-cols-2 gap-2 mb-4 max-w-xs">
                  <button
                    type="button"
                    className={`opcao-btn ${tipoPreco === "avista" ? "ativo" : ""}`}
                    onClick={() => setTipoPreco("avista")}
                  >
                    À vista
                  </button>
                  <button
                    type="button"
                    className={`opcao-btn ${tipoPreco === "aprazo" ? "ativo" : ""}`}
                    onClick={() => setTipoPreco("aprazo")}
                  >
                    A prazo
                  </button>
                </div>

                <div className="space-y-2 text-sm bg-madeira-50 rounded p-4 mb-4">
                  <div className="flex justify-between">
                    <span className="text-madeira-600">Valor dos produtos devolvidos</span>
                    <span>{formatarMoeda(valorDevolvidoTotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-madeira-600">Valor dos novos produtos</span>
                    <span>{formatarMoeda(valorNovoTotal)}</span>
                  </div>
                  <div className="flex justify-between font-display text-base pt-2 border-t border-estofado-100">
                    <span>{diferenca >= 0 ? "Diferença a pagar" : "Diferença a devolver"}</span>
                    <span className={diferenca > 0 ? "text-madeira-900" : diferenca < 0 ? "text-red-700" : ""}>
                      {formatarMoeda(Math.abs(diferenca))}
                    </span>
                  </div>
                </div>

                {diferenca !== 0 && (
                  <label className="block mb-4 max-w-xs">
                    <span className="text-xs text-madeira-600 mb-1 block">
                      {diferenca > 0 ? "Forma de pagamento da diferença" : "Forma de devolução ao cliente"}
                    </span>
                    <select
                      className="input-base"
                      value={formaPagDiferenca}
                      onChange={(e) => setFormaPagDiferenca(e.target.value)}
                    >
                      <option value="">Selecione...</option>
                      <option value="Dinheiro">Dinheiro</option>
                      <option value="Pix">Pix</option>
                      {diferenca > 0 && <option value="Débito">Débito</option>}
                      {diferenca > 0 && <option value="Crédito">Crédito</option>}
                      <option value="Outro">Outro</option>
                    </select>
                  </label>
                )}

                <button className="btn-primario" disabled={salvando} onClick={confirmarTroca}>
                  {salvando ? "Salvando..." : diferenca === 0 ? "Finalizar troca" : "Confirmar e registrar diferença"}
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
