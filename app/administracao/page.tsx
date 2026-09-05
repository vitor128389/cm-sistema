"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { formatarMoeda } from "@/lib/format";
import { useLoja } from "@/contexts/LojaContext";
import { carregarProdutosComEstoque, salvarEstoqueLoja } from "@/lib/produtos";
import { consultarCpf } from "@/lib/consultaCpf";
import type { Caixa, ProdutoComVariantes, TecidoCor, Usuario, Permissao, LojaCompleta } from "@/types";

type Aba = "lojas" | "caixas" | "estoque" | "usuarios" | "permissoes" | "tecidos" | "relatorio";

const TELAS = [
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
  preco5: "",
  preco7: "",
  preco14: "",
  custo5: "0",
  custo7: "0",
  custo14: "0",
  estoque5: "0",
  estoque7: "0",
  estoque14: "0",
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

  async function carregar() {
    const data = await carregarProdutosComEstoque(supabase, lojaAtual);
    setProdutos(data);
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lojaAtual]);

  const categorias = Array.from(new Set(produtos.map((p) => p.categoria)));

  // Categorias que usam opção de tecido (Suede/Linho/Veludo).
  // Qualquer categoria fora dessa lista (ex: Móveis para Sala) não mostra
  // os campos de tecido — só o estoque simples. "Camas" é tratada à parte,
  // com espessura de espuma (5/7/14cm).
  const CATEGORIAS_COM_TECIDO = [
    "sofás", "sofas",
    "poltronas",
    "cabeceiras",
    "puffs",
    "namoradeiras",
    "painéis", "paineis",
    "baús", "baus",
    "recamiers",
  ];

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

  async function excluirProduto(id: string, nome: string) {
    if (!confirm(`Excluir "${nome}" do catálogo? Isso remove o produto de TODAS as lojas — essa ação não pode ser desfeita.`)) return;
    const { error } = await supabase.from("produtos").delete().eq("id", id);
    if (error) alert("Erro: " + error.message);
    carregar();
  }

  function abrirEdicao(p: ProdutoComVariantes) {
    setEditandoId(p.id);
    const ehCamas = p.categoria.toLowerCase() === "camas";
    const precoBaseFallback = p.preco_venda > 0 ? String(Math.round((p.preco_venda / 1.1) * 100) / 100) : "";
    const novoForm = { ...FORM_VAZIO, nome: p.nome, categoria: p.categoria, custo: String(p.custo || 0) };
    if (ehCamas) {
      novoForm.preco5 = precoBaseFallback;
      novoForm.preco7 = precoBaseFallback;
      novoForm.preco14 = precoBaseFallback;
      novoForm.custo5 = String(p.custo || 0);
      novoForm.custo7 = String(p.custo || 0);
      novoForm.custo14 = String(p.custo || 0);
      p.produto_variantes.forEach((v) => {
        if (v.nome_variante === "5cm") {
          novoForm.preco5 = String(v.preco_avista);
          novoForm.estoque5 = String(v.estoque);
          novoForm.custo5 = String(v.custo || 0);
        }
        if (v.nome_variante === "7cm") {
          novoForm.preco7 = String(v.preco_avista);
          novoForm.estoque7 = String(v.estoque);
          novoForm.custo7 = String(v.custo || 0);
        }
        if (v.nome_variante === "14cm") {
          novoForm.preco14 = String(v.preco_avista);
          novoForm.estoque14 = String(v.estoque);
          novoForm.custo14 = String(v.custo || 0);
        }
      });
    } else if (p.tipo_precificacao === "tecido" || p.produto_variantes.length > 0) {
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
    const ehCamas = categoriaFinal.toLowerCase() === "camas";
    const custoNum = parseFloat(form.custo) || 0;

    if (ehCamas) {
      const precos: Record<string, number> = {};
      if (parseFloat(form.preco5) > 0) precos["5cm"] = parseFloat(form.preco5);
      if (parseFloat(form.preco7) > 0) precos["7cm"] = parseFloat(form.preco7);
      if (parseFloat(form.preco14) > 0) precos["14cm"] = parseFloat(form.preco14);
      if (Object.keys(precos).length === 0) {
        alert("Preencha o preço de pelo menos uma espessura.");
        return;
      }
      const precoBase = Object.values(precos)[0];

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

      const estoques: Record<string, string> = { "5cm": form.estoque5, "7cm": form.estoque7, "14cm": form.estoque14 };
      const custos: Record<string, string> = { "5cm": form.custo5, "7cm": form.custo7, "14cm": form.custo14 };
      for (const [nomeVar, valor] of Object.entries(precos)) {
        const { data: variante, error: erroVariante } = await supabase
          .from("produto_variantes")
          .upsert(
            { produto_id: produtoId, nome_variante: nomeVar, preco_avista: valor, custo: parseFloat(custos[nomeVar]) || 0 },
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
            parseInt(estoques[nomeVar]) || 0
          );
          if (erroEstoque) {
            alert(`Erro ao salvar o estoque de ${nomeVar}: ` + erroEstoque.message);
            return;
          }
        }
      }
    } else {
      const precos: Record<string, number> = {};
      if (parseFloat(form.precoSuede) > 0) precos["Suede"] = parseFloat(form.precoSuede);
      if (parseFloat(form.precoLinho) > 0) precos["Linho"] = parseFloat(form.precoLinho);
      if (parseFloat(form.precoVeludo) > 0) precos["Veludo"] = parseFloat(form.precoVeludo);

      const temTecido = Object.keys(precos).length > 0;
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
        <div className="card p-5 mb-6">
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
                <input
                  className="input-base mt-2"
                  value={form.categoriaNova}
                  onChange={(e) => setForm({ ...form, categoriaNova: e.target.value })}
                  placeholder="Nome da nova categoria"
                  autoFocus
                />
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
            const categoriaAtual = (form.categoria === "__nova__" ? form.categoriaNova : form.categoria)
              .trim()
              .toLowerCase();
            const modoCampos: "camas" | "tecido" | "simples" =
              categoriaAtual === "camas"
                ? "camas"
                : CATEGORIAS_COM_TECIDO.includes(categoriaAtual)
                ? "tecido"
                : "simples";

            if (modoCampos === "camas") {
              return (
                <div className="grid grid-cols-3 gap-3 mb-3">
                  {(["5", "7", "14"] as const).map((esp) => (
                    <div key={esp}>
                      <p className="text-xs font-semibold text-madeira-700 mb-1">{esp}cm</p>
                      <label className="block mb-2">
                        <span className="text-xs text-madeira-600 mb-1 block">Preço à vista (R$)</span>
                        <input
                          className="input-base"
                          type="number"
                          value={form[`preco${esp}` as "preco5"]}
                          onChange={(e) => setForm({ ...form, [`preco${esp}`]: e.target.value })}
                        />
                      </label>
                      <label className="block mb-2">
                        <span className="text-xs text-madeira-600 mb-1 block">Custo (R$)</span>
                        <input
                          className="input-base"
                          type="number"
                          value={form[`custo${esp}` as "custo5"]}
                          onChange={(e) => setForm({ ...form, [`custo${esp}`]: e.target.value })}
                        />
                      </label>
                      <label className="block">
                        <span className="text-xs text-madeira-600 mb-1 block">Estoque</span>
                        <input
                          className="input-base"
                          type="number"
                          value={form[`estoque${esp}` as "estoque5"]}
                          onChange={(e) => setForm({ ...form, [`estoque${esp}`]: e.target.value })}
                        />
                      </label>
                    </div>
                  ))}
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
                <td className="px-4 py-2">{formatarMoeda(p.custo || 0)}</td>
                <td className="px-4 py-2">{formatarMoeda(p.preco_venda || 0)}</td>
                <td className="px-4 py-2">
                  {p.produto_variantes.length > 0 ? (
                    p.produto_variantes.map((v) => (
                      <div key={v.id} className="flex items-center gap-2 mb-1">
                        <span className="text-xs w-24">
                          {v.nome_variante}
                          <span className="block text-madeira-400">
                            custo {formatarMoeda(v.custo || 0)} · venda {formatarMoeda(v.preco_avista || 0)}
                          </span>
                        </span>
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
    </div>
  );
}

/* ==================== TECIDOS E CORES ==================== */
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
