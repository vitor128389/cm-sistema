"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { formatarMoeda, formatarData } from "@/lib/format";
import { useLoja } from "@/contexts/LojaContext";
import type { Venda } from "@/types";

function apenasNumeros(v: string) {
  return v.replace(/\D/g, "");
}

export default function EncomendasPage() {
  const { lojaAtual } = useLoja();
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erroCarregar, setErroCarregar] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<"todas" | "encomenda" | "entregue">("todas");
  const [periodo, setPeriodo] = useState<"todos" | "hoje" | "ontem" | "personalizado">("todos");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [busca, setBusca] = useState("");

  async function carregar() {
    setCarregando(true);
    setErroCarregar("");
    let query = supabase
      .from("vendas")
      .select("*, clientes(nome, telefone, cpf), venda_itens(*)")
      .order("criado_em", { ascending: false });
    if (lojaAtual) query = query.eq("loja_id", lojaAtual);
    const { data, error } = await query;

    if (error) {
      // eslint-disable-next-line no-console
      console.error("Erro ao carregar encomendas:", error);
      setErroCarregar(
        "Não deu pra carregar as encomendas: " +
          (error.message || "erro desconhecido") +
          ". Confira se todas as migrações do banco (v4 a v9) foram aplicadas."
      );
    }

    const lista = ((data || []) as unknown as Venda[]).filter((v) =>
      (v.venda_itens || []).some((i) => i.tipo_entrega === "encomenda")
    );
    setVendas(lista);
    setCarregando(false);
  }

  useEffect(() => {
    carregar();
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

  const vendasFiltradas = vendas.filter((v) => {
    if (busca.trim()) {
      const alvo = busca.trim().toLowerCase();
      const cpfDigitos = apenasNumeros(alvo);
      const bateBusca =
        String(v.numero_pedido).includes(alvo) ||
        !!v.clientes?.nome?.toLowerCase().includes(alvo) ||
        (cpfDigitos.length >= 3 && (v.clientes?.cpf || "").includes(cpfDigitos));
      if (!bateBusca) return false;
    } else if (!dentroDoPeriodo(v.criado_em)) {
      return false;
    }
    if (filtroStatus === "todas") return true;
    return (v.venda_itens || []).some(
      (i) => i.tipo_entrega === "encomenda" && i.status_entrega === filtroStatus
    );
  });

  return (
    <div className="p-8">
      <h1 className="font-display text-3xl text-madeira-900">Encomendas</h1>
      <p className="text-madeira-600 mt-1 mb-6">Pedidos com itens sob encomenda, até a entrega.</p>

      {erroCarregar && (
        <div className="card p-4 border-amber-300 bg-amber-50 text-amber-800 text-sm mb-6">{erroCarregar}</div>
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
        <div className="flex gap-2">
          {(["todas", "encomenda", "entregue"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFiltroStatus(f)}
              className={`text-xs px-3 py-1.5 rounded border ${
                filtroStatus === f
                  ? "bg-madeira-700 text-white border-madeira-700"
                  : "border-madeira-300 text-madeira-600"
              }`}
            >
              {f === "todas" ? "Todas" : f === "encomenda" ? "Encomenda" : "Entregue"}
            </button>
          ))}
        </div>

        {!busca && (
          <>
            <label className="block">
              <span className="text-xs text-madeira-600 mb-1 block">Período</span>
              <select className="input-base" value={periodo} onChange={(e) => setPeriodo(e.target.value as typeof periodo)}>
                <option value="todos">Todos</option>
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
          </>
        )}
      </div>

      {carregando ? (
        <p className="text-madeira-500 text-sm">Carregando...</p>
      ) : vendasFiltradas.length === 0 ? (
        <div className="card p-8 text-center text-madeira-500 text-sm">Nenhuma encomenda encontrada.</div>
      ) : (
        <div className="space-y-3">
          {vendasFiltradas.map((v) => (
            <div key={v.id} className="card p-5">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="font-display text-lg text-madeira-900">
                    Pedido #{v.numero_pedido} — {v.clientes?.nome || "Cliente"}
                  </p>
                  <p className="text-xs text-madeira-500">
                    {formatarData(v.criado_em)}
                    {v.prazo_entrega_maximo ? ` · prazo máximo: ${formatarData(v.prazo_entrega_maximo)}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-display text-lg">{formatarMoeda(v.total)}</p>
                </div>
              </div>
              <div className="space-y-2 mt-3">
                {(v.venda_itens || []).map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between border-t border-estofado-100 pt-2 text-sm"
                  >
                    <div>
                      <span
                        className={`text-xs px-2 py-0.5 rounded mr-2 ${
                          item.tipo_entrega === "encomenda"
                            ? "bg-latao-400/20 text-madeira-700"
                            : "bg-green-50 text-green-700"
                        }`}
                      >
                        {item.tipo_entrega === "encomenda" ? "ENCOMENDA" : "PRONTA ENTREGA"}
                      </span>
                      {item.quantidade}x {item.nome_produto}
                      {item.variante && <span className="text-madeira-500"> — {item.variante}</span>}
                    </div>
                    {item.status_entrega && (
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
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
