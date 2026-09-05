"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { formatarMoeda } from "@/lib/format";
import { useLoja } from "@/contexts/LojaContext";
import type { Caixa, Venda } from "@/types";

export default function MovimentoPage() {
  const { lojaAtual } = useLoja();
  const [caixas, setCaixas] = useState<Caixa[]>([]);
  const [filtroCaixa, setFiltroCaixa] = useState("todos");
  const [periodo, setPeriodo] = useState<"hoje" | "ontem" | "personalizado">("hoje");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let query = supabase.from("caixas").select("*").eq("ativo", true).order("nome");
    if (lojaAtual) query = query.eq("loja_id", lojaAtual);
    query.then(({ data }) => data && setCaixas(data as Caixa[]));
  }, [lojaAtual]);

  useEffect(() => {
    carregarVendas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroCaixa, periodo, de, ate, lojaAtual]);

  function intervaloData(): { inicio: Date; fim: Date } | null {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    if (periodo === "hoje") {
      const fim = new Date(hoje);
      fim.setHours(23, 59, 59, 999);
      return { inicio: hoje, fim };
    }
    if (periodo === "ontem") {
      const inicio = new Date(hoje);
      inicio.setDate(inicio.getDate() - 1);
      const fim = new Date(inicio);
      fim.setHours(23, 59, 59, 999);
      return { inicio, fim };
    }
    if (de || ate) {
      const inicio = de ? new Date(de + "T00:00:00") : new Date(2000, 0, 1);
      const fim = ate ? new Date(ate + "T23:59:59") : new Date(2100, 0, 1);
      return { inicio, fim };
    }
    return null;
  }

  async function carregarVendas() {
    setCarregando(true);
    let query = supabase
      .from("vendas")
      .select("*, clientes(nome), venda_itens(*, produtos(custo)), turnos_caixa(caixa_id)")
      .order("criado_em", { ascending: false });
    if (lojaAtual) query = query.eq("loja_id", lojaAtual);

    const intervalo = intervaloData();
    if (intervalo) {
      query = query.gte("criado_em", intervalo.inicio.toISOString()).lte("criado_em", intervalo.fim.toISOString());
    }

    const { data } = await query;
    let lista = (data || []) as unknown as (Venda & { turnos_caixa?: { caixa_id: string } | null })[];

    if (filtroCaixa !== "todos") {
      lista = lista.filter((v) => v.turnos_caixa?.caixa_id === filtroCaixa);
    }

    setVendas(lista);
    setCarregando(false);
  }

  const total = vendas.reduce((s, v) => s + v.total, 0);
  const ticketMedio = vendas.length > 0 ? total / vendas.length : 0;

  function lucroDaVenda(v: Venda): number {
    return (v.venda_itens || []).reduce((s, item) => {
      const custo = item.produtos?.custo || 0;
      return s + (item.total - custo * item.quantidade);
    }, 0);
  }
  const lucroTotal = vendas.reduce((s, v) => s + lucroDaVenda(v), 0);

  return (
    <div className="p-8">
      <h1 className="font-display text-3xl text-madeira-900">Movimento</h1>
      <p className="text-madeira-600 mt-1 mb-6">
        Vendas realizadas, filtradas por caixa e por data, com os produtos detalhados.
      </p>

      <div className="flex flex-wrap gap-4 mb-6">
        <label className="block">
          <span className="text-xs text-madeira-600 mb-1 block">Caixa</span>
          <select className="input-base" value={filtroCaixa} onChange={(e) => setFiltroCaixa(e.target.value)}>
            <option value="todos">Todos os caixas</option>
            {caixas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-madeira-600 mb-1 block">Período</span>
          <select
            className="input-base"
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value as typeof periodo)}
          >
            <option value="hoje">Hoje</option>
            <option value="ontem">Ontem</option>
            <option value="personalizado">Personalizado</option>
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
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="card p-4">
          <p className="text-xs text-madeira-500 mb-1">Total no período</p>
          <p className="font-display text-xl">{formatarMoeda(total)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-madeira-500 mb-1">Lucro no período</p>
          <p className="font-display text-xl text-green-700">{formatarMoeda(lucroTotal)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-madeira-500 mb-1">Quantidade de vendas</p>
          <p className="font-display text-xl">{vendas.length}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-madeira-500 mb-1">Ticket médio</p>
          <p className="font-display text-xl">{formatarMoeda(ticketMedio)}</p>
        </div>
      </div>

      {carregando ? (
        <p className="text-madeira-500 text-sm">Carregando...</p>
      ) : vendas.length === 0 ? (
        <div className="card p-8 text-center text-madeira-500 text-sm">
          Nenhuma venda encontrada com esse filtro.
        </div>
      ) : (
        <div className="space-y-2">
          {vendas.map((v) => (
            <div key={v.id} className="card overflow-hidden">
              <div
                className="flex justify-between items-center px-5 py-3 cursor-pointer hover:bg-madeira-50"
                onClick={() => setAbertos({ ...abertos, [v.id]: !abertos[v.id] })}
              >
                <div>
                  <p className="font-display">
                    Pedido #{v.numero_pedido} — {v.clientes?.nome || "Cliente"}
                  </p>
                  <p className="text-xs text-madeira-500">
                    {new Date(v.criado_em).toLocaleString("pt-BR")} · {v.forma_pagamento}
                    {v.parcelas > 1 ? ` ${v.parcelas}x` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <span className="font-display text-lg block">{formatarMoeda(v.total)}</span>
                  <span className="text-xs text-green-700">Lucro: {formatarMoeda(lucroDaVenda(v))}</span>
                </div>
              </div>
              {abertos[v.id] && (
                <table className="w-full text-sm border-t border-estofado-100">
                  <thead className="bg-madeira-50 text-left">
                    <tr>
                      <th className="px-4 py-2">Produto</th>
                      <th className="px-4 py-2">Qtd.</th>
                      <th className="px-4 py-2 text-right">Valor un.</th>
                      <th className="px-4 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(v.venda_itens || []).map((item) => (
                      <tr key={item.id} className="border-t border-estofado-100">
                        <td className="px-4 py-2">
                          {item.nome_produto}
                          {item.tipo_entrega === "encomenda" && (
                            <span className="tag-encomenda ml-1">ENCOMENDA</span>
                          )}
                          {item.variante && (
                            <span className="block text-xs text-madeira-500">{item.variante}</span>
                          )}
                        </td>
                        <td className="px-4 py-2">{item.quantidade}</td>
                        <td className="px-4 py-2 text-right">{formatarMoeda(item.valor_unitario)}</td>
                        <td className="px-4 py-2 text-right">{formatarMoeda(item.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
