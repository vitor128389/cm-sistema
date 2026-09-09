"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { formatarMoeda } from "@/lib/format";
import { useLoja } from "@/contexts/LojaContext";
import { carregarProdutosComEstoque, salvarEstoqueLoja, ajustarEstoqueLoja } from "@/lib/produtos";
import { consultarCpf } from "@/lib/consultaCpf";
import type { Caixa, ProdutoComVariantes, TecidoCor, Usuario, Permissao, LojaCompleta, TrocaGrupo, TrocaItemDevolvido, TrocaItemNovo } from "@/types";

type Aba = "lojas" | "caixas" | "estoque" | "usuarios" | "permissoes" | "tecidos" | "relatorio" | "cancelar";

const TELAS = [
  { chave: "painel", label: "Painel" },
  { chave: "vender", label: "Vender" },
  { chave: "produtos", label: "Produtos" },
  { chave: "clientes", label: "Clientes" },
  { chave: "encomendas", label: "Encomendas" },
  { chave: "notas", label: "Notas" },
  { chave: "trocas", label: "Trocas" },
  { chave: "caixa", label: "Caixa" },
  { chave: "movimento", label: "Movimento" },
  { chave: "administracao", label: "Administração" },
];
const FUNCOES = ["vendedor", "producao", "caixa", "gerente", "admin"] as const;

const FORM_VAZIO = {
  nome: "",
  categoria: "",
  categoriaNova: "",
  custo: "0",
  estoqueSimples: "0",
  precoSimples: "",
  precoSuede: "",
  precoLinho: "",
  precoVeludo: "",
  custoSuede: "0",
  custoLinho: "0",
  custoVeludo: "0",
  estoqueSuede: "0",
  estoqueLinho: "0",
  estoqueVeludo: "0",
  // Espessura genérica (camas usam 5/7/14cm, colchões usam 10/20cm, etc.) —
  // uma linha por espessura que o produto realmente tiver, em vez de campos
  // fixos só pra 5/7/14.
  espessuraLinhas: [] as { label: string; preco: string; custo: string; estoque: string }[],
};

export default function AdministracaoPage() {
  const [aba, setAba] = useState<Aba>("lojas");

  return (
    <div className="p-8">
      <h1 className="font-display text-3xl text-madeira-900">Administração</h1>
      <p className="text-madeira-600 mt-1 mb-6">
        Cadastro de lojas, caixas, estoque, usuários, permissões e relatórios.
      </p>

      <div className="flex gap-5 border-b border-estofado-100 pb-3 mb-6 text-sm font-medium overflow-x-auto">
        {(
          [
            ["lojas", "Lojas"],
            ["caixas", "Caixas"],
            ["estoque", "Estoque"],
            ["usuarios", "Usuários"],
            ["permissoes", "Permissões"],
            ["tecidos", "Tecidos e cores"],
            ["relatorio", "Relatório"],
            ["cancelar", "Cancelar nota"],
          ] as [Aba, string][]
        ).map(([valor, label]) => (
          <button
            key={valor}
            className={`whitespace-nowrap ${aba === valor ? "text-madeira-900" : "text-madeira-400"}`}
            onClick={() => setAba(valor)}
          >
            {label}
          </button>
        ))}
      </div>

      {aba === "lojas" && <AbaLojas />}
      {aba === "caixas" && <AbaCaixas />}
      {aba === "estoque" && <AbaEstoque />}
      {aba === "usuarios" && <AbaUsuarios />}
      {aba === "permissoes" && <AbaPermissoes />}
      {aba === "tecidos" && <AbaTecidos />}
      {aba === "relatorio" && <AbaRelatorio />}
      {aba === "cancelar" && (
        <>
          <AbaCancelarNota />
          <AbaCancelarTroca />
        </>
      )}
    </div>
  );
}

/* ==================== LOJAS ==================== */
function AbaLojas() {
  const [lojas, setLojas] = useState<LojaCompleta[]>([]);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [lojaExcluindoForcado, setLojaExcluindoForcado] = useState<LojaCompleta | null>(null);
  const [confirmacaoExcluir, setConfirmacaoExcluir] = useState("");
  const [excluindoForcado, setExcluindoForcado] = useState(false);
  const [form, setForm] = useState({
    nome: "",
    cnpj: "",
    cep: "",
    rua: "",
    numero: "",
    complemento: "",
    bairro: "",
    cidade: "",
    estado: "",
    telefone: "",
  });

  async function carregar() {
    const { data } = await supabase.from("lojas").select("*").order("nome");
    if (data) setLojas(data as LojaCompleta[]);
  }

  useEffect(() => {
    carregar();
  }, []);

  function abrirNovo() {
    setForm({ nome: "", cnpj: "", cep: "", rua: "", numero: "", complemento: "", bairro: "", cidade: "", estado: "", telefone: "" });
    setEditandoId(null);
    setMostrarForm(true);
  }

  function abrirEdicao(l: LojaCompleta) {
    setForm({
      nome: l.nome,
      cnpj: l.cnpj || "",
      cep: l.cep || "",
      rua: l.rua || "",
      numero: l.numero || "",
      complemento: l.complemento || "",
      bairro: l.bairro || "",
      cidade: l.cidade || "",
      estado: l.estado || "",
      telefone: l.telefone || "",
    });
    setEditandoId(l.id);
    setMostrarForm(true);
  }

  async function salvar() {
    if (!form.nome.trim()) {
      alert("Preencha o nome da loja.");
      return;
    }
    const dados = {
      nome: form.nome.trim(),
      cnpj: form.cnpj || null,
      cep: form.cep || null,
      rua: form.rua || null,
      numero: form.numero || null,
      complemento: form.complemento || null,
      bairro: form.bairro || null,
      cidade: form.cidade || null,
      estado: form.estado || null,
      telefone: form.telefone || null,
    };

    if (editandoId) {
      const { error } = await supabase.from("lojas").update(dados).eq("id", editandoId);
      if (error) {
        alert("Erro: " + error.message);
        return;
      }
    } else {
      const { error } = await supabase.from("lojas").insert(dados);
      if (error) {
        alert("Erro: " + error.message);
        return;
      }
    }
    setMostrarForm(false);
    setEditandoId(null);
    carregar();
  }

  async function alternarAtivo(id: string, ativo: boolean) {
    await supabase.from("lojas").update({ ativo: !ativo }).eq("id", id);
    carregar();
  }

  async function confirmarExclusaoForcada() {
    if (!lojaExcluindoForcado || confirmacaoExcluir !== "EXCLUIR") return;
    setExcluindoForcado(true);
    const resp = await fetch("/api/admin/excluir-loja-definitivo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lojaId: lojaExcluindoForcado.id, confirmacao: confirmacaoExcluir }),
    });
    const resultado = await resp.json();
    setExcluindoForcado(false);
    if (!resp.ok) {
      alert("Erro: " + resultado.error);
      return;
    }
    setLojaExcluindoForcado(null);
    setConfirmacaoExcluir("");
    carregar();
    alert("Loja excluída definitivamente, junto com tudo que estava vinculado a ela.");
  }

  async function excluirLoja(id: string, nome: string) {
    if (!confirm(`Excluir a loja "${nome}"? Se ela tiver clientes, vendas ou caixas vinculados, a exclusão não é permitida (pra não perder esse histórico) — nesse caso ela só é desativada em vez de excluída.`))
      return;
    const { error } = await supabase.from("lojas").delete().eq("id", id);
    if (error) {
      if (error.code === "23503") {
        const { error: erroInativar } = await supabase.from("lojas").update({ ativo: false }).eq("id", id);
        if (erroInativar) {
          alert("Erro ao desativar a loja: " + erroInativar.message);
          return;
        }
        alert(
          `"${nome}" tem clientes, vendas ou caixas vinculados, então não pode ser excluída — foi desativada em vez disso, pra preservar o histórico.`
        );
        carregar();
        return;
      }
      alert("Erro ao excluir: " + error.message);
      return;
    }
    carregar();
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <p className="text-sm font-semibold text-madeira-700">Lojas cadastradas</p>
        <button className="btn-primario" onClick={mostrarForm ? () => setMostrarForm(false) : abrirNovo}>
          {mostrarForm ? "Cancelar" : "+ Cadastrar loja"}
        </button>
      </div>
      <p className="text-xs text-madeira-500 mb-4">
        Produtos e preços são um catálogo único, compartilhado entre todas as lojas. O que cada
        loja tem próprio é o estoque, os clientes, o caixa e as vendas. Use o seletor "Loja ativa"
        no menu lateral pra trocar em qual loja você está trabalhando.
      </p>

      {mostrarForm && (
        <div className="card p-5 mb-6">
          <p className="font-display text-lg mb-4">{editandoId ? "Editar loja" : "Nova loja"}</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
            <label className="block">
              <span className="text-xs text-madeira-600 mb-1 block">Nome da loja</span>
              <input className="input-base" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex: Loja Centro" />
            </label>
            <label className="block">
              <span className="text-xs text-madeira-600 mb-1 block">Telefone</span>
              <input className="input-base" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} placeholder="(79) 99999-9999" />
            </label>
            <label className="block">
              <span className="text-xs text-madeira-600 mb-1 block">CNPJ</span>
              <input className="input-base" value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} placeholder="00.000.000/0000-00" />
            </label>
            <label className="block">
              <span className="text-xs text-madeira-600 mb-1 block">CEP</span>
              <input className="input-base" value={form.cep} onChange={(e) => setForm({ ...form, cep: e.target.value })} />
            </label>
            <label className="block">
              <span className="text-xs text-madeira-600 mb-1 block">Rua / Logradouro</span>
              <input className="input-base" value={form.rua} onChange={(e) => setForm({ ...form, rua: e.target.value })} />
            </label>
            <label className="block">
              <span className="text-xs text-madeira-600 mb-1 block">Número</span>
              <input className="input-base" value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} />
            </label>
            <label className="block">
              <span className="text-xs text-madeira-600 mb-1 block">Complemento</span>
              <input className="input-base" value={form.complemento} onChange={(e) => setForm({ ...form, complemento: e.target.value })} />
            </label>
            <label className="block">
              <span className="text-xs text-madeira-600 mb-1 block">Bairro</span>
              <input className="input-base" value={form.bairro} onChange={(e) => setForm({ ...form, bairro: e.target.value })} />
            </label>
            <label className="block">
              <span className="text-xs text-madeira-600 mb-1 block">Cidade</span>
              <input className="input-base" value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} />
            </label>
            <label className="block">
              <span className="text-xs text-madeira-600 mb-1 block">Estado</span>
              <input className="input-base" value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })} placeholder="SE" maxLength={2} />
            </label>
          </div>
          <button className="btn-primario" onClick={salvar}>
            {editandoId ? "Salvar edição" : "Cadastrar loja"}
          </button>
        </div>
      )}

      <div className="card overflow-hidden mb-6">
        <table className="w-full text-sm">
          <thead className="bg-madeira-50 text-left">
            <tr>
              <th className="px-4 py-2">Nome</th>
              <th className="px-4 py-2">Endereço</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {lojas.map((l) => (
              <tr key={l.id} className="border-t border-estofado-100">
                <td className="px-4 py-2">{l.nome}</td>
                <td className="px-4 py-2 text-xs text-madeira-500">
                  {l.rua ? `${l.rua}${l.numero ? ", " + l.numero : ""}${l.cidade ? " — " + l.cidade : ""}` : "Sem endereço cadastrado"}
                </td>
                <td className="px-4 py-2">
                  <span className={`text-xs px-2 py-0.5 rounded ${l.ativo ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                    {l.ativo ? "Ativa" : "Inativa"}
                  </span>
                </td>
                <td className="px-4 py-2 whitespace-nowrap">
                  <button className="btn-secundario text-xs px-2 py-1 mr-2" onClick={() => abrirEdicao(l)}>
                    Editar
                  </button>
                  <button className="btn-secundario text-xs px-2 py-1 mr-2" onClick={() => alternarAtivo(l.id, l.ativo)}>
                    {l.ativo ? "Desativar" : "Reativar"}
                  </button>
                  <button className="text-xs text-red-700 mr-2" onClick={() => excluirLoja(l.id, l.nome)}>
                    excluir
                  </button>
                  <button
                    className="text-xs text-red-800 font-semibold underline"
                    onClick={() => {
                      setLojaExcluindoForcado(l);
                      setConfirmacaoExcluir("");
                    }}
                  >
                    excluir definitivamente
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {lojaExcluindoForcado && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6">
            <p className="font-display text-lg mb-2 text-red-800">Excluir definitivamente</p>
            <p className="text-sm text-madeira-600 mb-4">
              Isso apaga <strong>pra sempre</strong> a loja <strong>{lojaExcluindoForcado.nome}</strong> e tudo que
              está vinculado a ela: vendas, clientes, caixas, estoque, trocas e sangrias. Não tem como desfazer.
            </p>
            <p className="text-sm text-madeira-600 mb-2">
              Pra confirmar, digite a palavra <strong>EXCLUIR</strong> abaixo:
            </p>
            <input
              className="input-base mb-4"
              value={confirmacaoExcluir}
              onChange={(e) => setConfirmacaoExcluir(e.target.value)}
              placeholder="EXCLUIR"
              autoFocus
            />
            <div className="flex gap-3">
              <button
                className="btn-secundario flex-1"
                onClick={() => {
                  setLojaExcluindoForcado(null);
                  setConfirmacaoExcluir("");
                }}
                disabled={excluindoForcado}
              >
                Cancelar
              </button>
              <button
                className="flex-1 bg-red-700 hover:bg-red-800 text-white font-semibold rounded px-4 py-2 disabled:opacity-40"
                disabled={confirmacaoExcluir !== "EXCLUIR" || excluindoForcado}
                onClick={confirmarExclusaoForcada}
              >
                {excluindoForcado ? "Excluindo..." : "Excluir para sempre"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ==================== CAIXAS ==================== */
function AbaCaixas() {
  const { lojaAtual } = useLoja();
  const [caixas, setCaixas] = useState<Caixa[]>([]);
  const [nome, setNome] = useState("");

  async function carregar() {
    let query = supabase.from("caixas").select("*").order("nome");
    if (lojaAtual) query = query.eq("loja_id", lojaAtual);
    const { data } = await query;
    if (data) setCaixas(data as Caixa[]);
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lojaAtual]);

  async function adicionar() {
    if (!nome.trim()) return;
    if (!lojaAtual) {
      alert("Selecione uma loja ativa no menu lateral antes de cadastrar um caixa.");
      return;
    }
    const { error } = await supabase.from("caixas").insert({ nome: nome.trim(), loja_id: lojaAtual });
    if (!error) {
      setNome("");
      carregar();
    } else {
      alert("Erro: " + error.message);
    }
  }

  async function remover(id: string) {
    if (!confirm("Remover esse caixa?")) return;
    await supabase.from("caixas").delete().eq("id", id);
    carregar();
  }

  return (
    <div>
      <p className="text-sm font-semibold text-madeira-700 mb-2">Caixas cadastrados</p>
      <div className="card overflow-hidden mb-6">
        <table className="w-full text-sm">
          <tbody>
            {caixas.map((c) => (
              <tr key={c.id} className="border-b border-estofado-100 last:border-0">
                <td className="px-4 py-2">{c.nome}</td>
                <td className="px-4 py-2 text-right">
                  {caixas.length > 1 && (
                    <button className="text-xs text-red-700" onClick={() => remover(c.id)}>
                      remover
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card p-5 max-w-sm">
        <label className="block mb-3">
          <span className="text-xs text-madeira-600 mb-1 block">Nome do novo caixa</span>
          <input className="input-base" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Caixa 002" />
        </label>
        <button className="btn-primario w-full" onClick={adicionar}>
          + Cadastrar caixa
        </button>
      </div>
    </div>
  );
}

/* ==================== ESTOQUE ==================== */
function AbaEstoque() {
  const { lojaAtual } = useLoja();
  const [produtos, setProdutos] = useState<ProdutoComVariantes[]>([]);
  const [categoriaFiltro, setCategoriaFiltro] = useState<string | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState(FORM_VAZIO);
  const [estoquesEdicao, setEstoquesEdicao] = useState<Record<string, string>>({});
  const [categoriasConfig, setCategoriasConfig] = useState<Record<string, "tecido" | "espessura" | "simples">>({});
  const [tipoCategoriaNova, setTipoCategoriaNova] = useState<"tecido" | "espessura" | "simples">("simples");

  async function carregar() {
    const data = await carregarProdutosComEstoque(supabase, lojaAtual);
    setProdutos(data);
  }

  async function carregarCategoriasConfig() {
    const { data } = await supabase.from("categorias_config").select("nome, tipo");
    const mapa: Record<string, "tecido" | "espessura" | "simples"> = {};
    (data || []).forEach((c) => {
      mapa[c.nome.trim().toLowerCase()] = c.tipo as "tecido" | "espessura" | "simples";
    });
    setCategoriasConfig(mapa);
  }

  useEffect(() => {
    carregar();
    carregarCategoriasConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lojaAtual]);

  const categorias = Array.from(new Set(produtos.map((p) => p.categoria)));

  // A partir de agora, é a categoria (configurada no banco, escolhida na hora
  // de cadastrar) que decide se o produto usa tecido, espessura ou nenhum
  // dos dois — não uma lista fixa no código nem o que sobrou preenchido nos
  // campos do formulário. Isso evita categorias "herdando" tecido por engano.
  function tipoDaCategoria(nomeCategoria: string): "tecido" | "espessura" | "simples" {
    const chave = nomeCategoria.trim().toLowerCase();
    return categoriasConfig[chave] || "simples";
  }

  const produtosFiltrados = categoriaFiltro
    ? produtos.filter((p) => p.categoria === categoriaFiltro)
    : produtos;

  async function salvarEstoqueSimples(produtoId: string, valor: number) {
    if (!lojaAtual) return;
    const { error } = await salvarEstoqueLoja(supabase, lojaAtual, produtoId, null, valor);
    if (error) alert("Erro ao salvar o estoque: " + error.message);
    carregar();
  }

  async function salvarEstoqueVariante(produtoId: string, varianteId: string, valor: number) {
    if (!lojaAtual) return;
    const { error } = await salvarEstoqueLoja(supabase, lojaAtual, produtoId, varianteId, valor);
    if (error) alert("Erro ao salvar o estoque: " + error.message);
    carregar();
  }

  // Pros sofás "2 e 3 lugares": um conjunto completo é sempre uma peça de 2
  // e uma de 3 juntas, então salvar o "conjunto" atualiza as duas variantes
  // (2 Lugares e 3 Lugares daquele tecido) com a mesma quantidade.
  async function salvarEstoqueConjunto(
    produtoId: string,
    varianteId2L: string,
    varianteId3L: string,
    valor: number
  ) {
    if (!lojaAtual) return;
    const [r1, r2] = await Promise.all([
      salvarEstoqueLoja(supabase, lojaAtual, produtoId, varianteId2L, valor),
      salvarEstoqueLoja(supabase, lojaAtual, produtoId, varianteId3L, valor),
    ]);
    if (r1.error || r2.error) alert("Erro ao salvar o estoque: " + (r1.error || r2.error)?.message);
    carregar();
  }

  async function excluirProduto(id: string, nome: string) {
    if (!confirm(`Excluir "${nome}" do catálogo? Isso remove o produto de TODAS as lojas — essa ação não pode ser desfeita.`)) return;
    const { error } = await supabase.from("produtos").delete().eq("id", id);
    if (error) alert("Erro: " + error.message);
    carregar();
  }

  function abrirEdicao(p: ProdutoComVariantes) {
    setEditandoId(p.id);
    const tipoReal = tipoDaCategoria(p.categoria);
    const ehCamas = tipoReal === "espessura";
    const ehTecido = tipoReal === "tecido";
    const precoBaseFallback = p.preco_venda > 0 ? String(Math.round((p.preco_venda / 1.1) * 100) / 100) : "";
    const novoForm = { ...FORM_VAZIO, nome: p.nome, categoria: p.categoria, custo: String(p.custo || 0) };
    if (ehCamas) {
      // Pega as espessuras reais do produto (5/7/14cm nas camas, 10/20cm
      // nos colchões, etc.) — nunca mais fixo em só um padrão.
      if (p.produto_variantes.length > 0) {
        novoForm.espessuraLinhas = p.produto_variantes.map((v) => ({
          label: v.nome_variante,
          preco: String(v.preco_avista),
          custo: String(v.custo || 0),
          estoque: String(v.estoque),
        }));
      } else {
        // produto novo desse tipo, sem variantes ainda — começa com 3
        // linhas em branco pra preencher (o nome de cada uma é editável)
        novoForm.espessuraLinhas = [
          { label: "5cm", preco: precoBaseFallback, custo: String(p.custo || 0), estoque: "0" },
          { label: "7cm", preco: precoBaseFallback, custo: String(p.custo || 0), estoque: "0" },
          { label: "14cm", preco: precoBaseFallback, custo: String(p.custo || 0), estoque: "0" },
        ];
      }
    } else if (ehTecido) {
      novoForm.precoSuede = precoBaseFallback;
      novoForm.precoLinho = precoBaseFallback;
      novoForm.precoVeludo = precoBaseFallback;
      novoForm.custoSuede = String(p.custo || 0);
      novoForm.custoLinho = String(p.custo || 0);
      novoForm.custoVeludo = String(p.custo || 0);
      p.produto_variantes.forEach((v) => {
        if (v.nome_variante === "Suede") {
          novoForm.precoSuede = String(v.preco_avista);
          novoForm.estoqueSuede = String(v.estoque);
          novoForm.custoSuede = String(v.custo || 0);
        }
        if (v.nome_variante === "Linho") {
          novoForm.precoLinho = String(v.preco_avista);
          novoForm.estoqueLinho = String(v.estoque);
          novoForm.custoLinho = String(v.custo || 0);
        }
        if (v.nome_variante === "Veludo") {
          novoForm.precoVeludo = String(v.preco_avista);
          novoForm.estoqueVeludo = String(v.estoque);
          novoForm.custoVeludo = String(v.custo || 0);
        }
      });
      novoForm.estoqueSimples = String(p.quantidade_estoque || 0);
    } else {
      novoForm.estoqueSimples = String(p.quantidade_estoque || 0);
      novoForm.precoSimples = p.preco_venda > 0 ? String(p.preco_venda) : "";
    }
    setForm(novoForm);
    setMostrarForm(true);
    // sobe até o formulário automaticamente, sem precisar rolar na mão
    setTimeout(() => {
      document.getElementById("form-editar-produto")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  async function salvarProduto() {
    const categoriaFinal = form.categoria === "__nova__" ? form.categoriaNova.trim() : form.categoria.trim();
    if (!form.nome.trim() || !categoriaFinal) {
      alert("Preencha nome e categoria.");
      return;
    }
    if (!lojaAtual) {
      alert("Selecione uma loja ativa no menu lateral (é nela que o estoque inicial será lançado).");
      return;
    }

    // Se é uma categoria nova, grava o tipo escolhido (tecido/espessura/nenhum)
    // pra ela ser lembrada da próxima vez — sem isso o produto usaria "simples"
    // por padrão.
    if (form.categoria === "__nova__") {
      const { error: erroCategoria } = await supabase
        .from("categorias_config")
        .upsert({ nome: categoriaFinal, tipo: tipoCategoriaNova }, { onConflict: "nome" });
      if (erroCategoria) {
        alert("Erro ao salvar o tipo da categoria: " + erroCategoria.message);
        return;
      }
      setCategoriasConfig((atual) => ({
        ...atual,
        [categoriaFinal.trim().toLowerCase()]: tipoCategoriaNova,
      }));
    }

    const tipoReal =
      form.categoria === "__nova__" ? tipoCategoriaNova : tipoDaCategoria(categoriaFinal);
    const ehCamas = tipoReal === "espessura";
    const custoNum = parseFloat(form.custo) || 0;

    if (ehCamas) {
      const linhas = form.espessuraLinhas.filter((l) => l.label.trim() && parseFloat(l.preco) > 0);
      if (linhas.length === 0) {
        alert("Preencha o nome e o preço de pelo menos uma espessura.");
        return;
      }
      const precoBase = parseFloat(linhas[0].preco);

      let produtoId = editandoId;
      if (produtoId) {
        const { error: erroUpdate } = await supabase
          .from("produtos")
          .update({ nome: form.nome, categoria: categoriaFinal, custo: custoNum, preco_venda: precoBase, tipo_precificacao: "espessura" })
          .eq("id", produtoId);
        if (erroUpdate) {
          alert("Erro ao salvar o produto: " + erroUpdate.message);
          return;
        }
      } else {
        const { data: novo, error } = await supabase
          .from("produtos")
          .insert({
            nome: form.nome,
            categoria: categoriaFinal,
            preco_venda: precoBase,
            custo: custoNum,
            tipo_estoque: "pronta_entrega",
            tipo_precificacao: "espessura",
          })
          .select("id")
          .single();
        if (error) {
          alert("Erro: " + error.message);
          return;
        }
        produtoId = novo.id;
      }

      for (const linha of linhas) {
        const { data: variante, error: erroVariante } = await supabase
          .from("produto_variantes")
          .upsert(
            {
              produto_id: produtoId,
              nome_variante: linha.label.trim(),
              preco_avista: parseFloat(linha.preco) || 0,
              custo: parseFloat(linha.custo) || 0,
            },
            { onConflict: "produto_id,nome_variante" }
          )
          .select("id")
          .single();
        if (erroVariante) {
          alert(`Erro ao salvar a variante ${linha.label}: ` + erroVariante.message);
          return;
        }
        if (variante) {
          const { error: erroEstoque } = await salvarEstoqueLoja(
            supabase,
            lojaAtual,
            produtoId as string,
            variante.id,
            parseInt(linha.estoque) || 0
          );
          if (erroEstoque) {
            alert(`Erro ao salvar o estoque de ${linha.label}: ` + erroEstoque.message);
            return;
          }
        }
      }
    } else {
      const precos: Record<string, number> = {};
      if (parseFloat(form.precoSuede) > 0) precos["Suede"] = parseFloat(form.precoSuede);
      if (parseFloat(form.precoLinho) > 0) precos["Linho"] = parseFloat(form.precoLinho);
      if (parseFloat(form.precoVeludo) > 0) precos["Veludo"] = parseFloat(form.precoVeludo);

      const temTecido = tipoReal === "tecido" && Object.keys(precos).length > 0;
      const precoSimplesNum = parseFloat(form.precoSimples) || 0;
      const precoVendaBase = temTecido ? Object.values(precos)[0] : precoSimplesNum;

      let produtoId = editandoId;
      if (produtoId) {
        const { error: erroUpdate } = await supabase
          .from("produtos")
          .update({
            nome: form.nome,
            categoria: categoriaFinal,
            custo: custoNum,
            preco_venda: precoVendaBase,
            tipo_precificacao: temTecido ? "tecido" : "simples",
          })
          .eq("id", produtoId);
        if (erroUpdate) {
          alert("Erro ao salvar o produto: " + erroUpdate.message);
          return;
        }
      } else {
        const { data: novo, error } = await supabase
          .from("produtos")
          .insert({
            nome: form.nome,
            categoria: categoriaFinal,
            preco_venda: precoVendaBase,
            custo: custoNum,
            tipo_estoque: "pronta_entrega",
            tipo_precificacao: temTecido ? "tecido" : "simples",
          })
          .select("id")
          .single();
        if (error) {
          alert("Erro: " + error.message);
          return;
        }
        produtoId = novo.id;
      }

      if (temTecido) {
        const estoquesTecido: Record<string, string> = {
          Suede: form.estoqueSuede,
          Linho: form.estoqueLinho,
          Veludo: form.estoqueVeludo,
        };
        const custosTecido: Record<string, string> = {
          Suede: form.custoSuede,
          Linho: form.custoLinho,
          Veludo: form.custoVeludo,
        };
        for (const [nomeVar, valor] of Object.entries(precos)) {
          const { data: variante, error: erroVariante } = await supabase
            .from("produto_variantes")
            .upsert(
              {
                produto_id: produtoId,
                nome_variante: nomeVar,
                preco_avista: valor,
                custo: parseFloat(custosTecido[nomeVar]) || 0,
              },
              { onConflict: "produto_id,nome_variante" }
            )
            .select("id")
            .single();
          if (erroVariante) {
            alert(`Erro ao salvar a variante ${nomeVar}: ` + erroVariante.message);
            return;
          }
          if (variante) {
            const { error: erroEstoque } = await salvarEstoqueLoja(
              supabase,
              lojaAtual,
              produtoId as string,
              variante.id,
              parseInt(estoquesTecido[nomeVar]) || 0
            );
            if (erroEstoque) {
              alert(`Erro ao salvar o estoque de ${nomeVar}: ` + erroEstoque.message);
              return;
            }
          }
        }
      } else {
        const { error: erroEstoque } = await salvarEstoqueLoja(
          supabase,
          lojaAtual,
          produtoId as string,
          null,
          parseInt(form.estoqueSimples) || 0
        );
        if (erroEstoque) {
          alert("Erro ao salvar o estoque: " + erroEstoque.message);
          return;
        }
      }
    }

    const eraEdicao = !!editandoId;
    setForm(FORM_VAZIO);
    setMostrarForm(false);
    setEditandoId(null);
    await carregar();
    alert(eraEdicao ? "Produto atualizado com sucesso!" : "Produto cadastrado com sucesso!");
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div>
          <p className="text-sm font-semibold text-madeira-700">Alterar estoque dos produtos</p>
          <p className="text-xs text-madeira-500">Edite a quantidade e clique em salvar.</p>
        </div>
        <button
          className="btn-primario"
          onClick={() => {
            if (mostrarForm) {
              setForm(FORM_VAZIO);
              setEditandoId(null);
            }
            setMostrarForm(!mostrarForm);
          }}
        >
          {mostrarForm ? "Cancelar" : "+ Novo produto"}
        </button>
      </div>

      {mostrarForm && (
        <div id="form-editar-produto" className="card p-5 mb-6">
          <div className="grid grid-cols-3 gap-3 mb-3">
            <label className="block">
              <span className="text-xs text-madeira-600 mb-1 block">Nome do produto</span>
              <input className="input-base" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            </label>
            <label className="block">
              <span className="text-xs text-madeira-600 mb-1 block">Categoria</span>
              <select
                className="input-base"
                value={form.categoria}
                onChange={(e) => setForm({ ...form, categoria: e.target.value, categoriaNova: "" })}
              >
                <option value="">Selecione...</option>
                {categorias.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
                <option value="__nova__">+ Cadastrar nova categoria...</option>
              </select>
              {form.categoria === "__nova__" && (
                <>
                  <input
                    className="input-base mt-2"
                    value={form.categoriaNova}
                    onChange={(e) => setForm({ ...form, categoriaNova: e.target.value })}
                    placeholder="Nome da nova categoria"
                    autoFocus
                  />
                  <label className="block mt-2">
                    <span className="text-xs text-madeira-600 mb-1 block">
                      Essa categoria usa:
                    </span>
                    <select
                      className="input-base"
                      value={tipoCategoriaNova}
                      onChange={(e) =>
                        setTipoCategoriaNova(e.target.value as "tecido" | "espessura" | "simples")
                      }
                    >
                      <option value="simples">Nenhum (preço único, sem variação)</option>
                      <option value="tecido">Tecido (Suede / Linho / Veludo)</option>
                      <option value="espessura">Espessura (como as camas: 5cm / 7cm / 14cm)</option>
                    </select>
                  </label>
                </>
              )}
            </label>
            <label className="block">
              <span className="text-xs text-madeira-600 mb-1 block">Custo geral do produto (R$)</span>
              <input
                className="input-base"
                type="number"
                value={form.custo}
                onChange={(e) => setForm({ ...form, custo: e.target.value })}
              />
              <span className="text-xs text-madeira-400 mt-1 block">
                Usado se não preencher o custo por tecido/espessura abaixo.
              </span>
            </label>
          </div>

          {(() => {
            const categoriaAtual = form.categoria === "__nova__" ? form.categoriaNova : form.categoria;
            const tipoReal =
              form.categoria === "__nova__" ? tipoCategoriaNova : tipoDaCategoria(categoriaAtual);
            const modoCampos: "camas" | "tecido" | "simples" =
              tipoReal === "espessura" ? "camas" : tipoReal === "tecido" ? "tecido" : "simples";

            if (modoCampos === "camas") {
              const linhas =
                form.espessuraLinhas.length > 0
                  ? form.espessuraLinhas
                  : [
                      { label: "", preco: "", custo: "0", estoque: "0" },
                      { label: "", preco: "", custo: "0", estoque: "0" },
                      { label: "", preco: "", custo: "0", estoque: "0" },
                    ];
              const atualizarLinha = (
                i: number,
                campo: "label" | "preco" | "custo" | "estoque",
                valor: string
              ): void => {
                const novasLinhas = linhas.map((l, idx) => (idx === i ? { ...l, [campo]: valor } : l));
                setForm({ ...form, espessuraLinhas: novasLinhas });
              };
              return (
                <div className="mb-3">
                  <div className="grid grid-cols-4 gap-3">
                    {linhas.map((linha, i) => (
                      <div key={i}>
                        <label className="block mb-2">
                          <span className="text-xs text-madeira-600 mb-1 block">Espessura (ex: 10cm)</span>
                          <input
                            className="input-base"
                            value={linha.label}
                            onChange={(e) => atualizarLinha(i, "label", e.target.value)}
                          />
                        </label>
                        <label className="block mb-2">
                          <span className="text-xs text-madeira-600 mb-1 block">Preço à vista (R$)</span>
                          <input
                            className="input-base"
                            type="number"
                            value={linha.preco}
                            onChange={(e) => atualizarLinha(i, "preco", e.target.value)}
                          />
                        </label>
                        <label className="block mb-2">
                          <span className="text-xs text-madeira-600 mb-1 block">Custo (R$)</span>
                          <input
                            className="input-base"
                            type="number"
                            value={linha.custo}
                            onChange={(e) => atualizarLinha(i, "custo", e.target.value)}
                          />
                        </label>
                        <label className="block">
                          <span className="text-xs text-madeira-600 mb-1 block">Estoque</span>
                          <input
                            className="input-base"
                            type="number"
                            value={linha.estoque}
                            onChange={(e) => atualizarLinha(i, "estoque", e.target.value)}
                          />
                        </label>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="btn-secundario text-xs px-2 py-1 mt-2"
                    onClick={() =>
                      setForm({
                        ...form,
                        espessuraLinhas: [...linhas, { label: "", preco: "", custo: "0", estoque: "0" }],
                      })
                    }
                  >
                    + adicionar espessura
                  </button>
                  <p className="text-xs text-madeira-400 mt-1">
                    Deixe o nome em branco pra pular uma espessura que esse produto não tem (ex: colchões
                    normalmente só usam 2 — 10cm e 20cm).
                  </p>
                </div>
              );
            }

            if (modoCampos === "tecido") {
              return (
                <>
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    {(["Suede", "Linho", "Veludo"] as const).map((tec) => (
                      <div key={tec}>
                        <p className="text-xs font-semibold text-madeira-700 mb-1">{tec}</p>
                        <label className="block mb-2">
                          <span className="text-xs text-madeira-600 mb-1 block">Preço à vista (R$)</span>
                          <input
                            className="input-base"
                            type="number"
                            value={form[`preco${tec}` as "precoSuede"]}
                            onChange={(e) => setForm({ ...form, [`preco${tec}`]: e.target.value })}
                          />
                        </label>
                        <label className="block mb-2">
                          <span className="text-xs text-madeira-600 mb-1 block">Custo (R$)</span>
                          <input
                            className="input-base"
                            type="number"
                            value={form[`custo${tec}` as "custoSuede"]}
                            onChange={(e) => setForm({ ...form, [`custo${tec}`]: e.target.value })}
                          />
                        </label>
                        <label className="block">
                          <span className="text-xs text-madeira-600 mb-1 block">Estoque</span>
                          <input
                            className="input-base"
                            type="number"
                            value={form[`estoque${tec}` as "estoqueSuede"]}
                            onChange={(e) => setForm({ ...form, [`estoque${tec}`]: e.target.value })}
                          />
                        </label>
                      </div>
                    ))}
                  </div>
                </>
              );
            }

            // modoCampos === "simples": categorias como "Móveis para Sala"
            // não mostram opção de tecido, mas ainda precisam de preço de
            // venda e estoque.
            return (
              <div className="grid grid-cols-2 gap-3 mb-3 max-w-md">
                <label className="block">
                  <span className="text-xs text-madeira-600 mb-1 block">Preço de venda (R$)</span>
                  <input
                    className="input-base"
                    type="number"
                    value={form.precoSimples}
                    onChange={(e) => setForm({ ...form, precoSimples: e.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-madeira-600 mb-1 block">Estoque</span>
                  <input
                    className="input-base"
                    type="number"
                    value={form.estoqueSimples}
                    onChange={(e) => setForm({ ...form, estoqueSimples: e.target.value })}
                  />
                </label>
              </div>
            );
          })()}

          <button className="btn-primario" onClick={salvarProduto}>
            {editandoId ? "Salvar edição" : "Salvar produto"}
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        <button
          className={`text-xs px-3 py-1.5 rounded-full border ${!categoriaFiltro ? "bg-madeira-700 text-white border-madeira-700" : "border-madeira-300 text-madeira-600"}`}
          onClick={() => setCategoriaFiltro(null)}
        >
          Todas
        </button>
        {categorias.map((c) => (
          <button
            key={c}
            className={`text-xs px-3 py-1.5 rounded-full border ${categoriaFiltro === c ? "bg-madeira-700 text-white border-madeira-700" : "border-madeira-300 text-madeira-600"}`}
            onClick={() => setCategoriaFiltro(c)}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-madeira-50 text-left">
            <tr>
              <th className="px-4 py-2">Produto</th>
              <th className="px-4 py-2">Categoria</th>
              <th className="px-4 py-2">Custo</th>
              <th className="px-4 py-2">Preço de venda</th>
              <th className="px-4 py-2">Estoque</th>
              <th className="px-4 py-2">Ações</th>
            </tr>
          </thead>
          <tbody>
            {produtosFiltrados.map((p) => (
              <tr key={p.id} className="border-t border-estofado-100 align-top">
                <td className="px-4 py-2">{p.nome}</td>
                <td className="px-4 py-2">{p.categoria}</td>
                {(() => {
                  // Monta uma linha por tecido/espessura (mesma ordem usada
                  // na coluna Estoque), pra Custo e Preço de venda mostrarem
                  // o valor de cada um, em vez do valor geral do produto.
                  let linhas: { label: string; custo: number; venda: number }[] = [];
                  if (p.tipo_precificacao === "tecido_peca") {
                    const tecidos = Array.from(
                      new Set(p.produto_variantes.map((v) => v.nome_variante.split(" — ")[0]))
                    );
                    linhas = tecidos
                      .map((tecido) => {
                        const v2 = p.produto_variantes.find((v) => v.nome_variante === `${tecido} — 2 Lugares`);
                        const v3 = p.produto_variantes.find((v) => v.nome_variante === `${tecido} — 3 Lugares`);
                        if (!v2 || !v3) return null;
                        return {
                          label: tecido,
                          custo: v2.custo || 0,
                          venda: (v2.preco_avista || 0) + (v3.preco_avista || 0),
                        };
                      })
                      .filter((l): l is { label: string; custo: number; venda: number } => l !== null);
                  } else if (p.produto_variantes.length > 0) {
                    linhas = p.produto_variantes.map((v) => ({
                      label: v.nome_variante,
                      custo: v.custo || 0,
                      venda: v.preco_avista || 0,
                    }));
                  }

                  if (linhas.length > 0) {
                    return (
                      <>
                        <td className="px-4 py-2">
                          {linhas.map((l) => (
                            <div key={l.label} className="mb-1">
                              <span className="text-xs text-madeira-500">{l.label}</span>
                              <br />
                              {formatarMoeda(l.custo)}
                            </div>
                          ))}
                        </td>
                        <td className="px-4 py-2">
                          {linhas.map((l) => (
                            <div key={l.label} className="mb-1">
                              <span className="text-xs text-madeira-500">{l.label}</span>
                              <br />
                              {formatarMoeda(l.venda)}
                            </div>
                          ))}
                        </td>
                      </>
                    );
                  }
                  // Produto simples, sem tecido nem espessura — só um custo.
                  return (
                    <>
                      <td className="px-4 py-2">{formatarMoeda(p.custo || 0)}</td>
                      <td className="px-4 py-2">{formatarMoeda(p.preco_venda || 0)}</td>
                    </>
                  );
                })()}
                <td className="px-4 py-2">
                  {p.tipo_precificacao === "tecido_peca" ? (
                    // Sofá "2 e 3 lugares": mostra uma linha por tecido (o
                    // conjunto), não uma pra cada peça — o estoque de 2 e 3
                    // lugares fica igual, sempre casado como um par.
                    Array.from(new Set(p.produto_variantes.map((v) => v.nome_variante.split(" — ")[0]))).map(
                      (tecido) => {
                        const v2 = p.produto_variantes.find((v) => v.nome_variante === `${tecido} — 2 Lugares`);
                        const v3 = p.produto_variantes.find((v) => v.nome_variante === `${tecido} — 3 Lugares`);
                        if (!v2 || !v3) return null;
                        const chaveEdicao = `${v2.id}|${v3.id}`;
                        return (
                          <div key={tecido} className="flex items-center gap-2 mb-1">
                            <span className="text-xs w-24">{tecido} — Conjunto</span>
                            <input
                              className="input-base py-1 px-2 text-xs w-20"
                              type="number"
                              defaultValue={Math.min(v2.estoque, v3.estoque)}
                              onChange={(e) =>
                                setEstoquesEdicao({ ...estoquesEdicao, [chaveEdicao]: e.target.value })
                              }
                            />
                            <button
                              className="btn-secundario text-xs px-2 py-1"
                              onClick={() =>
                                salvarEstoqueConjunto(
                                  p.id,
                                  v2.id,
                                  v3.id,
                                  parseInt(
                                    estoquesEdicao[chaveEdicao] ?? String(Math.min(v2.estoque, v3.estoque))
                                  ) || 0
                                )
                              }
                            >
                              Salvar
                            </button>
                          </div>
                        );
                      }
                    )
                  ) : p.produto_variantes.length > 0 ? (
                    p.produto_variantes.map((v) => (
                      <div key={v.id} className="flex items-center gap-2 mb-1">
                        <span className="text-xs w-24">{v.nome_variante}</span>
                        <input
                          className="input-base py-1 px-2 text-xs w-20"
                          type="number"
                          defaultValue={v.estoque}
                          onChange={(e) =>
                            setEstoquesEdicao({ ...estoquesEdicao, [v.id]: e.target.value })
                          }
                        />
                        <button
                          className="btn-secundario text-xs px-2 py-1"
                          onClick={() =>
                            salvarEstoqueVariante(p.id, v.id, parseInt(estoquesEdicao[v.id] ?? String(v.estoque)) || 0)
                          }
                        >
                          Salvar
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="flex items-center gap-2">
                      <input
                        className="input-base py-1 px-2 text-xs w-20"
                        type="number"
                        defaultValue={p.quantidade_estoque || 0}
                        onChange={(e) => setEstoquesEdicao({ ...estoquesEdicao, [p.id]: e.target.value })}
                      />
                      <button
                        className="btn-secundario text-xs px-2 py-1"
                        onClick={() =>
                          salvarEstoqueSimples(p.id, parseInt(estoquesEdicao[p.id] ?? String(p.quantidade_estoque || 0)) || 0)
                        }
                      >
                        Salvar
                      </button>
                    </div>
                  )}
                </td>
                <td className="px-4 py-2 whitespace-nowrap">
                  <button className="btn-secundario text-xs px-2 py-1 mr-2" onClick={() => abrirEdicao(p)}>
                    Editar
                  </button>
                  <button className="text-xs text-red-700" onClick={() => excluirProduto(p.id, p.nome)}>
                    excluir
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ==================== USUÁRIOS ==================== */
function AbaUsuarios() {
  const { lojas } = useLoja();
  const [usuarios, setUsuarios] = useState<
    (Usuario & { lojas?: { nome: string } | null; caixas?: { nome: string } | null })[]
  >([]);
  const [souAdmin, setSouAdmin] = useState(false);
  const [caixasDaLoja, setCaixasDaLoja] = useState<Caixa[]>([]);

  const [mostrarForm, setMostrarForm] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState("");
  const [cpfInfo, setCpfInfo] = useState("");
  const [cpfInfoCor, setCpfInfoCor] = useState("text-madeira-500");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [funcao, setFuncao] = useState<(typeof FUNCOES)[number]>("vendedor");
  const [lojaId, setLojaId] = useState("");
  const [novaLojaNome, setNovaLojaNome] = useState("");
  const [novaLojaCnpj, setNovaLojaCnpj] = useState("");
  const [caixaId, setCaixaId] = useState("");
  const [novoCaixaNome, setNovoCaixaNome] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [telasSelecionadas, setTelasSelecionadas] = useState<Record<string, boolean>>({});
  const [salvando, setSalvando] = useState(false);

  async function carregar() {
    const { data } = await supabase
      .from("usuarios")
      .select("*, lojas(nome), caixas(nome)")
      .order("nome");
    if (data) setUsuarios(data as unknown as typeof usuarios);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: perfil } = await supabase.from("usuarios").select("funcao").eq("id", user.id).maybeSingle();
      setSouAdmin(perfil?.funcao === "admin");
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  useEffect(() => {
    aplicarPermissoesPadrao(funcao);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [funcao]);

  useEffect(() => {
    if (!lojaId) {
      setCaixasDaLoja([]);
      return;
    }
    supabase
      .from("caixas")
      .select("*")
      .eq("loja_id", lojaId)
      .eq("ativo", true)
      .order("nome")
      .then(({ data }) => setCaixasDaLoja((data || []) as Caixa[]));
  }, [lojaId]);

  async function aplicarPermissoesPadrao(funcaoEscolhida: string) {
    if (funcaoEscolhida === "admin") {
      const todasMarcadas: Record<string, boolean> = {};
      TELAS.forEach((t) => (todasMarcadas[t.chave] = true));
      setTelasSelecionadas(todasMarcadas);
      return;
    }
    const { data } = await supabase.from("permissoes").select("tela, pode_acessar").eq("funcao", funcaoEscolhida);
    const padrao: Record<string, boolean> = {};
    TELAS.forEach((t) => {
      padrao[t.chave] = data?.find((p) => p.tela === t.chave)?.pode_acessar ?? false;
    });
    setTelasSelecionadas(padrao);
  }

  function limparForm() {
    setNome("");
    setCpf("");
    setCpfInfo("");
    setEmail("");
    setSenha("");
    setFuncao("vendedor");
    setLojaId(lojas[0]?.id || "");
    setNovaLojaNome("");
    setNovaLojaCnpj("");
    setCaixaId("");
    setNovoCaixaNome("");
    setAtivo(true);
    setEditandoId(null);
  }

  function abrirNovo() {
    limparForm();
    setMostrarForm(true);
  }

  async function abrirEdicao(u: Usuario) {
    setEditandoId(u.id);
    setNome(u.nome || "");
    setCpf(u.cpf ? formatarCpfExibicao(u.cpf) : "");
    setCpfInfo("");
    setEmail(u.email || "");
    setSenha("");
    setFuncao(u.funcao);
    setLojaId(u.loja_id || "");
    setNovaLojaNome("");
    setNovaLojaCnpj("");
    setCaixaId(u.caixa_id || "");
    setNovoCaixaNome("");
    setAtivo(u.ativo ?? true);

    const { data: overrides } = await supabase
      .from("usuario_permissoes")
      .select("tela, pode_acessar")
      .eq("usuario_id", u.id);
    if (overrides && overrides.length > 0) {
      const mapa: Record<string, boolean> = {};
      overrides.forEach((o) => (mapa[o.tela] = o.pode_acessar));
      setTelasSelecionadas(mapa);
    } else {
      await aplicarPermissoesPadrao(u.funcao);
    }
    setMostrarForm(true);
  }

  function formatarCpfExibicao(digitos: string) {
    if (digitos.length !== 11) return digitos;
    return `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-${digitos.slice(9)}`;
  }

  async function aoMudarCpf(v: string) {
    const digitos = v.replace(/\D/g, "").slice(0, 11);
    let formatado = digitos;
    if (digitos.length > 9) formatado = `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-${digitos.slice(9)}`;
    else if (digitos.length > 6) formatado = `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6)}`;
    else if (digitos.length > 3) formatado = `${digitos.slice(0, 3)}.${digitos.slice(3)}`;
    setCpf(formatado);

    if (digitos.length !== 11) {
      setCpfInfo("");
      return;
    }
    setCpfInfo("Consultando...");
    setCpfInfoCor("text-madeira-500");
    const resultado = await consultarCpf(digitos);
    if (resultado.encontrado && resultado.nome) {
      setNome(resultado.nome);
      setCpfInfo(`Nome encontrado: ${resultado.nome} (pode corrigir se precisar)`);
      setCpfInfoCor("text-green-700");
    } else {
      setCpfInfo("CPF não encontrado na consulta — preencha o nome manualmente.");
      setCpfInfoCor("text-madeira-500");
    }
  }

  function alternarTela(tela: string) {
    setTelasSelecionadas({ ...telasSelecionadas, [tela]: !telasSelecionadas[tela] });
  }

  async function salvarUsuario() {
    if (!nome.trim() || !email.trim()) {
      alert("Preencha nome e e-mail.");
      return;
    }
    if (!editandoId && !senha.trim()) {
      alert("Defina uma senha.");
      return;
    }
    if (funcao !== "admin" && !lojaId && !novaLojaNome.trim()) {
      alert("Escolha uma loja existente ou digite o nome de uma nova.");
      return;
    }
    setSalvando(true);

    const corpo = {
      nome,
      cpf: cpf.replace(/\D/g, "") || null,
      email,
      funcao,
      lojaId: lojaId || null,
      novaLojaNome: novaLojaNome || null,
      novaLojaCnpj: novaLojaCnpj || null,
      caixaId: caixaId || null,
      novoCaixaNome: novoCaixaNome || null,
      ativo,
      permissoesTelas: telasSelecionadas,
    };

    const resp = editandoId
      ? await fetch("/api/admin/editar-usuario", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...corpo, usuarioId: editandoId, novaSenha: senha || undefined }),
        })
      : await fetch("/api/admin/criar-usuario", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...corpo, senha }),
        });

    const resultado = await resp.json();
    setSalvando(false);

    if (!resp.ok) {
      alert("Erro: " + resultado.error);
      return;
    }

    setMostrarForm(false);
    limparForm();
    carregar();
    alert(editandoId ? "Usuário atualizado!" : "Usuário cadastrado! Já pode fazer login com o e-mail e senha definidos.");
  }

  async function alternarAtivo(u: Usuario) {
    const { error } = await supabase.from("usuarios").update({ ativo: !u.ativo }).eq("id", u.id);
    if (error) {
      alert("Erro: " + error.message);
      return;
    }
    carregar();
  }

  async function excluirUsuario(id: string, nomeUsuario: string) {
    if (!confirm(`Excluir "${nomeUsuario}"? A pessoa perde o acesso ao sistema imediatamente.`)) return;
    const resp = await fetch("/api/admin/excluir-usuario", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuarioId: id }),
    });
    const resultado = await resp.json();
    if (!resp.ok) {
      alert("Erro: " + resultado.error);
      return;
    }
    carregar();
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <div>
          <p className="text-sm font-semibold text-madeira-700">Equipe com acesso ao painel</p>
          <p className="text-xs text-madeira-500">
            Cadastre a pessoa, a loja e o caixa dela — tudo numa tela só.
          </p>
        </div>
        {souAdmin && (
          <button className="btn-primario" onClick={() => (mostrarForm ? setMostrarForm(false) : abrirNovo())}>
            {mostrarForm ? "Cancelar" : "+ Cadastrar Usuário"}
          </button>
        )}
      </div>

      {!souAdmin && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-3 mb-4">
          Só administradores podem cadastrar ou alterar usuários.
        </p>
      )}

      {mostrarForm && souAdmin && (
        <div className="card p-5 mb-6">
          <p className="font-display text-lg mb-4">{editandoId ? "Editar usuário" : "Novo usuário"}</p>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <label className="block">
              <span className="text-xs text-madeira-600 mb-1 block">CPF</span>
              <input className="input-base" value={cpf} onChange={(e) => aoMudarCpf(e.target.value)} placeholder="000.000.000-00" />
              {cpfInfo && <p className={`text-xs mt-1 ${cpfInfoCor}`}>{cpfInfo}</p>}
            </label>
            <label className="block">
              <span className="text-xs text-madeira-600 mb-1 block">Nome</span>
              <input className="input-base" value={nome} onChange={(e) => setNome(e.target.value)} />
            </label>
            <label className="block">
              <span className="text-xs text-madeira-600 mb-1 block">E-mail</span>
              <input className="input-base" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="block">
              <span className="text-xs text-madeira-600 mb-1 block">
                {editandoId ? "Nova senha (deixe em branco pra manter)" : "Senha"}
              </span>
              <input className="input-base" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} />
            </label>
            <label className="block">
              <span className="text-xs text-madeira-600 mb-1 block">Função/cargo</span>
              <select className="input-base" value={funcao} onChange={(e) => setFuncao(e.target.value as (typeof FUNCOES)[number])}>
                {FUNCOES.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 self-end pb-2">
              <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
              <span className="text-sm text-madeira-700">Usuário ativo</span>
            </label>
          </div>

          {funcao !== "admin" && (
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block mb-1">
                  <span className="text-xs text-madeira-600 mb-1 block">Loja</span>
                  <select
                    className="input-base"
                    value={lojaId}
                    onChange={(e) => {
                      setLojaId(e.target.value);
                      if (e.target.value) setNovaLojaNome("");
                      setCaixaId("");
                    }}
                  >
                    <option value="">Selecione...</option>
                    {lojas.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.nome}
                      </option>
                    ))}
                  </select>
                </label>
                <input
                  className="input-base"
                  value={novaLojaNome}
                  onChange={(e) => {
                    setNovaLojaNome(e.target.value);
                    if (e.target.value) setLojaId("");
                  }}
                  placeholder="...ou digite o nome de uma loja nova"
                />
                {novaLojaNome && (
                  <input
                    className="input-base mt-2"
                    value={novaLojaCnpj}
                    onChange={(e) => setNovaLojaCnpj(e.target.value)}
                    placeholder="CNPJ da loja nova (opcional)"
                  />
                )}
              </div>
              <div>
                <label className="block mb-1">
                  <span className="text-xs text-madeira-600 mb-1 block">Caixa</span>
                  <select
                    className="input-base"
                    value={caixaId}
                    onChange={(e) => {
                      setCaixaId(e.target.value);
                      if (e.target.value) setNovoCaixaNome("");
                    }}
                    disabled={!lojaId}
                  >
                    <option value="">Selecione...</option>
                    {caixasDaLoja.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                  </select>
                </label>
                <input
                  className="input-base"
                  value={novoCaixaNome}
                  onChange={(e) => {
                    setNovoCaixaNome(e.target.value);
                    if (e.target.value) setCaixaId("");
                  }}
                  placeholder="...ou digite o nome de um caixa novo"
                />
              </div>
            </div>
          )}

          <p className="text-xs text-madeira-600 mb-2 mt-2">
            Permissões dessa pessoa — já vieram marcadas conforme o cargo <strong>{funcao}</strong>, ajuste se
            precisar:
          </p>
          <div className="grid grid-cols-3 gap-2 mb-4">
            {TELAS.map((t) => (
              <label key={t.chave} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!telasSelecionadas[t.chave]} onChange={() => alternarTela(t.chave)} />
                {t.label}
              </label>
            ))}
          </div>

          <button className="btn-primario" disabled={salvando} onClick={salvarUsuario}>
            {salvando ? "Salvando..." : editandoId ? "Salvar edição" : "Cadastrar usuário"}
          </button>
        </div>
      )}

      <div className="card overflow-hidden mb-4">
        <table className="w-full text-sm">
          <thead className="bg-madeira-50 text-left">
            <tr>
              <th className="px-4 py-2">Nome</th>
              <th className="px-4 py-2">CPF</th>
              <th className="px-4 py-2">E-mail</th>
              <th className="px-4 py-2">Função</th>
              <th className="px-4 py-2">Loja</th>
              <th className="px-4 py-2">Caixa</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id} className="border-t border-estofado-100">
                <td className="px-4 py-2">{u.nome}</td>
                <td className="px-4 py-2 text-xs text-madeira-500">{u.cpf ? formatarCpfExibicao(u.cpf) : "—"}</td>
                <td className="px-4 py-2 text-xs text-madeira-500">{u.email || "—"}</td>
                <td className="px-4 py-2">{u.funcao}</td>
                <td className="px-4 py-2 text-xs text-madeira-500">{u.lojas?.nome || "—"}</td>
                <td className="px-4 py-2 text-xs text-madeira-500">{u.caixas?.nome || "—"}</td>
                <td className="px-4 py-2">
                  <span className={`text-xs px-2 py-0.5 rounded ${u.ativo ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                    {u.ativo ? "Ativo" : "Inativo"}
                  </span>
                </td>
                <td className="px-4 py-2 whitespace-nowrap">
                  {souAdmin && (
                    <>
                      <button className="btn-secundario text-xs px-2 py-1 mr-2" onClick={() => abrirEdicao(u)}>
                        Editar
                      </button>
                      <button className="text-xs text-amber-700 mr-2" onClick={() => alternarAtivo(u)}>
                        {u.ativo ? "Desativar" : "Reativar"}
                      </button>
                      <button className="text-xs text-red-700" onClick={() => excluirUsuario(u.id, u.nome)}>
                        excluir
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-madeira-500">
        Esse cadastro já cria o login de verdade (Supabase Auth), vincula loja e caixa, e define as permissões —
        tudo numa única tela.
      </p>
    </div>
  );
}


/* ==================== PERMISSÕES ==================== */
function AbaPermissoes() {
  const [permissoes, setPermissoes] = useState<Permissao[]>([]);

  async function carregar() {
    const { data } = await supabase.from("permissoes").select("*");
    if (data) setPermissoes(data as Permissao[]);
  }

  useEffect(() => {
    carregar();
  }, []);

  function valor(funcao: string, tela: string): boolean {
    return permissoes.find((p) => p.funcao === funcao && p.tela === tela)?.pode_acessar || false;
  }

  async function alternar(funcao: string, tela: string) {
    const atual = valor(funcao, tela);
    await supabase
      .from("permissoes")
      .upsert({ funcao, tela, pode_acessar: !atual }, { onConflict: "funcao,tela" });
    carregar();
  }

  return (
    <div>
      <p className="text-sm font-semibold text-madeira-700 mb-1">O que cada categoria pode acessar</p>
      <p className="text-xs text-madeira-500 mb-4">Admin sempre tem acesso a tudo (não editável aqui).</p>
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-madeira-50">
            <tr>
              <th className="px-4 py-2 text-left">Tela</th>
              <th className="px-4 py-2 text-center">Vendedor</th>
              <th className="px-4 py-2 text-center">Produção</th>
              <th className="px-4 py-2 text-center">Caixa</th>
              <th className="px-4 py-2 text-center">Gerente</th>
              <th className="px-4 py-2 text-center">Admin</th>
            </tr>
          </thead>
          <tbody>
            {TELAS.map((t) => (
              <tr key={t.chave} className="border-t border-estofado-100">
                <td className="px-4 py-2">{t.label}</td>
                <td className="px-4 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={valor("vendedor", t.chave)}
                    onChange={() => alternar("vendedor", t.chave)}
                  />
                </td>
                <td className="px-4 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={valor("producao", t.chave)}
                    onChange={() => alternar("producao", t.chave)}
                  />
                </td>
                <td className="px-4 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={valor("caixa", t.chave)}
                    onChange={() => alternar("caixa", t.chave)}
                  />
                </td>
                <td className="px-4 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={valor("gerente", t.chave)}
                    onChange={() => alternar("gerente", t.chave)}
                  />
                </td>
                <td className="px-4 py-2 text-center">
                  <input type="checkbox" checked readOnly disabled />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <PermissoesPorUsuario />
    </div>
  );
}

/* ==================== PERMISSÃO INDIVIDUAL POR USUÁRIO ==================== */
function PermissoesPorUsuario() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [usuarioSel, setUsuarioSel] = useState("");
  const [permissoesPadrao, setPermissoesPadrao] = useState<Permissao[]>([]);
  const [excecoes, setExcecoes] = useState<{ tela: string; pode_acessar: boolean }[]>([]);

  useEffect(() => {
    supabase
      .from("usuarios")
      .select("id, nome, funcao")
      .order("nome")
      .then(({ data }) => setUsuarios((data || []) as Usuario[]));
  }, []);

  async function carregarExcecoes(usuarioId: string) {
    const { data } = await supabase
      .from("usuario_permissoes")
      .select("tela, pode_acessar")
      .eq("usuario_id", usuarioId);
    setExcecoes(data || []);
  }

  useEffect(() => {
    if (!usuarioSel) {
      setExcecoes([]);
      setPermissoesPadrao([]);
      return;
    }
    const usuario = usuarios.find((u) => u.id === usuarioSel);
    supabase
      .from("permissoes")
      .select("*")
      .eq("funcao", usuario?.funcao || "")
      .then(({ data }) => setPermissoesPadrao((data || []) as Permissao[]));
    carregarExcecoes(usuarioSel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuarioSel]);

  function padraoDoCargo(tela: string): boolean {
    return permissoesPadrao.find((p) => p.tela === tela)?.pode_acessar || false;
  }

  function valorAtual(tela: string): "padrao" | "permitir" | "bloquear" {
    const exc = excecoes.find((e) => e.tela === tela);
    if (!exc) return "padrao";
    return exc.pode_acessar ? "permitir" : "bloquear";
  }

  async function definir(tela: string, opcao: "padrao" | "permitir" | "bloquear") {
    if (opcao === "padrao") {
      await supabase.from("usuario_permissoes").delete().eq("usuario_id", usuarioSel).eq("tela", tela);
    } else {
      await supabase
        .from("usuario_permissoes")
        .upsert(
          { usuario_id: usuarioSel, tela, pode_acessar: opcao === "permitir" },
          { onConflict: "usuario_id,tela" }
        );
    }
    carregarExcecoes(usuarioSel);
  }

  const usuarioAtual = usuarios.find((u) => u.id === usuarioSel);

  return (
    <div className="mt-8">
      <p className="text-sm font-semibold text-madeira-700 mb-1">Permissão individual por usuário</p>
      <p className="text-xs text-madeira-500 mb-4">
        Sobrescreve o padrão do cargo pra uma pessoa específica — por exemplo, bloquear alguém de ver a
        Administração mesmo que o cargo dela normalmente permita.
      </p>
      <select
        className="input-base max-w-xs mb-4"
        value={usuarioSel}
        onChange={(e) => setUsuarioSel(e.target.value)}
      >
        <option value="">Selecione um usuário...</option>
        {usuarios
          .filter((u) => u.funcao !== "admin")
          .map((u) => (
            <option key={u.id} value={u.id}>
              {u.nome} ({u.funcao})
            </option>
          ))}
      </select>

      {usuarioAtual && (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-madeira-50">
              <tr>
                <th className="px-4 py-2 text-left">Tela</th>
                <th className="px-4 py-2 text-left">Padrão do cargo ({usuarioAtual.funcao})</th>
                <th className="px-4 py-2 text-left">Para {usuarioAtual.nome}</th>
              </tr>
            </thead>
            <tbody>
              {TELAS.map((t) => (
                <tr key={t.chave} className="border-t border-estofado-100">
                  <td className="px-4 py-2">{t.label}</td>
                  <td className="px-4 py-2 text-madeira-500">
                    {padraoDoCargo(t.chave) ? "Pode acessar" : "Bloqueado"}
                  </td>
                  <td className="px-4 py-2">
                    <select
                      className="input-base"
                      value={valorAtual(t.chave)}
                      onChange={(e) =>
                        definir(t.chave, e.target.value as "padrao" | "permitir" | "bloquear")
                      }
                    >
                      <option value="padrao">Usar padrão do cargo</option>
                      <option value="permitir">Sempre permitir</option>
                      <option value="bloquear">Sempre bloquear</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
function AbaTecidos() {
  const [cores, setCores] = useState<TecidoCor[]>([]);
  const [novoTecido, setNovoTecido] = useState("Suede");
  const [novoCodigo, setNovoCodigo] = useState("");
  const [novoNome, setNovoNome] = useState("");

  async function carregar() {
    const { data } = await supabase.from("tecidos_cores").select("*").order("tecido").order("codigo");
    if (data) setCores(data as TecidoCor[]);
  }

  useEffect(() => {
    carregar();
  }, []);

  async function alternar(id: string, disponivel: boolean) {
    await supabase.from("tecidos_cores").update({ disponivel: !disponivel }).eq("id", id);
    carregar();
  }

  async function adicionarCor() {
    if (!novoCodigo.trim() || !novoNome.trim()) {
      alert("Preencha o código e o nome da cor.");
      return;
    }
    const { error } = await supabase
      .from("tecidos_cores")
      .insert({ tecido: novoTecido, codigo: novoCodigo.trim(), nome: novoNome.trim(), disponivel: true });
    if (error) {
      alert("Erro: " + error.message);
      return;
    }
    setNovoCodigo("");
    setNovoNome("");
    carregar();
  }

  const tecidos = Array.from(new Set(["Suede", "Linho", "Veludo", ...cores.map((c) => c.tecido)]));

  return (
    <div>
      <p className="text-sm font-semibold text-madeira-700 mb-1">Disponibilidade de cores</p>
      <p className="text-xs text-madeira-500 mb-4">
        Desmarque uma cor quando o tecido acabar — ela some na hora da venda.
      </p>

      <div className="card p-4 mb-6 max-w-lg">
        <p className="text-sm font-semibold text-madeira-700 mb-3">+ Adicionar nova cor</p>
        <div className="grid grid-cols-3 gap-3">
          <label className="block">
            <span className="text-xs text-madeira-600 mb-1 block">Tecido</span>
            <select className="input-base" value={novoTecido} onChange={(e) => setNovoTecido(e.target.value)}>
              {tecidos.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-madeira-600 mb-1 block">Código</span>
            <input className="input-base" value={novoCodigo} onChange={(e) => setNovoCodigo(e.target.value)} placeholder="Ex: 77" />
          </label>
          <label className="block">
            <span className="text-xs text-madeira-600 mb-1 block">Nome</span>
            <input className="input-base" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Ex: Bordô" />
          </label>
        </div>
        <button className="btn-primario mt-3" onClick={adicionarCor}>
          + Adicionar cor
        </button>
      </div>

      {tecidos.map((tecido) => (
        <div key={tecido} className="mb-5">
          <p className="text-sm font-semibold text-madeira-700 mb-2">{tecido}</p>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <tbody>
                {cores
                  .filter((c) => c.tecido === tecido)
                  .map((c) => (
                    <tr key={c.id} className="border-b border-estofado-100 last:border-0">
                      <td className="px-4 py-2">
                        Cor {c.codigo} — {c.nome}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <input
                          type="checkbox"
                          checked={c.disponivel}
                          onChange={() => alternar(c.id, c.disponivel)}
                        />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ==================== RELATÓRIO ==================== */
interface LinhaRelatorio {
  nome: string;
  estoque: number;
  avista: number;
  aprazo: number;
}

function AbaRelatorio() {
  const { lojaAtual } = useLoja();
  const [produtos, setProdutos] = useState<ProdutoComVariantes[]>([]);
  const [filtro, setFiltro] = useState<"com" | "sem" | "todos">("todos");

  useEffect(() => {
    carregarProdutosComEstoque(supabase, lojaAtual).then(setProdutos);
  }, [lojaAtual]);

  function linhas(): LinhaRelatorio[] {
    const resultado: LinhaRelatorio[] = [];
    produtos.forEach((p) => {
      if (p.produto_variantes.length > 0) {
        const precos = p.produto_variantes.map((v) => v.preco_avista);
        const todosIguais = precos.every((v) => v === precos[0]);
        if (todosIguais) {
          const totalEstoque = p.produto_variantes.reduce((s, v) => s + v.estoque, 0);
          resultado.push({
            nome: p.nome,
            estoque: totalEstoque,
            avista: precos[0],
            aprazo: Math.round(precos[0] * 1.1 * 100) / 100,
          });
        } else {
          p.produto_variantes.forEach((v) => {
            resultado.push({
              nome: `${p.nome} — ${v.nome_variante}`,
              estoque: v.estoque,
              avista: v.preco_avista,
              aprazo: Math.round(v.preco_avista * 1.1 * 100) / 100,
            });
          });
        }
      } else {
        resultado.push({
          nome: p.nome,
          estoque: p.quantidade_estoque || 0,
          avista: p.preco_venda,
          aprazo: Math.round(p.preco_venda * 1.1 * 100) / 100,
        });
      }
    });
    return resultado;
  }

  const linhasFiltradas = linhas().filter((l) => {
    if (filtro === "com") return l.estoque > 0;
    if (filtro === "sem") return l.estoque <= 0;
    return true;
  });

  const totalAVista = linhasFiltradas.reduce((s, l) => s + l.avista * l.estoque, 0);
  const totalAPrazo = linhasFiltradas.reduce((s, l) => s + l.aprazo * l.estoque, 0);

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm font-semibold text-madeira-700">Relatório de produtos</p>
        <button className="btn-secundario" onClick={() => window.print()}>
          🖨 Imprimir relatório
        </button>
      </div>

      <div className="flex gap-2 mb-4">
        {(["com", "sem", "todos"] as const).map((f) => (
          <button
            key={f}
            className={`text-xs px-3 py-1.5 rounded-full border ${filtro === f ? "bg-madeira-700 text-white border-madeira-700" : "border-madeira-300 text-madeira-600"}`}
            onClick={() => setFiltro(f)}
          >
            {f === "com" ? "Com estoque" : f === "sem" ? "Sem estoque" : "Todos"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="card p-4">
          <p className="text-xs text-madeira-500 mb-1">Itens no relatório</p>
          <p className="font-display text-xl">{linhasFiltradas.length}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-madeira-500 mb-1">Total em estoque (à vista)</p>
          <p className="font-display text-xl">{formatarMoeda(totalAVista)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-madeira-500 mb-1">Total em estoque (a prazo)</p>
          <p className="font-display text-xl">{formatarMoeda(totalAPrazo)}</p>
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-madeira-50 text-left">
            <tr>
              <th className="px-4 py-2">Produto</th>
              <th className="px-4 py-2 text-right">Estoque</th>
              <th className="px-4 py-2 text-right">À vista</th>
              <th className="px-4 py-2 text-right">A prazo</th>
              <th className="px-4 py-2 text-right">Total à vista</th>
              <th className="px-4 py-2 text-right">Total a prazo</th>
            </tr>
          </thead>
          <tbody>
            {linhasFiltradas.map((l, idx) => (
              <tr key={idx} className="border-t border-estofado-100">
                <td className="px-4 py-2">{l.nome}</td>
                <td className="px-4 py-2 text-right">{l.estoque}</td>
                <td className="px-4 py-2 text-right">{formatarMoeda(l.avista)}</td>
                <td className="px-4 py-2 text-right">{formatarMoeda(l.aprazo)}</td>
                <td className="px-4 py-2 text-right">{formatarMoeda(l.avista * l.estoque)}</td>
                <td className="px-4 py-2 text-right">{formatarMoeda(l.aprazo * l.estoque)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div id="area-impressao">
        <h2>Relatório de Produtos — Caruaru Móveis</h2>
        <table>
          <thead>
            <tr>
              <th>Produto</th>
              <th>Estoque</th>
              <th>À vista</th>
              <th>A prazo</th>
            </tr>
          </thead>
          <tbody>
            {linhasFiltradas.map((l, idx) => (
              <tr key={idx}>
                <td>{l.nome}</td>
                <td>{l.estoque}</td>
                <td>{formatarMoeda(l.avista)}</td>
                <td>{formatarMoeda(l.aprazo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>Total à vista: {formatarMoeda(totalAVista)}</p>
        <p>Total a prazo: {formatarMoeda(totalAPrazo)}</p>
      </div>
    </div>
  );
}

/* ==================== CANCELAR NOTA ==================== */
interface VendaCancelamento {
  id: string;
  numero_pedido: number;
  loja_id: string;
  total: number;
  cancelada: boolean;
  turno_caixa_id: string | null;
  forma_pagamento: string;
  clientes: { nome: string } | null;
  venda_itens: {
    id: string;
    produto_id: string | null;
    variante_id: string | null;
    variante: string | null;
    nome_produto: string;
    quantidade: number;
    tipo_entrega: string;
  }[];
  venda_pagamentos: { forma_pagamento: string; valor: number }[];
}

function AbaCancelarNota() {
  const [numeroPedido, setNumeroPedido] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [venda, setVenda] = useState<VendaCancelamento | null>(null);
  const [motivo, setMotivo] = useState("");
  const [cancelando, setCancelando] = useState(false);
  const [erro, setErro] = useState("");

  async function buscar() {
    setErro("");
    setVenda(null);
    if (!numeroPedido.trim()) return;
    setBuscando(true);
    const { data, error } = await supabase
      .from("vendas")
      .select(
        "id, numero_pedido, loja_id, total, cancelada, turno_caixa_id, forma_pagamento, clientes(nome), venda_itens(id, produto_id, variante_id, variante, nome_produto, quantidade, tipo_entrega), venda_pagamentos(forma_pagamento, valor)"
      )
      .eq("numero_pedido", Number(numeroPedido))
      .maybeSingle();
    setBuscando(false);
    if (error || !data) {
      setErro("Pedido não encontrado.");
      return;
    }
    setVenda(data as unknown as VendaCancelamento);
  }

  async function cancelar() {
    if (!venda) return;
    if (!motivo.trim()) {
      alert("Digite o motivo do cancelamento.");
      return;
    }
    if (
      !confirm(
        `Cancelar o pedido #${venda.numero_pedido}? Os produtos de pronta entrega voltam pro estoque. Essa ação não pode ser desfeita.`
      )
    )
      return;

    setCancelando(true);
    try {
      const avisos: string[] = [];

      for (const item of venda.venda_itens) {
        if (item.tipo_entrega !== "pronta" || !item.produto_id) continue;

        let varianteId = item.variante_id;
        if (!varianteId && item.variante) {
          const { data: variantes } = await supabase
            .from("produto_variantes")
            .select("id, nome_variante")
            .eq("produto_id", item.produto_id);
          const encontrada = variantes?.find((v) => v.nome_variante === item.variante);
          if (encontrada) varianteId = encontrada.id;
        }

        if (!varianteId) {
          const { data: variantesTodas } = await supabase
            .from("produto_variantes")
            .select("id")
            .eq("produto_id", item.produto_id);
          if (variantesTodas && variantesTodas.length > 0) {
            avisos.push(
              `"${item.nome_produto}${item.variante ? ` — ${item.variante}` : ""}" tem variantes, mas não consegui identificar qual — ajuste o estoque manualmente.`
            );
            continue;
          }
        }

        await ajustarEstoqueLoja(supabase, venda.loja_id, item.produto_id, varianteId, item.quantidade);
      }

      const { error: erroCancelar } = await supabase
        .from("vendas")
        .update({
          cancelada: true,
          motivo_cancelamento: motivo.trim(),
          cancelada_em: new Date().toISOString(),
        })
        .eq("id", venda.id);
      if (erroCancelar) throw erroCancelar;

      // reverte os totais do caixa, só se o turno dessa venda ainda estiver aberto
      if (venda.turno_caixa_id) {
        const { data: turno } = await supabase
          .from("turnos_caixa")
          .select("status, total_vendido, total_dinheiro, total_pix, total_debito, total_credito")
          .eq("id", venda.turno_caixa_id)
          .maybeSingle();
        if (turno && turno.status === "aberto") {
          const totaisAtualizados: Record<string, number> = {
            total_vendido: Math.max((turno.total_vendido || 0) - venda.total, 0),
          };
          for (const pag of venda.venda_pagamentos || []) {
            const campo =
              pag.forma_pagamento === "Dinheiro"
                ? "total_dinheiro"
                : pag.forma_pagamento === "Pix"
                ? "total_pix"
                : pag.forma_pagamento === "Débito"
                ? "total_debito"
                : pag.forma_pagamento === "Crédito"
                ? "total_credito"
                : null;
            if (campo) {
              totaisAtualizados[campo] = Math.max(
                ((turno as Record<string, number>)[campo] || 0) - pag.valor,
                0
              );
            }
          }
          await supabase.from("turnos_caixa").update(totaisAtualizados).eq("id", venda.turno_caixa_id);
        } else {
          avisos.push(
            "O turno de caixa dessa venda já está fechado — os totais do caixa não foram ajustados automaticamente, ajuste manualmente se precisar."
          );
        }
      }

      alert(
        `Pedido #${venda.numero_pedido} cancelado. Produtos de pronta entrega voltaram pro estoque.` +
          (avisos.length > 0 ? "\n\nAtenção:\n" + avisos.join("\n") : "")
      );
      setVenda(null);
      setNumeroPedido("");
      setMotivo("");
    } catch (e) {
      alert("Erro ao cancelar: " + (e as Error).message);
    } finally {
      setCancelando(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <h2 className="font-display text-xl mb-1">Cancelar nota</h2>
      <p className="text-sm text-madeira-600 mb-4">
        Cancela um pedido e devolve ao estoque os produtos que eram de pronta entrega. Pede o motivo do
        cancelamento.
      </p>

      <div className="flex gap-2 mb-4">
        <input
          className="input-base max-w-xs"
          placeholder="Número do pedido"
          value={numeroPedido}
          onChange={(e) => setNumeroPedido(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && buscar()}
        />
        <button className="btn-secundario" onClick={buscar} disabled={buscando}>
          {buscando ? "Buscando..." : "Buscar"}
        </button>
      </div>

      {erro && <p className="text-sm text-red-700 mb-4">{erro}</p>}

      {venda && (
        <div className="card p-5">
          <p className="font-display text-lg mb-1">
            Pedido #{venda.numero_pedido} — {venda.clientes?.nome || "Cliente"}
          </p>
          <p className="text-sm text-madeira-500 mb-3">Total: {formatarMoeda(venda.total)}</p>

          {venda.cancelada ? (
            <p className="text-sm font-semibold text-red-700">Esse pedido já está cancelado.</p>
          ) : (
            <>
              <div className="mb-4 space-y-1">
                {venda.venda_itens.map((item) => (
                  <p key={item.id} className="text-sm text-madeira-700">
                    {item.quantidade}x {item.nome_produto}
                    {item.variante ? ` — ${item.variante}` : ""}
                    {item.tipo_entrega === "pronta" ? " (volta pro estoque)" : " (encomenda, não mexe no estoque)"}
                  </p>
                ))}
              </div>

              <label className="block mb-4">
                <span className="text-xs text-madeira-600 mb-1 block">Motivo do cancelamento</span>
                <textarea
                  className="input-base"
                  rows={3}
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ex: cliente desistiu, produto com defeito, erro no cadastro..."
                />
              </label>

              <button
                className="btn-primario"
                style={{ backgroundColor: "#b91c1c" }}
                onClick={cancelar}
                disabled={cancelando}
              >
                {cancelando ? "Cancelando..." : "Cancelar nota e devolver ao estoque"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ==================== CANCELAR TROCA ==================== */
function AbaCancelarTroca() {
  const [numeroTroca, setNumeroTroca] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [troca, setTroca] = useState<TrocaGrupo | null>(null);
  const [motivo, setMotivo] = useState("");
  const [cancelando, setCancelando] = useState(false);
  const [erro, setErro] = useState("");

  async function buscar() {
    setErro("");
    setTroca(null);
    if (!numeroTroca.trim()) return;
    setBuscando(true);
    const { data, error } = await supabase
      .from("trocas_grupo")
      .select(
        "*, vendas(numero_pedido, clientes(nome)), trocas_devolvidos(*), trocas_novos(*)"
      )
      .eq("numero_troca", Number(numeroTroca))
      .maybeSingle();
    setBuscando(false);
    if (error || !data) {
      setErro("Troca não encontrada.");
      return;
    }
    setTroca(data as unknown as TrocaGrupo);
  }

  async function cancelar() {
    if (!troca) return;
    if (!motivo.trim()) {
      alert("Digite o motivo do cancelamento.");
      return;
    }
    if (
      !confirm(
        `Cancelar a troca #${troca.numero_troca}? O estoque volta ao que era antes da troca. Essa ação não pode ser desfeita.`
      )
    )
      return;

    setCancelando(true);
    try {
      const avisos: string[] = [];
      const devolvidos = (troca.trocas_devolvidos || []) as TrocaItemDevolvido[];
      const novos = (troca.trocas_novos || []) as TrocaItemNovo[];

      // Os itens "devolvidos" (que voltaram pro estoque na hora da troca)
      // precisam sair do estoque de novo — só se eram pronta entrega.
      // A troca não guarda o tipo_entrega original, então busca no item da
      // venda original.
      for (const item of devolvidos) {
        if (!item.produto_id) continue;
        const { data: itemOriginal } = await supabase
          .from("venda_itens")
          .select("tipo_entrega")
          .eq("id", item.venda_item_original_id)
          .maybeSingle();
        if (itemOriginal?.tipo_entrega !== "pronta") continue;

        let varianteId = item.variante_id;
        if (!varianteId && item.variante) {
          const { data: variantes } = await supabase
            .from("produto_variantes")
            .select("id, nome_variante")
            .eq("produto_id", item.produto_id);
          const nomeBase = item.variante.split(" — ")[0];
          const encontrada = variantes?.find((v) => v.nome_variante === nomeBase);
          if (encontrada) varianteId = encontrada.id;
        }
        await ajustarEstoqueLoja(supabase, troca.loja_id, item.produto_id, varianteId, -item.quantidade);
      }

      // Os itens "novos" (que saíram do estoque na hora da troca) precisam
      // voltar — só os que eram pronta entrega.
      for (const item of novos) {
        if (item.tipo_entrega !== "pronta") continue;
        await ajustarEstoqueLoja(supabase, troca.loja_id, item.produto_id, item.variante_id, item.quantidade);
      }

      // Desmarca os itens originais como "trocado" — voltam a valer como
      // itens normais da venda original.
      const idsOriginais = devolvidos.map((d) => d.venda_item_original_id);
      if (idsOriginais.length > 0) {
        await supabase.from("venda_itens").update({ trocado: false }).in("id", idsOriginais);
      }

      // Reverte o caixa — só se o turno da troca ainda estiver aberto.
      if (troca.turno_caixa_id && troca.diferenca !== 0 && troca.forma_pagamento_diferenca) {
        const { data: turnoAtual } = await supabase
          .from("turnos_caixa")
          .select("status, total_vendido, total_dinheiro, total_pix, total_debito, total_credito, total_devolvido")
          .eq("id", troca.turno_caixa_id)
          .maybeSingle();
        if (turnoAtual && turnoAtual.status === "aberto") {
          const totaisAtualizados: Record<string, number> = {};
          const diferencaCobrada = troca.valor_cobrado_diferenca ?? troca.diferenca;

          if (troca.diferenca > 0) {
            totaisAtualizados.total_vendido = Math.max((turnoAtual.total_vendido || 0) - diferencaCobrada, 0);
            const campoForma =
              troca.forma_pagamento_diferenca === "Dinheiro"
                ? "total_dinheiro"
                : troca.forma_pagamento_diferenca === "Pix"
                ? "total_pix"
                : troca.forma_pagamento_diferenca === "Débito"
                ? "total_debito"
                : troca.forma_pagamento_diferenca === "Crédito"
                ? "total_credito"
                : null;
            if (campoForma) {
              totaisAtualizados[campoForma] = Math.max(
                ((turnoAtual as Record<string, number>)[campoForma] || 0) - diferencaCobrada,
                0
              );
            }
          } else {
            totaisAtualizados.total_devolvido = Math.max(
              (turnoAtual.total_devolvido || 0) - Math.abs(troca.diferenca),
              0
            );
            if (troca.forma_pagamento_diferenca === "Dinheiro") {
              totaisAtualizados.total_dinheiro = (turnoAtual.total_dinheiro || 0) - troca.diferenca; // diferenca é negativa, então isso soma de volta
            }
          }
          await supabase.from("turnos_caixa").update(totaisAtualizados).eq("id", troca.turno_caixa_id);
        } else {
          avisos.push(
            "O turno de caixa dessa troca já está fechado — os totais do caixa não foram ajustados automaticamente, ajuste manualmente se precisar."
          );
        }
      }

      const { error: erroCancelar } = await supabase
        .from("trocas_grupo")
        .update({
          cancelada: true,
          motivo_cancelamento: motivo.trim(),
          cancelada_em: new Date().toISOString(),
        })
        .eq("id", troca.id);
      if (erroCancelar) throw erroCancelar;

      alert(
        `Troca #${troca.numero_troca} cancelada. O estoque foi ajustado de volta ao que era antes.` +
          (avisos.length > 0 ? "\n\nAtenção:\n" + avisos.join("\n") : "")
      );
      setTroca(null);
      setNumeroTroca("");
      setMotivo("");
    } catch (e) {
      alert("Erro ao cancelar: " + (e as Error).message);
    } finally {
      setCancelando(false);
    }
  }

  return (
    <div className="max-w-2xl mt-10">
      <h2 className="font-display text-xl mb-1">Cancelar troca</h2>
      <p className="text-sm text-madeira-600 mb-4">
        Cancela uma troca e devolve o estoque exatamente ao que era antes dela (os produtos devolvidos
        saem de novo, os produtos novos voltam). Pede o motivo do cancelamento.
      </p>

      <div className="flex gap-2 mb-4">
        <input
          className="input-base max-w-xs"
          placeholder="Número da troca"
          value={numeroTroca}
          onChange={(e) => setNumeroTroca(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && buscar()}
        />
        <button className="btn-secundario" onClick={buscar} disabled={buscando}>
          {buscando ? "Buscando..." : "Buscar"}
        </button>
      </div>

      {erro && <p className="text-sm text-red-700 mb-4">{erro}</p>}

      {troca && (
        <div className="card p-5">
          <p className="font-display text-lg mb-1">
            Troca #{troca.numero_troca} — {troca.vendas?.clientes?.nome || "Cliente"}
          </p>
          <p className="text-sm text-madeira-500 mb-3">
            Pedido original #{troca.vendas?.numero_pedido} · Diferença:{" "}
            {formatarMoeda(troca.valor_cobrado_diferenca ?? troca.diferenca)}
          </p>

          {troca.cancelada ? (
            <p className="text-sm font-semibold text-red-700">Essa troca já está cancelada.</p>
          ) : (
            <>
              <div className="mb-4 space-y-1">
                <p className="text-xs font-semibold text-madeira-600">Voltam pro estoque (devolvidos):</p>
                {(troca.trocas_devolvidos || []).map((item) => (
                  <p key={item.id} className="text-sm text-madeira-700">
                    {item.quantidade}x {item.produto_nome}
                    {item.variante ? ` — ${item.variante}` : ""}
                  </p>
                ))}
                <p className="text-xs font-semibold text-madeira-600 mt-2">Saem do estoque de novo (novos):</p>
                {(troca.trocas_novos || []).map((item) => (
                  <p key={item.id} className="text-sm text-madeira-700">
                    {item.quantidade}x {item.produto_nome}
                    {item.variante ? ` — ${item.variante}` : ""}
                  </p>
                ))}
              </div>

              <label className="block mb-4">
                <span className="text-xs text-madeira-600 mb-1 block">Motivo do cancelamento</span>
                <textarea
                  className="input-base"
                  rows={3}
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ex: troca feita por engano, erro no cadastro..."
                />
              </label>

              <button
                className="btn-primario"
                style={{ backgroundColor: "#b91c1c" }}
                onClick={cancelar}
                disabled={cancelando}
              >
                {cancelando ? "Cancelando..." : "Cancelar troca e ajustar o estoque"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
