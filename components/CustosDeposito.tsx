"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { formatarMoeda, normalizarBusca } from "@/lib/format";
import { carregarProdutosComEstoque } from "@/lib/produtos";
import type { ProdutoComVariantes } from "@/types";

interface Linha {
  chave: string;
  nome: string;
  variante: string | null;
  quantidade: number;
  custo: number;
  venda: number;
}

function ordemTecido(nome: string): number {
  const ordem: Record<string, number> = { Suede: 0, Linho: 1, Veludo: 2 };
  return ordem[nome] ?? 99;
}

// Custos do estoque do Depósito. Fica só na Administração (a tela Depósito não mostra custo).
export default function CustosDeposito() {
  const [carregando, setCarregando] = useState(true);
  const [temDeposito, setTemDeposito] = useState(true);
  const [produtos, setProdutos] = useState<ProdutoComVariantes[]>([]);
  const [busca, setBusca] = useState("");
  const [soComEstoque, setSoComEstoque] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: loja } = await supabase.from("lojas").select("id").eq("eh_deposito", true).maybeSingle();
      if (!loja?.id) {
        setTemDeposito(false);
        setCarregando(false);
        return;
      }
      setProdutos(await carregarProdutosComEstoque(supabase, loja.id));
      setCarregando(false);
    })();
  }, []);

  const linhas: Linha[] = [];
  produtos.forEach((p) => {
    if (p.produto_variantes.length > 0) {
      [...p.produto_variantes]
        .sort((a, b) => ordemTecido(a.nome_variante) - ordemTecido(b.nome_variante))
        .forEach((v) =>
          linhas.push({ chave: `${p.id}:${v.id}`, nome: p.nome, variante: v.nome_variante, quantidade: v.estoque || 0, custo: v.custo || 0, venda: v.preco_avista || 0 })
        );
    } else {
      linhas.push({ chave: `${p.id}:s`, nome: p.nome, variante: null, quantidade: p.quantidade_estoque || 0, custo: p.custo || 0, venda: p.preco_venda || 0 });
    }
  });

  const filtradas = linhas
    .filter((l) => (soComEstoque ? l.quantidade > 0 : true))
    .filter((l) => !busca || normalizarBusca(`${l.nome} ${l.variante || ""}`).includes(normalizarBusca(busca)))
    .sort((a, b) => a.nome.localeCompare(b.nome));

  const totalCusto = filtradas.reduce((s, l) => s + l.quantidade * l.custo, 0);
  const totalVenda = filtradas.reduce((s, l) => s + l.quantidade * l.venda, 0);
  const totalPecas = filtradas.reduce((s, l) => s + l.quantidade, 0);

  if (carregando) return <p className="text-sm text-madeira-500">Carregando...</p>;
  if (!temDeposito) return <p className="text-sm text-madeira-600">Nenhuma loja está marcada como Depósito.</p>;

  return (
    <div>
      <p className="text-sm text-madeira-600 mb-4">
        Custo e valor de venda do que está no Depósito. Essas informações só aparecem aqui, na Administração.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div className="card p-4">
          <p className="text-xs text-madeira-500">Peças no Depósito</p>
          <p className="font-display text-xl text-madeira-900">{totalPecas}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-madeira-500">Total a preço de custo</p>
          <p className="font-display text-xl text-madeira-900">{formatarMoeda(totalCusto)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-madeira-500">Total a preço de venda (à vista)</p>
          <p className="font-display text-xl text-madeira-900">{formatarMoeda(totalVenda)}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-3">
        <input className="input-base max-w-xs" placeholder="Buscar produto..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        <label className="text-sm text-madeira-600 flex items-center gap-2">
          <input type="checkbox" checked={soComEstoque} onChange={(e) => setSoComEstoque(e.target.checked)} />
          Só itens com estoque
        </label>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-madeira-50 text-madeira-600 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Produto</th>
              <th className="px-4 py-3 font-medium">Tecido/Cor</th>
              <th className="px-4 py-3 font-medium">Qtd.</th>
              <th className="px-4 py-3 font-medium">Custo unit.</th>
              <th className="px-4 py-3 font-medium">Custo total</th>
              <th className="px-4 py-3 font-medium">Venda unit.</th>
              <th className="px-4 py-3 font-medium">Margem</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-madeira-500">
                  Nada para mostrar.
                </td>
              </tr>
            )}
            {filtradas.map((l) => {
              const margem = l.venda > 0 && l.custo > 0 ? ((l.venda - l.custo) / l.venda) * 100 : null;
              return (
                <tr key={l.chave} className={`border-t border-estofado-100 ${l.quantidade === 0 ? "opacity-50" : ""}`}>
                  <td className="px-4 py-2 text-madeira-900">{l.nome}</td>
                  <td className="px-4 py-2 text-madeira-600">{l.variante || "—"}</td>
                  <td className="px-4 py-2 text-madeira-900">{l.quantidade}</td>
                  <td className="px-4 py-2 text-madeira-600">{formatarMoeda(l.custo)}</td>
                  <td className="px-4 py-2 text-madeira-900 font-medium">{formatarMoeda(l.quantidade * l.custo)}</td>
                  <td className="px-4 py-2 text-madeira-600">{formatarMoeda(l.venda)}</td>
                  <td className="px-4 py-2 text-madeira-600">{margem === null ? "—" : `${margem.toFixed(0)}%`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
