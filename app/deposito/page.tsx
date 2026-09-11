"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { formatarMoeda, normalizarBusca } from "@/lib/format";
import { useLoja } from "@/contexts/LojaContext";
import { carregarProdutosComEstoque, ajustarEstoqueLoja } from "@/lib/produtos";
import type { ProdutoComVariantes } from "@/types";

// Ordem fixa Suede/Linho/Veludo primeiro, igual o resto do sistema.
function ordemTecido(nome: string): number {
  const ordem: Record<string, number> = { Suede: 0, Linho: 1, Veludo: 2 };
  return ordem[nome] ?? 99;
}

interface LinhaDeposito {
  produtoId: string;
  varianteId: string | null;
  nome: string;
  categoria: string;
  variante: string | null; // tecido/cor/espessura — o que a variante representar nesse produto
  quantidade: number;
  custo: number;
  precoVenda: number;
}

export default function DepositoPage() {
  const router = useRouter();
  const { lojas } = useLoja();
  const [depositoLojaId, setDepositoLojaId] = useState<string | null>(null);
  const [produtos, setProdutos] = useState<ProdutoComVariantes[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [categoriaFiltro, setCategoriaFiltro] = useState<string | null>(null);
  const [movendo, setMovendo] = useState<LinhaDeposito | null>(null);
  const [qtdMover, setQtdMover] = useState("1");
  const [lojaDestino, setLojaDestino] = useState("");
  const [salvandoMovimento, setSalvandoMovimento] = useState(false);
  const [historico, setHistorico] = useState<
    { id: string; produto_nome: string; variante_nome: string | null; quantidade: number; criado_em: string; destino: string | null }[]
  >([]);

  async function carregar() {
    setCarregando(true);
    const { data: loja } = await supabase.from("lojas").select("id").eq("eh_deposito", true).maybeSingle();
    const idDeposito = loja?.id || null;
    setDepositoLojaId(idDeposito);
    if (idDeposito) {
      const data = await carregarProdutosComEstoque(supabase, idDeposito);
      setProdutos(data);
    }
    const { data: mov } = await supabase
      .from("movimentacoes_estoque")
      .select("id, produto_nome, variante_nome, quantidade, criado_em, lojas!movimentacoes_estoque_destino_loja_id_fkey(nome)")
      .order("criado_em", { ascending: false })
      .limit(10);
    setHistorico(
      (mov || []).map((m) => ({
        id: m.id,
        produto_nome: m.produto_nome,
        variante_nome: m.variante_nome,
        quantidade: m.quantidade,
        criado_em: m.criado_em,
        destino: (m.lojas as unknown as { nome: string } | null)?.nome ?? null,
      }))
    );
    setCarregando(false);
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Achata produto+variantes numa linha por item que realmente tem
  // quantidade no Depósito — é isso que aparece na listagem.
  const linhas: LinhaDeposito[] = [];
  produtos.forEach((p) => {
    if (p.produto_variantes.length > 0) {
      [...p.produto_variantes]
        .sort((a, b) => ordemTecido(a.nome_variante) - ordemTecido(b.nome_variante))
        .forEach((v) => {
          if (v.estoque > 0) {
            linhas.push({
              produtoId: p.id,
              varianteId: v.id,
              nome: p.nome,
              categoria: p.categoria,
              variante: v.nome_variante,
              quantidade: v.estoque,
              custo: v.custo || 0,
              precoVenda: v.preco_avista,
            });
          }
        });
    } else if ((p.quantidade_estoque || 0) > 0) {
      linhas.push({
        produtoId: p.id,
        varianteId: null,
        nome: p.nome,
        categoria: p.categoria,
        variante: null,
        quantidade: p.quantidade_estoque || 0,
        custo: p.custo,
        precoVenda: p.preco_venda,
      });
    }
  });

  const categorias = Array.from(new Set(linhas.map((l) => l.categoria)));

  const linhasFiltradas = linhas.filter((l) => {
    if (categoriaFiltro && l.categoria !== categoriaFiltro) return false;
    if (busca) {
      const alvo = normalizarBusca(`${l.nome} ${l.categoria} ${l.variante || ""}`);
      if (!alvo.includes(normalizarBusca(busca))) return false;
    }
    return true;
  });

  const totalProdutos = linhasFiltradas.length;
  const totalUnidades = linhasFiltradas.reduce((s, l) => s + l.quantidade, 0);

  function abrirMover(linha: LinhaDeposito) {
    setMovendo(linha);
    setQtdMover("1");
    setLojaDestino(lojas[0]?.id || "");
  }

  async function confirmarMover() {
    if (!movendo || !depositoLojaId) return;
    const qtd = parseInt(qtdMover) || 0;
    if (qtd <= 0) {
      alert("Digite uma quantidade válida.");
      return;
    }
    if (qtd > movendo.quantidade) {
      alert(`Só tem ${movendo.quantidade} unidade(s) no Depósito — não dá pra mover mais do que isso.`);
      return;
    }
    if (!lojaDestino) {
      alert("Escolha a loja de destino.");
      return;
    }
    setSalvandoMovimento(true);
    try {
      // Tira do Depósito e soma na loja de destino — o total da empresa
      // não muda, só a localização das unidades.
      await ajustarEstoqueLoja(supabase, depositoLojaId, movendo.produtoId, movendo.varianteId, -qtd);
      await ajustarEstoqueLoja(supabase, lojaDestino, movendo.produtoId, movendo.varianteId, qtd);

      await supabase.from("movimentacoes_estoque").insert({
        produto_id: movendo.produtoId,
        variante_id: movendo.varianteId,
        produto_nome: movendo.nome,
        variante_nome: movendo.variante,
        origem_loja_id: depositoLojaId,
        destino_loja_id: lojaDestino,
        quantidade: qtd,
        tipo: "transferencia",
      });

      setMovendo(null);
      carregar();
    } catch (e) {
      alert("Erro ao mover: " + (e as Error).message);
    } finally {
      setSalvandoMovimento(false);
    }
  }

  function irVender(linha: LinhaDeposito) {
    const params = new URLSearchParams({ deposito: linha.produtoId });
    if (linha.varianteId) params.set("variante", linha.varianteId);
    router.push(`/vender?${params.toString()}`);
  }

  return (
    <div className="p-4 md:p-8">
      <h1 className="font-display text-3xl text-madeira-900">Depósito</h1>
      <p className="text-madeira-600 mt-1 mb-6">
        Móveis guardados no depósito — não é uma loja, é um estoque à parte que pode ser movido pra
        qualquer loja ou vendido direto.
      </p>

      <div className="grid grid-cols-2 gap-4 max-w-md mb-6">
        <div className="card p-4">
          <p className="text-xs text-madeira-500">Total de produtos</p>
          <p className="font-display text-2xl text-madeira-900">{totalProdutos}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-madeira-500">Total de unidades</p>
          <p className="font-display text-2xl text-madeira-900">{totalUnidades}</p>
        </div>
      </div>

      <label className="block max-w-sm mb-4">
        <span className="text-xs text-madeira-600 mb-1 block">Buscar produto</span>
        <input
          className="input-base"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Nome, categoria, tecido/cor..."
        />
      </label>

      <div className="flex flex-wrap gap-2 mb-6">
        <button
          className={`text-xs px-3 py-1.5 rounded-full border ${
            !categoriaFiltro ? "bg-madeira-700 text-white border-madeira-700" : "border-madeira-300 text-madeira-600"
          }`}
          onClick={() => setCategoriaFiltro(null)}
        >
          Todas
        </button>
        {categorias.map((c) => (
          <button
            key={c}
            className={`text-xs px-3 py-1.5 rounded-full border ${
              categoriaFiltro === c
                ? "bg-madeira-700 text-white border-madeira-700"
                : "border-madeira-300 text-madeira-600"
            }`}
            onClick={() => setCategoriaFiltro(c)}
          >
            {c}
          </button>
        ))}
      </div>

      {carregando ? (
        <p className="text-madeira-500 text-sm">Carregando...</p>
      ) : linhasFiltradas.length === 0 ? (
        <div className="card p-8 text-center text-madeira-500 text-sm">
          Nada no Depósito ainda. Cadastre estoque no Depósito normalmente em Administração → Estoque.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-madeira-50 text-madeira-600 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Produto</th>
                <th className="px-4 py-3 font-medium">Categoria</th>
                <th className="px-4 py-3 font-medium">Tecido/Cor</th>
                <th className="px-4 py-3 font-medium">Qtd.</th>
                <th className="px-4 py-3 font-medium">Custo</th>
                <th className="px-4 py-3 font-medium">Venda</th>
                <th className="px-4 py-3 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {linhasFiltradas.map((l) => (
                <tr key={`${l.produtoId}-${l.varianteId}`} className="border-t border-estofado-100">
                  <td className="px-4 py-3 text-madeira-900">{l.nome}</td>
                  <td className="px-4 py-3 text-madeira-600">{l.categoria}</td>
                  <td className="px-4 py-3 text-madeira-600">{l.variante || "—"}</td>
                  <td className="px-4 py-3 text-madeira-900 font-medium">{l.quantidade}</td>
                  <td className="px-4 py-3 text-madeira-600">{formatarMoeda(l.custo)}</td>
                  <td className="px-4 py-3 text-madeira-600">{formatarMoeda(l.precoVenda)}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button className="btn-secundario text-xs px-2 py-1" onClick={() => abrirMover(l)}>
                        Mover para loja
                      </button>
                      <button className="btn-primario text-xs px-2 py-1" onClick={() => irVender(l)}>
                        Vender
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {historico.length > 0 && (
        <div className="mt-8">
          <p className="text-sm font-semibold text-madeira-700 mb-2">Últimas transferências</p>
          <div className="card p-4 text-xs text-madeira-600 space-y-1">
            {historico.map((h) => (
              <p key={h.id}>
                {new Date(h.criado_em).toLocaleString("pt-BR")} — Transferência: Depósito → {h.destino} —{" "}
                {h.produto_nome}
                {h.variante_nome ? ` — ${h.variante_nome}` : ""} — {h.quantidade} unidade(s)
              </p>
            ))}
          </div>
        </div>
      )}

      {movendo && (
        <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full">
            <p className="font-display text-lg mb-1">Mover para loja</p>
            <p className="text-sm text-madeira-600 mb-4">
              {movendo.nome}
              {movendo.variante ? ` — ${movendo.variante}` : ""} · {movendo.quantidade} disponível(is) no
              Depósito
            </p>
            <label className="block mb-3">
              <span className="text-xs text-madeira-600 mb-1 block">Quantidade a mover</span>
              <input
                className="input-base"
                type="number"
                min={1}
                max={movendo.quantidade}
                value={qtdMover}
                onChange={(e) => setQtdMover(e.target.value)}
              />
            </label>
            <label className="block mb-4">
              <span className="text-xs text-madeira-600 mb-1 block">Loja de destino</span>
              <select className="input-base" value={lojaDestino} onChange={(e) => setLojaDestino(e.target.value)}>
                {lojas.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nome}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex gap-2">
              <button className="btn-primario flex-1" onClick={confirmarMover} disabled={salvandoMovimento}>
                {salvandoMovimento ? "Movendo..." : "Confirmar"}
              </button>
              <button className="btn-secundario flex-1" onClick={() => setMovendo(null)}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
