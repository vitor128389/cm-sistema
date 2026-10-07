"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { formatarMoeda } from "@/lib/format";
import { carregarProdutosComEstoque, ajustarEstoqueLoja } from "@/lib/produtos";
import { registrarAuditoria } from "@/lib/auditoria";
import { lerPdfComoLinhas, interpretarLinhasNota, type NotaLida } from "@/lib/lerNotaFiscal";
import type { ProdutoComVariantes } from "@/types";

interface Linha {
  chave: string;
  nome: string;
  acabamentos: string[];
  quantidade: number;
  custo: number;
  preco: string; // editável
  precoManual: boolean;
  categoria: string;
  produtoId: string; // "" = criar produto novo
  incluir: boolean;
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\(\s*20\d\d\s*\)/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

const arredondar = (v: number) => Math.round(v);
const nomeLimpo = (s: string) => s.replace(/\(\s*20\d\d\s*\)/g, "").replace(/\s+/g, " ").trim();

export default function EntradaNota() {
  const [depositoId, setDepositoId] = useState<string | null>(null);
  const [produtos, setProdutos] = useState<ProdutoComVariantes[]>([]);
  const [categorias, setCategorias] = useState<string[]>([]);
  const [nota, setNota] = useState<NotaLida | null>(null);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [fator, setFator] = useState("2");
  const [lendo, setLendo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [jaLancada, setJaLancada] = useState(false);
  const [atualizarCusto, setAtualizarCusto] = useState(true);
  const [atualizarPreco, setAtualizarPreco] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const simples = useMemo(() => produtos.filter((p) => p.produto_variantes.length === 0), [produtos]);

  async function carregarBase() {
    const { data: dep } = await supabase.from("lojas").select("id").eq("eh_deposito", true).maybeSingle();
    setDepositoId(dep?.id ?? null);
    setProdutos(await carregarProdutosComEstoque(supabase, dep?.id ?? null));
    const { data: cats } = await supabase.from("categorias").select("nome, ativo").order("nome");
    setCategorias((cats || []).filter((c) => c.ativo !== false).map((c) => c.nome));
  }
  useEffect(() => {
    carregarBase();
  }, []);

  function precoSugerido(custo: number, f: string) {
    const n = parseFloat(f.replace(",", "."));
    return n > 0 ? String(arredondar(custo * n)) : "";
  }

  async function aoEscolherArquivo(file: File | undefined) {
    if (!file) return;
    setMsg(null);
    setLendo(true);
    setNota(null);
    setLinhas([]);
    try {
      const linhasPdf = await lerPdfComoLinhas(await file.arrayBuffer());
      const lida = interpretarLinhasNota(linhasPdf);
      if (lida.itens.length === 0) {
        setMsg("Não consegui encontrar produtos nesse PDF. Confira se é o DANFE da nota fiscal.");
        return;
      }
      // junta o mesmo produto de acabamentos diferentes numa linha só
      const mapa = new Map<string, Linha>();
      for (const it of lida.itens) {
        const k = norm(it.descricao);
        const existente = mapa.get(k);
        if (existente) {
          const totalQtd = existente.quantidade + it.quantidade;
          existente.custo = (existente.custo * existente.quantidade + it.valorUnitario * it.quantidade) / totalQtd;
          existente.quantidade = totalQtd;
          if (it.acabamento && !existente.acabamentos.includes(it.acabamento)) existente.acabamentos.push(it.acabamento);
        } else {
          const achado = simples.find((p) => norm(p.nome) === k);
          mapa.set(k, {
            chave: k,
            nome: nomeLimpo(it.descricao),
            acabamentos: it.acabamento ? [it.acabamento] : [],
            quantidade: it.quantidade,
            custo: it.valorUnitario,
            preco: "",
            precoManual: false,
            categoria: achado?.categoria || "Móveis Montados",
            produtoId: achado?.id ?? "",
            incluir: true,
          });
        }
      }
      const lista = Array.from(mapa.values()).map((l) => ({
        ...l,
        custo: Math.round(l.custo * 100) / 100,
        preco: precoSugerido(l.custo, fator),
      }));
      setNota(lida);
      setLinhas(lista);
      if (lida.chave) {
        const { data } = await supabase.from("notas_entrada").select("id").eq("chave_acesso", lida.chave).maybeSingle();
        setJaLancada(!!data);
      } else setJaLancada(false);
    } catch (e) {
      setMsg("Erro ao ler o PDF: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLendo(false);
    }
  }

  function mudarFator(v: string) {
    setFator(v);
    setLinhas((ls) => ls.map((l) => (l.precoManual ? l : { ...l, preco: precoSugerido(l.custo, v) })));
  }

  function atualizar(chave: string, parcial: Partial<Linha>) {
    setLinhas((ls) => ls.map((l) => (l.chave === chave ? { ...l, ...parcial } : l)));
  }

  function escolherProduto(chave: string, id: string) {
    const p = simples.find((x) => x.id === id);
    atualizar(chave, { produtoId: id, ...(p ? { categoria: p.categoria } : {}) });
  }

  const selecionadas = linhas.filter((l) => l.incluir && l.quantidade > 0);
  const totalUnidades = selecionadas.reduce((s, l) => s + l.quantidade, 0);
  const totalCusto = selecionadas.reduce((s, l) => s + l.quantidade * l.custo, 0);

  async function confirmar() {
    if (!nota || !depositoId || selecionadas.length === 0) return;
    if (jaLancada && !confirm("Essa nota JÁ foi lançada antes. Lançar de novo vai somar o estoque outra vez. Continuar mesmo assim?")) return;
    if (selecionadas.some((l) => !(parseFloat(l.preco) > 0))) {
      alert("Tem produto sem preço de venda. Preencha o preço (ou use o fator) antes de confirmar.");
      return;
    }
    if (!confirm(`Dar entrada de ${totalUnidades} unidade(s) (${selecionadas.length} produtos) no Depósito?`)) return;

    setSalvando(true);
    setMsg(null);
    try {
      const resumo: { nome: string; quantidade: number; custo: number; preco: number; novo: boolean }[] = [];
      for (const l of selecionadas) {
        const preco = parseFloat(l.preco.replace(",", "."));
        let produtoId = l.produtoId;
        const novo = !produtoId;
        if (novo) {
          const { data: criado, error } = await supabase
            .from("produtos")
            .insert({
              nome: l.nome,
              categoria: l.categoria,
              preco_venda: preco,
              custo: l.custo,
              tipo_estoque: "pronta_entrega",
              tipo_precificacao: "simples",
            })
            .select("id")
            .single();
          if (error || !criado) throw new Error(`Não consegui criar "${l.nome}": ${error?.message}`);
          produtoId = criado.id;
        } else if (atualizarCusto || atualizarPreco) {
          const upd: Record<string, number> = {};
          if (atualizarCusto) upd.custo = l.custo;
          if (atualizarPreco) upd.preco_venda = preco;
          await supabase.from("produtos").update(upd).eq("id", produtoId);
        }
        const { error: erroEst } = await ajustarEstoqueLoja(supabase, depositoId, produtoId, null, l.quantidade);
        if (erroEst) throw new Error(`Erro ao somar estoque de "${l.nome}": ${erroEst.message}`);
        resumo.push({ nome: l.nome, quantidade: l.quantidade, custo: l.custo, preco, novo });
      }

      const { data: u } = await supabase.auth.getUser();
      await supabase.from("notas_entrada").insert({
        chave_acesso: jaLancada ? null : nota.chave,
        numero: nota.numero,
        fornecedor: nota.fornecedor,
        loja_id: depositoId,
        total: Math.round(totalCusto * 100) / 100,
        fator_preco: parseFloat(fator.replace(",", ".")) || null,
        itens: resumo,
        usuario_id: u.user?.id ?? null,
      });

      registrarAuditoria({
        lojaId: depositoId,
        categoria: "Estoque",
        acao: "entrada_estoque",
        registroTipo: "nota_fiscal",
        registroNome: `NF ${nota.numero ?? ""} — ${nota.fornecedor ?? ""}`.trim(),
        descricao: `Entrada da NF ${nota.numero ?? "?"} (${nota.fornecedor ?? "fornecedor"}) no Depósito: ${totalUnidades} unidade(s) de ${selecionadas.length} produto(s), ${resumo.filter((r) => r.novo).length} cadastrado(s) novo(s)`,
        dadosDepois: { itens: resumo, chave: nota.chave },
      });

      setMsg(`✔ Entrada feita: ${totalUnidades} unidade(s) no Depósito (${resumo.filter((r) => r.novo).length} produto(s) novo(s) cadastrado(s)).`);
      setNota(null);
      setLinhas([]);
      await carregarBase();
    } catch (e) {
      setMsg("⚠ " + (e instanceof Error ? e.message : String(e)) + " — confira o Depósito: parte dos itens pode já ter entrado.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-estofado-100 rounded-xl p-4">
        <h2 className="font-display text-xl text-madeira-900">Entrada de nota fiscal</h2>
        <p className="text-sm text-madeira-600 mt-1">
          Envie o PDF da nota (DANFE). Os produtos entram no estoque do <b>Depósito</b>. Custo = valor unitário da nota
          (sem IPI); preço de venda = custo × fator, e você pode ajustar cada um.
        </p>
        <input
          type="file"
          accept="application/pdf"
          className="mt-3 text-sm"
          disabled={lendo || salvando}
          onChange={(e) => aoEscolherArquivo(e.target.files?.[0])}
        />
        {lendo && <p className="text-sm text-madeira-600 mt-2">Lendo a nota…</p>}
        {msg && <p className="text-sm mt-2 font-medium text-madeira-900">{msg}</p>}
      </div>

      {nota && (
        <div className="bg-white border border-estofado-100 rounded-xl p-4 space-y-3">
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-madeira-700">
            <span><b>Fornecedor:</b> {nota.fornecedor ?? "—"}</span>
            <span><b>NF:</b> {nota.numero ?? "—"}</span>
            <span><b>Itens:</b> {nota.itens.length} linhas · {nota.itens.reduce((s, i) => s + i.quantidade, 0)} un.</span>
            <span><b>Total dos produtos:</b> {formatarMoeda(nota.totalItens)}</span>
          </div>
          {jaLancada && (
            <p className="text-sm bg-red-50 border border-red-200 text-red-700 rounded-lg p-2">
              ⚠ Essa nota já foi lançada antes. Só confirme se tiver certeza.
            </p>
          )}

          <label className="flex items-center gap-2 text-sm">
            Fator do preço de venda (custo ×)
            <input
              value={fator}
              onChange={(e) => mudarFator(e.target.value)}
              className="w-20 border border-estofado-200 rounded px-2 py-1"
              inputMode="decimal"
            />
            <span className="text-madeira-500">preços ajustados à mão não mudam.</span>
          </label>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-madeira-500 border-b border-estofado-100">
                  <th className="py-1 pr-2"></th>
                  <th className="pr-2">Produto da nota</th>
                  <th className="pr-2">Cadastro</th>
                  <th className="pr-2">Categoria</th>
                  <th className="pr-2 text-right">Qtd</th>
                  <th className="pr-2 text-right">Custo</th>
                  <th className="text-right">Preço venda</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.chave} className={`border-b border-estofado-50 align-top ${l.incluir ? "" : "opacity-40"}`}>
                    <td className="py-1 pr-2">
                      <input type="checkbox" checked={l.incluir} onChange={(e) => atualizar(l.chave, { incluir: e.target.checked })} />
                    </td>
                    <td className="pr-2">
                      <input
                        value={l.nome}
                        disabled={!!l.produtoId}
                        onChange={(e) => atualizar(l.chave, { nome: e.target.value })}
                        className="w-52 border border-estofado-200 rounded px-2 py-1 disabled:bg-estofado-50"
                      />
                      {l.acabamentos.length > 0 && <div className="text-xs text-madeira-400">{l.acabamentos.join(" · ")}</div>}
                    </td>
                    <td className="pr-2">
                      <select
                        value={l.produtoId}
                        onChange={(e) => escolherProduto(l.chave, e.target.value)}
                        className="w-48 border border-estofado-200 rounded px-1 py-1"
                      >
                        <option value="">➕ Cadastrar como novo</option>
                        {simples.map((p) => (
                          <option key={p.id} value={p.id}>{p.nome}</option>
                        ))}
                      </select>
                    </td>
                    <td className="pr-2">
                      <select
                        value={l.categoria}
                        disabled={!!l.produtoId}
                        onChange={(e) => atualizar(l.chave, { categoria: e.target.value })}
                        className="w-40 border border-estofado-200 rounded px-1 py-1 disabled:bg-estofado-50"
                      >
                        {Array.from(new Set([l.categoria, ...categorias])).map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </td>
                    <td className="pr-2 text-right">
                      <input
                        type="number"
                        min={0}
                        value={l.quantidade}
                        onChange={(e) => atualizar(l.chave, { quantidade: parseInt(e.target.value) || 0 })}
                        className="w-16 border border-estofado-200 rounded px-2 py-1 text-right"
                      />
                    </td>
                    <td className="pr-2 text-right whitespace-nowrap">{formatarMoeda(l.custo)}</td>
                    <td className="text-right">
                      <input
                        value={l.preco}
                        onChange={(e) => atualizar(l.chave, { preco: e.target.value, precoManual: true })}
                        className="w-24 border border-estofado-200 rounded px-2 py-1 text-right"
                        inputMode="decimal"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap gap-4 text-sm text-madeira-700">
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={atualizarCusto} onChange={(e) => setAtualizarCusto(e.target.checked)} />
              Atualizar o custo dos produtos já cadastrados
            </label>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={atualizarPreco} onChange={(e) => setAtualizarPreco(e.target.checked)} />
              Atualizar também o preço de venda deles
            </label>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-madeira-700">
              {totalUnidades} unidade(s) · custo total {formatarMoeda(totalCusto)}
            </span>
            <button
              onClick={confirmar}
              disabled={salvando || selecionadas.length === 0 || !depositoId}
              className="bg-madeira-900 text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              {salvando ? "Dando entrada…" : "Dar entrada no Depósito"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
