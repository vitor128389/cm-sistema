"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { formatarMoeda, formatarData } from "@/lib/format";
import { useLoja } from "@/contexts/LojaContext";
import type { ClienteCompleto, Venda } from "@/types";

interface ClienteResumo extends ClienteCompleto {
  qtdCompras: number;
  valorTotal: number;
}

const FORM_VAZIO = {
  nome: "",
  cpf: "",
  telefone: "",
  endereco: "",
  numero: "",
  complemento: "",
  cidade: "",
};

export default function ClientesPage() {
  const { lojaAtual } = useLoja();
  const [clientes, setClientes] = useState<ClienteResumo[]>([]);
  const [busca, setBusca] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const [historico, setHistorico] = useState<Venda[]>([]);
  const [carregandoHistorico, setCarregandoHistorico] = useState(false);

  const [mostrarForm, setMostrarForm] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState(FORM_VAZIO);

  async function carregar() {
    setCarregando(true);
    let queryClientes = supabase.from("clientes").select("*").order("nome");
    if (lojaAtual) queryClientes = queryClientes.eq("loja_id", lojaAtual);
    const { data: listaClientes } = await queryClientes;
    const { data: listaVendas } = await supabase.from("vendas").select("id, cliente_id, total");

    const resumo = (listaClientes || []).map((c) => {
      const vendasDoCliente = (listaVendas || []).filter((v) => v.cliente_id === c.id);
      return {
        ...c,
        qtdCompras: vendasDoCliente.length,
        valorTotal: vendasDoCliente.reduce((s, v) => s + (v.total || 0), 0),
      } as ClienteResumo;
    });
    setClientes(resumo);
    setCarregando(false);
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lojaAtual]);

  async function abrirCliente(id: string) {
    if (abertoId === id) {
      setAbertoId(null);
      return;
    }
    setAbertoId(id);
    setCarregandoHistorico(true);
    const { data } = await supabase
      .from("vendas")
      .select("*, venda_itens(*)")
      .eq("cliente_id", id)
      .order("criado_em", { ascending: false });
    setHistorico((data || []) as unknown as Venda[]);
    setCarregandoHistorico(false);
  }

  function abrirNovo() {
    setForm(FORM_VAZIO);
    setEditandoId(null);
    setMostrarForm(true);
  }

  function abrirEdicao(c: ClienteResumo, e: React.MouseEvent) {
    e.stopPropagation();
    setForm({
      nome: c.nome || "",
      cpf: c.cpf || "",
      telefone: c.telefone || "",
      endereco: c.endereco || "",
      numero: c.numero || "",
      complemento: c.complemento || "",
      cidade: (c as { cidade?: string | null }).cidade || "",
    });
    setEditandoId(c.id);
    setMostrarForm(true);
  }

  async function salvarCliente() {
    if (!form.nome.trim()) {
      alert("Preencha o nome do cliente.");
      return;
    }
    if (!editandoId && !lojaAtual) {
      alert("Selecione uma loja ativa no menu lateral antes de cadastrar um cliente.");
      return;
    }
    const dados = {
      nome: form.nome.trim(),
      cpf: form.cpf.replace(/\D/g, "") || null,
      telefone: form.telefone || null,
      endereco: form.endereco || null,
      numero: form.numero || null,
      complemento: form.complemento || null,
      cidade: form.cidade || null,
    };

    if (editandoId) {
      const { error } = await supabase.from("clientes").update(dados).eq("id", editandoId);
      if (error) {
        alert("Erro: " + error.message);
        return;
      }
    } else {
      const { error } = await supabase.from("clientes").insert({ ...dados, loja_id: lojaAtual });
      if (error) {
        alert("Erro: " + error.message);
        return;
      }
    }
    setMostrarForm(false);
    setForm(FORM_VAZIO);
    setEditandoId(null);
    carregar();
  }

  async function excluirCliente(id: string, nome: string) {
    if (!confirm(`Tem certeza que deseja excluir "${nome}"?`)) return;
    const { error } = await supabase.from("clientes").delete().eq("id", id);
    if (error) {
      if (error.code === "23503") {
        alert(
          `"${nome}" tem vendas registradas no histórico, então não pode ser excluído — isso quebraria os pedidos antigos. Se precisar corrigir algo, use "Editar".`
        );
      } else {
        alert("Erro ao excluir: " + error.message);
      }
      return;
    }
    carregar();
  }

  const clientesFiltrados = clientes.filter(
    (c) =>
      !busca ||
      c.nome.toLowerCase().includes(busca.toLowerCase()) ||
      (c.cpf || "").includes(busca) ||
      (c.telefone || "").includes(busca)
  );

  return (
    <div className="p-8">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="font-display text-3xl text-madeira-900">Clientes</h1>
          <p className="text-madeira-600 mt-1">Todos os clientes cadastrados, com histórico de compras.</p>
        </div>
        <button className="btn-primario" onClick={mostrarForm ? () => setMostrarForm(false) : abrirNovo}>
          {mostrarForm ? "Cancelar" : "+ Novo cliente"}
        </button>
      </div>

      {mostrarForm && (
        <div className="card p-5 mb-6">
          <p className="font-display text-lg mb-4">{editandoId ? "Editar cliente" : "Novo cliente"}</p>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <label className="block">
              <span className="text-xs text-madeira-600 mb-1 block">Nome</span>
              <input className="input-base" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            </label>
            <label className="block">
              <span className="text-xs text-madeira-600 mb-1 block">CPF</span>
              <input className="input-base" value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} />
            </label>
            <label className="block">
              <span className="text-xs text-madeira-600 mb-1 block">Telefone</span>
              <input className="input-base" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
            </label>
            <label className="block">
              <span className="text-xs text-madeira-600 mb-1 block">Cidade</span>
              <input className="input-base" value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} />
            </label>
            <label className="block">
              <span className="text-xs text-madeira-600 mb-1 block">Endereço</span>
              <input className="input-base" value={form.endereco} onChange={(e) => setForm({ ...form, endereco: e.target.value })} />
            </label>
            <label className="block">
              <span className="text-xs text-madeira-600 mb-1 block">Número</span>
              <input className="input-base" value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} />
            </label>
            <label className="block">
              <span className="text-xs text-madeira-600 mb-1 block">Complemento</span>
              <input className="input-base" value={form.complemento} onChange={(e) => setForm({ ...form, complemento: e.target.value })} />
            </label>
          </div>
          <button className="btn-primario" onClick={salvarCliente}>
            {editandoId ? "Salvar edição" : "Cadastrar cliente"}
          </button>
        </div>
      )}

      <label className="block max-w-sm mb-6">
        <span className="text-xs text-madeira-600 mb-1 block">Buscar cliente</span>
        <input
          className="input-base"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Nome, CPF ou telefone..."
        />
      </label>

      {carregando ? (
        <p className="text-madeira-500 text-sm">Carregando...</p>
      ) : clientesFiltrados.length === 0 ? (
        <div className="card p-8 text-center text-madeira-500 text-sm">Nenhum cliente encontrado.</div>
      ) : (
        <div className="space-y-2">
          {clientesFiltrados.map((c) => (
            <div key={c.id} className="card overflow-hidden">
              <div
                className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-madeira-50"
                onClick={() => abrirCliente(c.id)}
              >
                <div>
                  <p className="font-display text-lg text-madeira-900">{c.nome}</p>
                  <p className="text-xs text-madeira-500">
                    {c.cpf || "sem CPF"} · {c.telefone || "sem telefone"}
                    {c.endereco ? ` · ${c.endereco}` : ""}
                  </p>
                  <p className="text-xs text-madeira-400">Cliente desde {formatarData(c.criado_em)}</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-sm text-madeira-600">{c.qtdCompras} compra(s)</p>
                    <p className="font-display text-lg">{formatarMoeda(c.valorTotal)}</p>
                  </div>
                  <button className="btn-secundario text-xs px-2 py-1" onClick={(e) => abrirEdicao(c, e)}>
                    Editar
                  </button>
                  <button
                    className="text-xs text-red-700 px-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      excluirCliente(c.id, c.nome);
                    }}
                  >
                    Excluir
                  </button>
                </div>
              </div>

              {abertoId === c.id && (
                <div className="border-t border-estofado-100 p-4 bg-madeira-50">
                  {carregandoHistorico ? (
                    <p className="text-sm text-madeira-500">Carregando histórico...</p>
                  ) : historico.length === 0 ? (
                    <p className="text-sm text-madeira-500">Nenhuma compra registrada ainda.</p>
                  ) : (
                    <div className="space-y-3">
                      {historico.map((v) => (
                        <div key={v.id} className="card p-4">
                          <div className="flex justify-between items-center mb-2">
                            <p className="font-display">
                              Pedido #{v.numero_pedido} — {formatarData(v.criado_em)}
                            </p>
                            <p className="font-display">{formatarMoeda(v.total)}</p>
                          </div>
                          <p className="text-xs text-madeira-500 mb-2">
                            {v.forma_pagamento}
                            {v.prazo_entrega_maximo ? ` · prazo: ${formatarData(v.prazo_entrega_maximo)}` : ""}
                          </p>
                          <ul className="text-sm text-madeira-600 space-y-1">
                            {(v.venda_itens || []).map((item) => (
                              <li key={item.id}>
                                {item.quantidade}x {item.nome_produto}
                                {item.variante ? ` — ${item.variante}` : ""} —{" "}
                                <span
                                  className={
                                    item.tipo_entrega === "encomenda" ? "tag-encomenda" : "text-green-700"
                                  }
                                >
                                  {item.tipo_entrega === "encomenda"
                                    ? item.status_entrega === "entregue"
                                      ? "ENCOMENDA (entregue)"
                                      : "ENCOMENDA"
                                    : "PRONTA ENTREGA"}
                                </span>{" "}
                                — {formatarMoeda(item.total)}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
