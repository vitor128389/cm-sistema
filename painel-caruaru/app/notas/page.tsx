"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { formatarMoeda } from "@/lib/format";
import ComprovanteImpressao from "@/components/ComprovanteImpressao";
import ComprovanteTroca from "@/components/ComprovanteTroca";
import { useLoja } from "@/contexts/LojaContext";
import { gerarNotaSimplesPdf } from "@/lib/gerarNotaSimplesPdf";
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
  // Abre direto no app do WhatsApp Desktop instalado no computador
  // (não abre aba nenhuma no navegador).
  return `whatsapp://send?phone=${comDDI}&text=${encodeURIComponent(mensagem)}`;
}

function diasRestantes(prazo: string): number {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const dataPrazo = new Date(prazo + "T00:00:00");
  return Math.round((dataPrazo.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
}

function pedidoPendente(v: Venda): boolean {
  return !!v.prazo_entrega_maximo && (v.venda_itens || []).some((i) => i.status_entrega === "encomenda");
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
function valorPagoItem(item: { total: number }, itensTodos: { total: number }[], totalPago: number): number {
  const somaListada = itensTodos.reduce((s, i) => s + i.total, 0);
  if (somaListada <= 0) return 0;
  return Math.round(totalPago * (item.total / somaListada) * 100) / 100;
}

export default function NotasPage() {
  const { lojaAtual } = useLoja();
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erroCarregar, setErroCarregar] = useState("");
  const [periodo, setPeriodo] = useState<"hoje" | "ontem" | "personalizado" | "todos">("hoje");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [busca, setBusca] = useState("");
  const [somenteAberto, setSomenteAberto] = useState(false);
  const [somenteRetirada, setSomenteRetirada] = useState(false);
  const [somenteEntregues, setSomenteEntregues] = useState(false);
  const [notaImprimindo, setNotaImprimindo] = useState<Venda | null>(null);
  const [lojaImprimindo, setLojaImprimindo] = useState<LojaCompleta | null>(null);
  const [mensagemSelecionada, setMensagemSelecionada] = useState<Record<string, string>>({});
  const [trocas, setTrocas] = useState<TrocaGrupo[]>([]);
  const [trocaImprimindo, setTrocaImprimindo] = useState<TrocaGrupo | null>(null);

  async function carregarTrocas() {
    let query = supabase
      .from("trocas_grupo")
      .select("*, vendas(numero_pedido, clientes(nome, cpf, telefone, endereco, numero, complemento, cidade)), trocas_devolvidos(*), trocas_novos(*)")
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
      .select("*, clientes(nome, cpf, telefone, endereco, numero, complemento, cidade), venda_itens(*), venda_pagamentos(*)")
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
        .select("*, clientes(nome, cpf, telefone, endereco, numero, complemento, cidade), venda_itens(*)")
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lojaAtual]);

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
    const cpfDigitos = apenasNumeros(alvo);
    if (cpfDigitos.length >= 3 && (v.clientes?.cpf || "").includes(cpfDigitos)) return true;
    return false;
  }

  const vendasFiltradas = vendas.filter((v) => {
    if (somenteAberto && !pedidoPendente(v)) return false;
    if (somenteRetirada && !temItemRetirada(v)) return false;
    if (somenteEntregues && !pedidoEntregue(v)) return false;
    if (busca.trim()) return bateComBusca(v, busca);
    return dentroDoPeriodo(v.criado_em);
  });

  const pedidosVencendoLogo = vendas.filter(
    (v) => pedidoPendente(v) && diasRestantes(v.prazo_entrega_maximo as string) <= 2
  );

  const trocasFiltradas = trocas.filter((t) => {
    if (!busca.trim()) return dentroDoPeriodo(t.criado_em);
    const alvo = busca.trim().toLowerCase();
    if (String(t.numero_troca).includes(alvo)) return true;
    if (t.vendas?.clientes?.nome?.toLowerCase().includes(alvo)) return true;
    const cpfDigitos = apenasNumeros(alvo);
    if (cpfDigitos.length >= 3 && (t.vendas?.clientes?.cpf || "").includes(cpfDigitos)) return true;
    return false;
  });

  async function imprimirTroca(t: TrocaGrupo) {
    setTrocaImprimindo(t);
    if (t.loja_id) {
      const { data } = await supabase.from("lojas").select("*").eq("id", t.loja_id).maybeSingle();
      setLojaImprimindo(data as LojaCompleta | null);
    }
    setTimeout(() => window.print(), 100);
  }

  async function imprimir(v: Venda) {
    setNotaImprimindo(v);
    if (v.loja_id) {
      const { data } = await supabase.from("lojas").select("*").eq("id", v.loja_id).maybeSingle();
      setLojaImprimindo(data as LojaCompleta | null);
    } else {
      setLojaImprimindo(null);
    }
    setTimeout(() => window.print(), 100);
  }

  async function marcarEntregue(itemId: string) {
    await supabase
      .from("venda_itens")
      .update({ status_entrega: "entregue", data_entregue: new Date().toISOString() })
      .eq("id", itemId);
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
    window.location.href = linkWhatsApp(telefone, mensagem);
  }

  async function enviarPdfWhatsApp(v: Venda) {
    let loja: LojaCompleta | null = null;
    if (v.loja_id) {
      const { data } = await supabase.from("lojas").select("*").eq("id", v.loja_id).maybeSingle();
      loja = data as LojaCompleta | null;
    }

    const blob = await gerarNotaSimplesPdf(v, loja);
    const nomeArquivo = `pedido-${v.numero_pedido}.pdf`;
    const arquivo = new File([blob], nomeArquivo, { type: "application/pdf" });

    // No celular, abre o menu de compartilhar do sistema já com o PDF
    // pronto — o usuário só escolhe o WhatsApp na lista.
    if (typeof navigator !== "undefined" && "canShare" in navigator && navigator.canShare({ files: [arquivo] })) {
      try {
        await navigator.share({
          files: [arquivo],
          title: `Pedido #${v.numero_pedido}`,
          text: `Pedido #${v.numero_pedido} — ${v.clientes?.nome || "cliente"}`,
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
      window.location.href = linkWhatsApp(telefone, `Segue o pedido #${v.numero_pedido} em PDF.`);
    } else {
      alert("PDF baixado. Esse cliente não tem celular cadastrado pra abrir o WhatsApp direto.");
    }
  }

  return (
    <div className="p-8">
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
            placeholder="Nome, CPF ou número do pedido..."
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
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-display text-lg text-madeira-900">
                    Pedido #{v.numero_pedido} — {v.clientes?.nome || "Cliente"}
                  </p>
                  <p className="text-xs text-madeira-500">
                    {new Date(v.criado_em).toLocaleString("pt-BR")} ·{" "}
                    {v.forma_pagamento === "Dividido" && v.venda_pagamentos
                      ? `Dividido (${v.venda_pagamentos.map((p) => p.forma_pagamento).join(" + ")})`
                      : v.forma_pagamento}
                  </p>
                  {pedidoPendente(v) &&
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
                <div className="flex items-center gap-3">
                  <p className="font-display text-lg text-madeira-900">{formatarMoeda(v.total)}</p>
                  {v.clientes?.telefone && (
                    <>
                      <select
                        className="text-xs border border-madeira-200 rounded px-1.5 py-1"
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
                  <button className="btn-secundario text-xs px-2 py-1" onClick={() => imprimir(v)}>
                    🖨
                  </button>
                  <button
                    className="text-xs px-2 py-1 rounded bg-green-700 text-white font-medium hover:bg-green-800"
                    onClick={() => enviarPdfWhatsApp(v)}
                    title="Gerar PDF da nota e enviar por WhatsApp"
                  >
                    📄 PDF WhatsApp
                  </button>
                </div>
              </div>
              <ul className="mt-3 text-sm text-madeira-600 space-y-1">
                {(v.venda_itens || []).map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-2">
                    <span>
                      {item.quantidade}x {item.nome_produto}
                      {item.tipo_entrega === "encomenda" && !item.retirada && (
                        <span className="tag-encomenda ml-1">ENCOMENDA</span>
                      )}
                      {item.variante ? ` — ${item.variante}` : ""} —{" "}
                      {formatarMoeda(valorPagoItem(item, v.venda_itens || [], v.total))}
                      {item.observacao && (
                        <span className="block text-xs text-madeira-700">
                          Obs: <strong>{item.observacao}</strong>
                        </span>
                      )}
                    </span>
                    {item.status_entrega && (
                      <span className="flex items-center gap-2 shrink-0">
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
                            : "ENCOMENDA"}
                        </span>
                        {item.status_entrega !== "entregue" && (
                          <button
                            className="btn-secundario text-xs px-2 py-1"
                            onClick={() => marcarEntregue(item.id)}
                          >
                            ENTREGUE
                          </button>
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

      {trocasFiltradas.length > 0 && (
        <>
          <p className="text-sm font-semibold text-madeira-700 mt-8 mb-3">Trocas</p>
          <div className="space-y-3">
            {trocasFiltradas.map((t) => (
              <div key={t.id} className="card p-5 border-l-4 border-l-amber-400">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-display text-lg text-madeira-900">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-800 mr-2">
                        TROCA
                      </span>
                      Troca #{t.numero_troca} — {t.vendas?.clientes?.nome || "Cliente"}
                    </p>
                    <p className="text-xs text-madeira-500">
                      {new Date(t.criado_em).toLocaleString("pt-BR")} · Pedido original #{t.vendas?.numero_pedido}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="font-display text-lg text-madeira-900">
                      {t.diferenca === 0
                        ? "Sem diferença"
                        : t.diferenca > 0
                        ? `+ ${formatarMoeda(t.diferenca)}`
                        : `− ${formatarMoeda(Math.abs(t.diferenca))}`}
                    </p>
                    <button className="btn-secundario text-xs px-2 py-1" onClick={() => imprimirTroca(t)}>
                      🖨
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-3 text-sm text-madeira-600">
                  <div>
                    <p className="text-xs font-semibold text-madeira-700 mb-1">Devolvido</p>
                    <ul className="space-y-0.5">
                      {(t.trocas_devolvidos || []).map((d) => (
                        <li key={d.id}>
                          {d.quantidade}x {d.produto_nome}
                          {d.variante ? ` — ${d.variante}` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-madeira-700 mb-1">Novo</p>
                    <ul className="space-y-0.5">
                      {(t.trocas_novos || []).map((n) => (
                        <li key={n.id}>
                          {n.quantidade}x {n.produto_nome}
                          {n.variante ? ` — ${n.variante}` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div id="area-impressao">
        {notaImprimindo && (
          <ComprovanteImpressao
            numeroPedido={notaImprimindo.numero_pedido}
            cliente={{
              nome: notaImprimindo.clientes?.nome || "Cliente",
              cpf: notaImprimindo.clientes?.cpf,
              telefone: notaImprimindo.clientes?.telefone,
              endereco: notaImprimindo.clientes?.endereco,
              numero: notaImprimindo.clientes?.numero,
              complemento: notaImprimindo.clientes?.complemento,
              cidade: notaImprimindo.clientes?.cidade,
            }}
            loja={lojaImprimindo}
            total={notaImprimindo.total}
            formaPagamento={notaImprimindo.forma_pagamento}
            pagamentos={(notaImprimindo.venda_pagamentos || []).map((p) => ({
              forma: p.forma_pagamento,
              parcelas: p.parcelas,
              valorAPagar: p.valor,
            }))}
            prazoEntregaMaximo={notaImprimindo.prazo_entrega_maximo}
            itens={notaImprimindo.venda_itens || []}
          />
        )}
        {trocaImprimindo && (
          <ComprovanteTroca
            numeroTroca={trocaImprimindo.numero_troca}
            numeroPedidoOriginal={trocaImprimindo.vendas?.numero_pedido || 0}
            cliente={{
              nome: trocaImprimindo.vendas?.clientes?.nome || "Cliente",
              cpf: trocaImprimindo.vendas?.clientes?.cpf ?? null,
              telefone: trocaImprimindo.vendas?.clientes?.telefone ?? null,
              endereco: trocaImprimindo.vendas?.clientes?.endereco ?? null,
              numero: trocaImprimindo.vendas?.clientes?.numero ?? null,
              complemento: trocaImprimindo.vendas?.clientes?.complemento ?? null,
              cidade: trocaImprimindo.vendas?.clientes?.cidade ?? null,
            }}
            devolvidos={trocaImprimindo.trocas_devolvidos || []}
            novos={trocaImprimindo.trocas_novos || []}
            tipoPreco={trocaImprimindo.tipo_preco}
            diferenca={trocaImprimindo.diferenca}
            formaPagamentoDiferenca={trocaImprimindo.forma_pagamento_diferenca}
            loja={lojaImprimindo}
          />
        )}
      </div>
    </div>
  );
}
