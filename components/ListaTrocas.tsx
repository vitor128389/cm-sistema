"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { formatarMoeda } from "@/lib/format";
import { useLoja } from "@/contexts/LojaContext";
import { definirTamanhoPagina, ajustarEscalaImpressaoA4 } from "@/lib/imprimir";
import { registrarAuditoria } from "@/lib/auditoria";
import ComprovanteTroca from "@/components/ComprovanteTroca";
import ComprovanteTrocaCupom88mm from "@/components/ComprovanteTrocaCupom88mm";
import type { LojaCompleta, TrocaGrupo } from "@/types";

const apenasNumeros = (s: string) => s.replace(/\D/g, "");

// Lista de trocas já registradas (com impressão A4 / cupom 88mm e marcação de entrega).
export default function ListaTrocas() {
  const { lojaAtual } = useLoja();
  const [trocas, setTrocas] = useState<TrocaGrupo[]>([]);
  const [busca, setBusca] = useState("");
  const [trocaImprimindo, setTrocaImprimindo] = useState<TrocaGrupo | null>(null);
  const [lojaImprimindo, setLojaImprimindo] = useState<LojaCompleta | null>(null);
  const [formatoImpressao, setFormatoImpressao] = useState<"a4" | "cupom88">("a4");

  async function carregarTrocas() {
    let query = supabase
      .from("trocas_grupo")
      .select("*, vendas(numero_pedido, clientes(nome, cpf, telefone, endereco, numero, complemento, cidade, povoado, bairro)), trocas_devolvidos(*), trocas_novos(*)")
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

  useEffect(() => {
    carregarTrocas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lojaAtual]);

  const trocasFiltradas = trocas.filter((t) => {
    if (!busca.trim()) return true;
    const alvo = busca.trim().toLowerCase();
    if (String(t.numero_troca).includes(alvo)) return true;
    if (String(t.vendas?.numero_pedido || "").includes(alvo)) return true;
    if (t.vendas?.clientes?.nome?.toLowerCase().includes(alvo)) return true;
    const cpfDigitos = apenasNumeros(alvo);
    if (cpfDigitos.length >= 3 && (t.vendas?.clientes?.cpf || "").includes(cpfDigitos)) return true;
    return false;
  });

  async function imprimirTroca(t: TrocaGrupo, formato: "a4" | "cupom88" = "a4") {
    setFormatoImpressao(formato);
    setTrocaImprimindo(t);
    if (t.loja_id) {
      const { data } = await supabase.from("lojas").select("*").eq("id", t.loja_id).maybeSingle();
      setLojaImprimindo(data as LojaCompleta | null);
    }
    definirTamanhoPagina(formato);
    setTimeout(async () => {
      if (formato === "a4") await ajustarEscalaImpressaoA4();
      window.print();
    }, 100);
  }

  async function marcarItemTrocaEntregue(itemId: string) {
    await supabase
      .from("trocas_novos")
      .update({ status_entrega: "entregue", data_entregue: new Date().toISOString() })
      .eq("id", itemId);
    registrarAuditoria({
      lojaId: lojaAtual,
      categoria: "Entregas",
      acao: "alteracao",
      registroTipo: "troca_item",
      registroId: itemId,
      descricao: "Item de troca marcado como entregue",
      dadosDepois: { status_entrega: "entregue" },
    });
    carregarTrocas();
  }

  return (
    <div className="mt-10">
      <input
        className="input-base max-w-sm"
        placeholder="Buscar troca por número, pedido ou cliente"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
      />
      {trocasFiltradas.length > 0 && (
        <>
          <p className="text-sm font-semibold text-madeira-700 mt-8 mb-3">Trocas registradas</p>
          <div className="space-y-3">
            {trocasFiltradas.map((t) => (
              <div key={t.id} className="card p-5 border-l-4 border-l-amber-400">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <p className="font-display text-lg text-madeira-900">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-800 mr-2">
                        TROCA
                      </span>
                      Troca #{t.numero_troca} — {t.vendas?.clientes?.nome || "Cliente"}
                    </p>
                    <p className="text-xs text-madeira-500">
                      {new Date(t.criado_em).toLocaleString("pt-BR")} · Pedido original #{t.vendas?.numero_pedido}
                      {t.forma_pagamento_diferenca === "Crédito" && (t.parcelas_diferenca || 1) > 1
                        ? ` · Crédito ${t.parcelas_diferenca}x`
                        : t.forma_pagamento_diferenca
                        ? ` · ${t.forma_pagamento_diferenca}`
                        : ""}
                    </p>
                    {t.vendas?.clientes?.endereco && (
                      <p className="text-xs text-madeira-400">
                        {t.vendas.clientes.endereco}
                        {t.vendas.clientes.numero ? `, ${t.vendas.clientes.numero}` : ""}
                        {t.vendas.clientes.cidade ? ` — ${t.vendas.clientes.cidade}` : ""}
                        {t.vendas.clientes.povoado ? ` — ${t.vendas.clientes.povoado}` : ""}
                      </p>
                    )}
                    {t.cancelada && (
                      <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded mt-1 bg-red-100 text-red-700">
                        CANCELADA{t.motivo_cancelamento ? ` — ${t.motivo_cancelamento}` : ""}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="font-display text-lg text-madeira-900">
                      {t.diferenca === 0
                        ? "Sem diferença"
                        : t.diferenca > 0
                        ? `+ ${formatarMoeda(t.valor_cobrado_diferenca ?? t.diferenca)}`
                        : `− ${formatarMoeda(Math.abs(t.diferenca))}`}
                    </p>
                    <button className="btn-secundario text-xs px-2 py-1" onClick={() => imprimirTroca(t)}>
                      🖨
                    </button>
                    <button
                      className="btn-secundario text-xs px-2 py-1"
                      onClick={() => imprimirTroca(t, "cupom88")}
                      title="Imprimir cupom para impressora térmica 88mm"
                    >
                      🧾 88mm
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3 text-sm text-madeira-600">
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
                    <ul className="space-y-1">
                      {(t.trocas_novos || []).map((n) => (
                        <li key={n.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                          <span>
                            {n.quantidade}x {n.produto_nome}
                            {n.variante ? ` — ${n.variante}` : ""}
                          </span>
                          {n.status_entrega && (
                            <span className="flex items-center gap-2 shrink-0">
                              <span
                                className={`text-xs px-2 py-0.5 rounded font-medium ${
                                  n.status_entrega === "entregue"
                                    ? "bg-green-50 text-green-700"
                                    : "bg-amber-50 text-amber-700"
                                }`}
                              >
                                {n.status_entrega === "entregue"
                                  ? "✓ ENTREGUE"
                                  : n.tipo_entrega === "encomenda"
                                  ? "ENCOMENDA"
                                  : "AGUARDANDO ENTREGA"}
                              </span>
                              {n.status_entrega === "entregue" && n.data_entregue && (
                                <span className="text-xs text-madeira-500">
                                  em {new Date(n.data_entregue).toLocaleDateString("pt-BR")}
                                </span>
                              )}
                              {n.status_entrega !== "entregue" && (
                                <button
                                  className="btn-secundario text-xs px-2 py-1"
                                  onClick={() => marcarItemTrocaEntregue(n.id)}
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
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      {trocasFiltradas.length === 0 && <p className="text-sm text-madeira-500 mt-4">Nenhuma troca encontrada.</p>}

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
          />
          );
        })()}
      </div>
    </div>
  );
}
