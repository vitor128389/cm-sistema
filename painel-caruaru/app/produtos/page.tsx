"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { formatarMoeda } from "@/lib/format";
import { useLoja } from "@/contexts/LojaContext";
import { carregarProdutosComEstoque } from "@/lib/produtos";
import type { ProdutoComVariantes } from "@/types";

const CATEGORIAS_FIXAS = ["Sofás", "Poltronas", "Namoradeiras", "Puffs", "Camas", "Cabeceiras"];

export default function ProdutosPage() {
  const { lojaAtual } = useLoja();
  const [produtos, setProdutos] = useState<ProdutoComVariantes[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [categoriaAtiva, setCategoriaAtiva] = useState<string | null>(null);

  async function carregar() {
    setCarregando(true);
    setErro(null);
    try {
      const data = await carregarProdutosComEstoque(supabase, lojaAtual);
      setProdutos(data);
    } catch {
      setErro("Não deu pra carregar os produtos. Confira a configuração do Supabase.");
    }
    setCarregando(false);
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lojaAtual]);

  const categorias = Array.from(new Set([...CATEGORIAS_FIXAS, ...produtos.map((p) => p.categoria)]));

  const produtosFiltrados = produtos.filter((p) => {
    if (busca && !p.nome.toLowerCase().includes(busca.toLowerCase())) return false;
    if (categoriaAtiva && p.categoria !== categoriaAtiva) return false;
    return true;
  });

  return (
    <div className="p-8">
      <h1 className="font-display text-3xl text-madeira-900">Produtos</h1>
      <p className="text-madeira-600 mt-1 mb-6">Peças da fábrica e da loja, com custo, preço e lucro.</p>

      <label className="block max-w-sm mb-4">
        <span className="text-xs text-madeira-600 mb-1 block">Buscar produto</span>
        <input
          className="input-base"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Digite o nome do produto..."
        />
      </label>

      <div className="flex flex-wrap gap-2 mb-6">
        <button
          className={`text-xs px-3 py-1.5 rounded-full border ${
            !categoriaAtiva ? "bg-madeira-700 text-white border-madeira-700" : "border-madeira-300 text-madeira-600"
          }`}
          onClick={() => setCategoriaAtiva(null)}
        >
          Todas
        </button>
        {categorias.map((c) => (
          <button
            key={c}
            className={`text-xs px-3 py-1.5 rounded-full border ${
              categoriaAtiva === c
                ? "bg-madeira-700 text-white border-madeira-700"
                : "border-madeira-300 text-madeira-600"
            }`}
            onClick={() => setCategoriaAtiva(c)}
          >
            {c}
          </button>
        ))}
      </div>

      {erro && (
        <div className="card p-4 border-amber-300 bg-amber-50 text-amber-800 text-sm mb-6">{erro}</div>
      )}

      {carregando ? (
        <p className="text-madeira-500 text-sm">Carregando...</p>
      ) : produtosFiltrados.length === 0 ? (
        <div className="card p-8 text-center text-madeira-500 text-sm">
          Nenhum produto encontrado. Cadastre novos produtos em Administração → Estoque.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-madeira-50 text-madeira-600 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Produto</th>
                <th className="px-4 py-3 font-medium">Categoria</th>
                <th className="px-4 py-3 font-medium">Custo</th>
                <th className="px-4 py-3 font-medium">Preço (à vista / a prazo)</th>
                <th className="px-4 py-3 font-medium">Disponibilidade</th>
              </tr>
            </thead>
            <tbody>
              {produtosFiltrados.map((p) => (
                <tr key={p.id} className="border-t border-estofado-100 align-top">
                  <td className="px-4 py-3 text-madeira-900">{p.nome}</td>
                  <td className="px-4 py-3 text-madeira-600">{p.categoria}</td>
                  <td className="px-4 py-3 text-madeira-600">
                    {(p as unknown as { custo: number }).custo > 0
                      ? formatarMoeda((p as unknown as { custo: number }).custo)
                      : "A definir"}
                  </td>
                  <td className="px-4 py-3 text-madeira-600">
                    {p.produto_variantes.length > 0 ? (
                      p.produto_variantes.map((v) => (
                        <div key={v.id}>
                          {v.nome_variante}: {formatarMoeda(v.preco_avista)}{" "}
                          <span className="text-xs text-madeira-400">
                            (a prazo {formatarMoeda(Math.round(v.preco_avista * 1.1 * 100) / 100)})
                          </span>
                        </div>
                      ))
                    ) : (
                      <>
                        {formatarMoeda(p.preco_venda)}{" "}
                        <span className="text-xs text-madeira-400">
                          (a prazo {formatarMoeda(Math.round(p.preco_venda * 1.1 * 100) / 100)})
                        </span>
                      </>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {p.produto_variantes.length > 0 ? (
                      p.produto_variantes.map((v) => (
                        <div key={v.id} className="text-xs mb-1">
                          <span
                            className={`px-2 py-0.5 rounded ${
                              v.estoque > 0 ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                            }`}
                          >
                            {v.nome_variante}: {v.estoque > 0 ? `${v.estoque} un.` : "sem estoque"}
                          </span>
                        </div>
                      ))
                    ) : (p.quantidade_estoque ?? 0) > 0 ? (
                      <span className="text-xs bg-green-50 text-green-700 px-2 py-1 rounded">
                        Pronta entrega ({p.quantidade_estoque})
                      </span>
                    ) : (
                      <span className="text-xs bg-red-50 text-red-700 px-2 py-1 rounded">Sem estoque</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-madeira-400 mt-4">
        Cadastro de produtos novos e edição de estoque agora ficam em Administração → Estoque.
      </p>
    </div>
  );
}
