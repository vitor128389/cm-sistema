"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { formatarMoeda } from "@/lib/format";
import { carregarProdutosComEstoque, ajustarEstoqueLoja } from "@/lib/produtos";
import { registrarAuditoria } from "@/lib/auditoria";
import { lerPdfComoLinhas, interpretarLinhasNota, nomeVariante, type NotaLida } from "@/lib/lerNotaFiscal";
import type { ProdutoComVariantes } from "@/types";

interface Linha {
  chave: string;
  nome: string;
  acabamentos: string[];
  cores: { nome: string; qtd: number }[]; // uma variante (cor) por acabamento da nota
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
function somarCor(cores: { nome: string; qtd: number }[], nome: string, qtd: number) {
  const c = cores.find((x) => x.nome === nome);
  if (c) c.qtd += qtd;
  else cores.push({ nome, qtd });
}

// Tipo do móvel pelo começo do nome → nome da categoria (singular, como a Caruaru usa)
const TIPOS: [RegExp, string][] = [
  [/^ROUPEIRO INFANTIL/, "Roupeiro Infantil"],
  [/^ROUPEIRO/, "Roupeiro"],
  [/^COM?ODA/, "Cômoda"],
  [/^MESA DE CABECEIRA/, "Mesa de Cabeceira"],
  [/^RACK/, "Rack"],
  [/^PAINEL/, "Painel"],
  [/^ARMARIO/, "Armário"],
  [/^COZINHA/, "Cozinha"],
  [/^SALA/, "Sala de Jantar"],
  [/^SAPATEIRA/, "Sapateira"],
  [/^ESTANTE/, "Estante"],
  [/^BERCO/, "Berço"],
  [/^CAMA/, "Cama"],
  [/^APARADOR/, "Aparador"],
  [/^BALCAO/, "Balcão"],
  [/^MESA/, "Mesa"],
  [/^CADEIRA/, "Cadeira"],
];
function categoriaSugerida(nome: string): string {
  const n = norm(nome);
  for (const [re, cat] of TIPOS) if (re.test(n)) return cat;
  const primeira = n.split(" ")[0] || "Móveis Montados";
  return primeira.charAt(0) + primeira.slice(1).toLowerCase();
}
// compara categorias ignorando acento, maiúscula e plural simples
const chaveCat = (c: string) => norm(c).replace(/S$/, "");
const nomeLimpo = (s: string) => s.replace(/\(\s*20\d\d\s*\)/g, "").replace(/\s+/g, " ").trim();

function NovaEntrada() {
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
          somarCor(existente.cores, nomeVariante(it.acabamento), it.quantidade);
        } else {
          const achado = simples.find((p) => norm(p.nome) === k);
          mapa.set(k, {
            chave: k,
            nome: nomeLimpo(it.descricao),
            acabamentos: it.acabamento ? [it.acabamento] : [],
            cores: [{ nome: nomeVariante(it.acabamento), qtd: it.quantidade }],
            quantidade: it.quantidade,
            custo: it.valorUnitario,
            preco: "",
            precoManual: false,
            categoria: achado?.categoria || categoriaSugerida(it.descricao),
            produtoId: achado?.id ?? "",
            incluir: true,
          });
        }
      }
      const lista = Array.from(mapa.values()).map((l) => ({
        ...l,
        categoria: categorias.find((c) => chaveCat(c) === chaveCat(l.categoria)) || l.categoria,
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
  const usaCores = (l: Linha) => !l.produtoId && l.cores.length > 0;
  function mudarCor(chave: string, nomeCor: string, qtd: number) {
    setLinhas((ls) =>
      ls.map((l) => {
        if (l.chave !== chave) return l;
        const cores = l.cores.map((c) => (c.nome === nomeCor ? { ...c, qtd } : c));
        return { ...l, cores, quantidade: cores.reduce((t, c) => t + c.qtd, 0) };
      })
    );
  }
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
      const faltando = Array.from(new Set(selecionadas.filter((l) => !l.produtoId).map((l) => l.categoria))).filter(
        (c) => !categorias.some((e) => chaveCat(e) === chaveCat(c))
      );
      for (const c of faltando) {
        const { error: erroCat } = await supabase.from("categorias").insert({ nome: c });
        if (erroCat) throw new Error(`Não consegui criar a categoria "${c}": ${erroCat.message}`);
      }
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
              tipo_precificacao: l.cores.length > 0 ? "tecido" : "simples",
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
        if (novo && l.cores.length > 0) {
          // uma variante (cor) por acabamento, com o estoque de cada uma no Depósito
          for (const cor of l.cores.filter((c) => c.qtd > 0)) {
            const { data: variante, error: erroVar } = await supabase
              .from("produto_variantes")
              .upsert(
                { produto_id: produtoId, nome_variante: cor.nome, preco_avista: preco, custo: l.custo },
                { onConflict: "produto_id,nome_variante" }
              )
              .select("id")
              .single();
            if (erroVar || !variante) throw new Error(`Não consegui criar a cor "${cor.nome}" de "${l.nome}": ${erroVar?.message}`);
            const { error: erroEstVar } = await ajustarEstoqueLoja(supabase, depositoId, produtoId, variante.id, cor.qtd);
            if (erroEstVar) throw new Error(`Erro ao somar estoque de "${l.nome}" (${cor.nome}): ${erroEstVar.message}`);
          }
        } else {
          const { error: erroEst } = await ajustarEstoqueLoja(supabase, depositoId, produtoId, null, l.quantidade);
          if (erroEst) throw new Error(`Erro ao somar estoque de "${l.nome}": ${erroEst.message}`);
        }
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
          Envie o PDF da nota (DANFE). Os produtos entram no estoque do <b>Depósito</b>. A categoria é escolhida sozinha pelo tipo do móvel (Roupeiro, Rack, Painel…) e criada se ainda não existir. Custo = valor unitário da nota
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
                      {usaCores(l) ? (
                        <div className="mt-1 space-y-1">
                          {l.cores.map((c) => (
                            <div key={c.nome} className="flex items-center gap-1 text-xs text-madeira-600">
                              <input
                                type="number"
                                min={0}
                                value={c.qtd}
                                onChange={(e) => mudarCor(l.chave, c.nome, parseInt(e.target.value) || 0)}
                                className="w-12 border border-estofado-200 rounded px-1 py-0.5 text-right"
                              />
                              <span>{c.nome}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        l.acabamentos.length > 0 && <div className="text-xs text-madeira-400">{l.acabamentos.join(" · ")}</div>
                      )}
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
                          <option key={c} value={c}>
                            {c}{categorias.some((e) => chaveCat(e) === chaveCat(c)) ? "" : " (nova)"}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="pr-2 text-right">
                      <input
                        type="number"
                        min={0}
                        value={l.quantidade}
                        disabled={usaCores(l)}
                        onChange={(e) => atualizar(l.chave, { quantidade: parseInt(e.target.value) || 0 })}
                        className="w-16 border border-estofado-200 rounded px-2 py-1 text-right disabled:bg-estofado-50"
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

interface NotaSalva {
  id: string;
  numero: string | null;
  fornecedor: string | null;
  total: number;
  criado_em: string;
  usuario_id: string | null;
  itens: { nome: string; quantidade: number; custo: number; preco: number; novo: boolean }[];
}

function HistoricoNotas() {
  const [notas, setNotas] = useState<NotaSalva[]>([]);
  const [nomes, setNomes] = useState<Record<string, string>>({});
  const [carregando, setCarregando] = useState(true);
  const [aberta, setAberta] = useState<string | null>(null);
  const [busca, setBusca] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("notas_entrada")
        .select("id, numero, fornecedor, total, criado_em, usuario_id, itens")
        .order("criado_em", { ascending: false });
      const lista = (data || []) as unknown as NotaSalva[];
      setNotas(lista);
      const ids = Array.from(new Set(lista.map((n) => n.usuario_id).filter(Boolean))) as string[];
      if (ids.length > 0) {
        const { data: us } = await supabase.from("usuarios").select("id, nome").in("id", ids);
        setNomes(Object.fromEntries((us || []).map((u) => [u.id, u.nome])));
      }
      setCarregando(false);
    })();
  }, []);

  const filtradas = notas.filter((n) => {
    const b = norm(busca);
    if (!b) return true;
    return (
      norm(n.numero || "").includes(b) ||
      norm(n.fornecedor || "").includes(b) ||
      n.itens.some((i) => norm(i.nome).includes(b))
    );
  });

  if (carregando) return <p className="text-sm text-madeira-500">Carregando…</p>;

  return (
    <div className="space-y-3">
      <input
        className="input-base max-w-md"
        placeholder="Buscar por número da nota, fornecedor ou produto…"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
      />
      {filtradas.length === 0 ? (
        <div className="card p-6 text-center text-sm text-madeira-500">Nenhuma nota lançada ainda.</div>
      ) : (
        filtradas.map((n) => {
          const unidades = n.itens.reduce((t, i) => t + i.quantidade, 0);
          const aberto = aberta === n.id;
          return (
            <div key={n.id} className="card p-4">
              <button className="w-full text-left" onClick={() => setAberta(aberto ? null : n.id)}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-display text-lg text-madeira-900">
                      NF {n.numero ?? "—"} — {n.fornecedor ?? "Fornecedor"}
                    </p>
                    <p className="text-xs text-madeira-500">
                      {new Date(n.criado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                      {n.usuario_id && nomes[n.usuario_id] ? ` · por ${nomes[n.usuario_id]}` : ""}
                      {" · "}
                      {n.itens.length} produto(s) · {unidades} un.
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-display text-lg">{formatarMoeda(n.total)}</p>
                    <p className="text-xs text-madeira-500">{aberto ? "▲ fechar" : "▼ ver produtos"}</p>
                  </div>
                </div>
              </button>
              {aberto && (
                <div className="overflow-x-auto mt-3">
                  <table className="w-full text-sm min-w-[480px]">
                    <thead>
                      <tr className="text-left text-madeira-500 border-b border-estofado-100">
                        <th className="py-1 pr-2">Produto</th>
                        <th className="pr-2 text-right">Qtd</th>
                        <th className="pr-2 text-right">Custo</th>
                        <th className="text-right">Preço venda</th>
                      </tr>
                    </thead>
                    <tbody>
                      {n.itens.map((i, idx) => (
                        <tr key={idx} className="border-b border-estofado-50">
                          <td className="py-1 pr-2">
                            {i.nome}
                            {i.novo && <span className="ml-2 text-xs text-green-700">novo</span>}
                          </td>
                          <td className="pr-2 text-right">{i.quantidade}</td>
                          <td className="pr-2 text-right whitespace-nowrap">{formatarMoeda(i.custo)}</td>
                          <td className="text-right whitespace-nowrap">{formatarMoeda(i.preco)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

export default function EntradaNota() {
  const [aba, setAba] = useState<"nova" | "historico">("nova");
  return (
    <div>
      <div className="flex gap-2 mb-4">
        {(
          [
            ["nova", "Nova entrada"],
            ["historico", "Notas lançadas"],
          ] as const
        ).map(([v, label]) => (
          <button key={v} className={aba === v ? "btn-primario" : "btn-secundario"} onClick={() => setAba(v)}>
            {label}
          </button>
        ))}
      </div>
      {aba === "nova" ? <NovaEntrada /> : <HistoricoNotas />}
    </div>
  );
}
