"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { formatarMoeda } from "@/lib/format";
import { useLoja } from "@/contexts/LojaContext";

interface Resumo {
  produtosCadastrados: number;
  encomendasAbertas: number;
  notasNoPeriodo: number;
  faturadoNoPeriodo: number;
  ticketMedio: number;
  estoqueCritico: number;
}

interface ProdutoRanking {
  nome: string;
  quantidade: number;
  valor: number;
}

const ACESSOS_RAPIDOS = [
  {
    href: "/vender",
    label: "Vender",
    icone: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="9" cy="21" r="1" />
        <circle cx="20" cy="21" r="1" />
        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
      </svg>
    ),
  },
  {
    href: "/produtos",
    label: "Produtos",
    icone: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
        <line x1="12" y1="22.08" x2="12" y2="12" />
      </svg>
    ),
  },
  {
    href: "/clientes",
    label: "Clientes",
    icone: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    href: "/encomendas",
    label: "Encomendas",
    icone: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
        <rect x="9" y="3" width="6" height="4" rx="1" />
      </svg>
    ),
  },
  {
    href: "/notas",
    label: "Notas",
    icone: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
  },
  {
    href: "/caixa",
    label: "Caixa",
    icone: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="7" width="20" height="14" rx="2" />
        <path d="M16 21V5a2 2 0 0 0-2-2H10a2 2 0 0 0-2 2v16" />
        <circle cx="12" cy="14" r="2" />
      </svg>
    ),
  },
];

export default function PainelPage() {
  const { lojaAtual } = useLoja();
  const [periodo, setPeriodo] = useState<"hoje" | "7" | "30" | "personalizado">("30");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [topProdutos, setTopProdutos] = useState<ProdutoRanking[]>([]);
  const [semGiro, setSemGiro] = useState<string[]>([]);
  const [ordemTop, setOrdemTop] = useState<"valor" | "quantidade">("valor");
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lojaAtual, periodo, de, ate]);

  function intervaloPeriodo(): { inicio: Date; fim: Date } {
    const fim = new Date();
    fim.setHours(23, 59, 59, 999);
    if (periodo === "personalizado") {
      return {
        inicio: de ? new Date(de + "T00:00:00") : new Date(2000, 0, 1),
        fim: ate ? new Date(ate + "T23:59:59") : fim,
      };
    }
    const inicio = new Date();
    if (periodo === "hoje") inicio.setHours(0, 0, 0, 0);
    else inicio.setDate(inicio.getDate() - Number(periodo));
    return { inicio, fim };
  }

  async function carregar() {
    setCarregando(true);
    const { inicio, fim } = intervaloPeriodo();

    let queryProdutos = supabase.from("produtos").select("id", { count: "exact", head: true }).eq("ativo", true);
    let queryVendas = supabase
      .from("vendas")
      .select("total, venda_itens(nome_produto, quantidade, total)")
      .gte("criado_em", inicio.toISOString())
      .lte("criado_em", fim.toISOString());
    let queryEstoque = supabase.from("estoque_loja").select("quantidade").lte("quantidade", 2);

    // produtos sem giro: sempre nos últimos 30 dias corridos, fixo, independente do período escolhido acima
    const trintaDiasAtras = new Date();
    trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);
    let queryVendasRecentes = supabase
      .from("vendas")
      .select("venda_itens(nome_produto)")
      .gte("criado_em", trintaDiasAtras.toISOString());
    let queryTodosProdutos = supabase.from("produtos").select("nome").eq("ativo", true);

    if (lojaAtual) {
      queryVendas = queryVendas.eq("loja_id", lojaAtual);
      queryEstoque = queryEstoque.eq("loja_id", lojaAtual);
      queryVendasRecentes = queryVendasRecentes.eq("loja_id", lojaAtual);
    }

    const [produtosRes, vendasRes, estoqueRes, vendasRecentesRes, todosProdutosRes] = await Promise.all([
      queryProdutos,
      queryVendas,
      queryEstoque,
      queryVendasRecentes,
      queryTodosProdutos,
    ]);

    const totalVendas = (vendasRes.data || []).reduce((s, v) => s + (v.total || 0), 0);
    const qtdVendas = (vendasRes.data || []).length;

    // agrega os itens vendidos no período por nome de produto
    const agregado = new Map<string, { quantidade: number; valor: number }>();
    (vendasRes.data || []).forEach((v) => {
      (v.venda_itens || []).forEach((item) => {
        const atual = agregado.get(item.nome_produto) || { quantidade: 0, valor: 0 };
        atual.quantidade += item.quantidade;
        atual.valor += item.total;
        agregado.set(item.nome_produto, atual);
      });
    });
    const ranking = Array.from(agregado.entries()).map(([nome, v]) => ({ nome, ...v }));
    setTopProdutos(ranking);

    // produtos que venderam nos últimos 30 dias
    const nomesVendidosRecente = new Set<string>();
    (vendasRecentesRes.data || []).forEach((v) => {
      (v.venda_itens || []).forEach((item) => nomesVendidosRecente.add(item.nome_produto));
    });
    const semGiroLista = (todosProdutosRes.data || [])
      .map((p) => p.nome)
      .filter((nome) => !nomesVendidosRecente.has(nome));
    setSemGiro(semGiroLista);

    setResumo({
      produtosCadastrados: produtosRes.count ?? 0,
      encomendasAbertas: 0,
      notasNoPeriodo: qtdVendas,
      faturadoNoPeriodo: totalVendas,
      ticketMedio: qtdVendas > 0 ? totalVendas / qtdVendas : 0,
      estoqueCritico: (estoqueRes.data || []).length,
    });
    setCarregando(false);
  }

  const topOrdenado = [...topProdutos]
    .sort((a, b) => (ordemTop === "valor" ? b.valor - a.valor : b.quantidade - a.quantidade))
    .slice(0, 10);

  return (
    <div className="p-8">
      <h1 className="font-display text-3xl text-madeira-900">Painel</h1>
      <p className="text-madeira-600 mt-1 mb-8">Visão geral de vendas, produtos e movimento.</p>

      <p className="text-xs font-semibold text-madeira-500 uppercase tracking-wide mb-3">Acesso rápido</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 mb-8">
        {ACESSOS_RAPIDOS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="card p-5 flex flex-col items-center gap-2 text-madeira-700 hover:shadow-md hover:-translate-y-0.5 transition-all"
          >
            {item.icone}
            <span className="text-sm font-semibold text-madeira-800">{item.label}</span>
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-4 mb-6">
        <label className="block">
          <span className="text-xs text-madeira-600 mb-1 block uppercase tracking-wide">Período</span>
          <select
            className="input-base"
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value as typeof periodo)}
          >
            <option value="hoje">Hoje</option>
            <option value="7">Últimos 7 dias</option>
            <option value="30">Últimos 30 dias</option>
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

      {carregando ? (
        <p className="text-madeira-500 text-sm">Carregando...</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <CardResumo titulo="Faturado no período" valor={formatarMoeda(resumo?.faturadoNoPeriodo ?? 0)} destaque />
            <CardResumo titulo="Vendas no período" valor={String(resumo?.notasNoPeriodo ?? 0)} />
            <CardResumo titulo="Produtos cadastrados" valor={String(resumo?.produtosCadastrados ?? 0)} />
            <CardResumo titulo="Ticket médio" valor={formatarMoeda(resumo?.ticketMedio ?? 0)} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <CardResumo titulo="Estoque crítico" valor={`${resumo?.estoqueCritico ?? 0} itens`} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-madeira-500 uppercase tracking-wide">
                  Top 10 produtos mais vendidos
                </p>
                <div className="flex gap-1">
                  <button
                    className={`text-xs px-2 py-1 rounded ${ordemTop === "valor" ? "bg-madeira-700 text-white" : "border border-madeira-300 text-madeira-600"}`}
                    onClick={() => setOrdemTop("valor")}
                  >
                    Por valor
                  </button>
                  <button
                    className={`text-xs px-2 py-1 rounded ${ordemTop === "quantidade" ? "bg-madeira-700 text-white" : "border border-madeira-300 text-madeira-600"}`}
                    onClick={() => setOrdemTop("quantidade")}
                  >
                    Por quantidade
                  </button>
                </div>
              </div>
              {topOrdenado.length === 0 ? (
                <div className="card p-6 text-center text-madeira-500 text-sm">
                  Nenhuma venda nesse período.
                </div>
              ) : (
                <div className="card overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-madeira-50 text-left">
                      <tr>
                        <th className="px-4 py-2">Produto</th>
                        <th className="px-4 py-2 text-right">Qtd.</th>
                        <th className="px-4 py-2 text-right">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topOrdenado.map((p, idx) => (
                        <tr key={p.nome} className="border-t border-estofado-100">
                          <td className="px-4 py-2">
                            <span className="text-madeira-400 mr-1">{idx + 1}.</span>
                            {p.nome}
                          </td>
                          <td className="px-4 py-2 text-right">{p.quantidade}</td>
                          <td className="px-4 py-2 text-right">{formatarMoeda(p.valor)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div>
              <p className="text-xs font-semibold text-madeira-500 uppercase tracking-wide mb-3">
                Produtos sem giro (30 dias)
              </p>
              {semGiro.length === 0 ? (
                <div className="card p-6 text-center text-madeira-500 text-sm">
                  Todos os produtos venderam nos últimos 30 dias 🎉
                </div>
              ) : (
                <div className="card overflow-hidden max-h-80 overflow-y-auto">
                  <ul className="text-sm">
                    {semGiro.map((nome) => (
                      <li key={nome} className="px-4 py-2 border-t border-estofado-100 first:border-0 text-madeira-700">
                        {nome}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function CardResumo({ titulo, valor, destaque }: { titulo: string; valor: string; destaque?: boolean }) {
  return (
    <div className={`card p-5 ${destaque ? "border-l-[3px]" : ""}`} style={destaque ? { borderLeftColor: "#204411" } : undefined}>
      <p className="text-xs text-madeira-500 mb-2">{titulo}</p>
      <p className="font-display text-2xl text-madeira-900">{valor}</p>
    </div>
  );
}
