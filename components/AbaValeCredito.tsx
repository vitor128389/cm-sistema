"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useLoja } from "@/contexts/LojaContext";
import { formatarMoeda } from "@/lib/format";
import { registrarAuditoria } from "@/lib/auditoria";
import { definirTamanhoPagina } from "@/lib/imprimir";
import ComprovanteVale from "@/components/ComprovanteVale";
import type { LojaCompleta } from "@/types";

type Vale = {
  id: string;
  codigo: string;
  cliente_nome: string;
  observacao: string;
  valor: number;
  saldo: number;
  status: "ativo" | "usado" | "cancelado";
  criado_em: string;
};

const LETRAS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem O/0/I/1 pra não confundir
function gerarCodigo(): string {
  let c = "";
  for (let i = 0; i < 6; i++) c += LETRAS[Math.floor(Math.random() * LETRAS.length)];
  return `VC-${c}`;
}
const num = (t: string) => parseFloat(t.replace(/\./g, "").replace(",", ".")) || 0;

export default function AbaValeCredito() {
  const { lojaAtual } = useLoja();
  const [vales, setVales] = useState<Vale[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [cliente, setCliente] = useState("");
  const [valor, setValor] = useState("");
  const [obs, setObs] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState("");
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"ativo" | "todos">("ativo");
  const [baixaId, setBaixaId] = useState<string | null>(null);
  const [baixaValor, setBaixaValor] = useState("");
  const [imprimindo, setImprimindo] = useState<Vale | null>(null);
  const [lojaInfo, setLojaInfo] = useState<LojaCompleta | null>(null);

  // Mesma impressão das notinhas: A4 com Via da loja + Via do cliente na mesma folha
  async function imprimir(vale: Vale) {
    if (lojaAtual) {
      const { data } = await supabase.from("lojas").select("*").eq("id", lojaAtual).maybeSingle();
      setLojaInfo((data as LojaCompleta | null) || null);
    }
    setImprimindo(vale);
    definirTamanhoPagina("a4");
    setTimeout(() => window.print(), 150);
  }

  const carregar = useCallback(async () => {
    const { data } = await supabase
      .from("vales_credito")
      .select("id, codigo, cliente_nome, observacao, valor, saldo, status, criado_em")
      .order("criado_em", { ascending: false })
      .limit(500);
    setVales(((data || []) as Vale[]).map((v) => ({ ...v, valor: Number(v.valor), saldo: Number(v.saldo) })));
    setCarregando(false);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function criar() {
    const v = Math.round(num(valor) * 100) / 100;
    if (!cliente.trim()) return alert("Digite o nome do cliente.");
    if (v <= 0) return alert("Digite o valor do vale.");
    setSalvando(true);
    let criado: { codigo: string } | null = null;
    let erroFinal = "";
    for (let t = 0; t < 5 && !criado; t++) {
      const codigo = gerarCodigo();
      const { error } = await supabase.from("vales_credito").insert({
        codigo,
        cliente_nome: cliente.trim(),
        observacao: obs.trim(),
        valor: v,
        saldo: v,
        loja_emissao_id: lojaAtual || null,
      });
      if (!error) criado = { codigo };
      else if (!/duplicate|unique/i.test(error.message)) {
        erroFinal = error.message;
        break;
      }
    }
    setSalvando(false);
    if (!criado) return alert("Erro ao criar o vale (só administrador pode): " + (erroFinal || "tente de novo"));
    registrarAuditoria({
      categoria: "Outros",
      acao: "criacao",
      registroTipo: "vale_credito",
      registroNome: criado.codigo,
      descricao: `Vale crédito ${criado.codigo} de ${formatarMoeda(v)} criado para ${cliente.trim()}`,
    });
    setMsg(`Vale ${criado.codigo} criado: ${formatarMoeda(v)} para ${cliente.trim()}.`);
    setTimeout(() => setMsg(""), 8000);
    setCliente("");
    setValor("");
    setObs("");
    await carregar();
  }

  async function darBaixa(vale: Vale) {
    const usar = Math.round(num(baixaValor) * 100) / 100;
    if (usar <= 0) return alert("Digite quanto foi usado.");
    if (usar > vale.saldo + 0.001) return alert(`O saldo do vale é só ${formatarMoeda(vale.saldo)}.`);
    const novoSaldo = Math.round((vale.saldo - usar) * 100) / 100;
    const { data, error } = await supabase
      .from("vales_credito")
      .update({ saldo: novoSaldo, status: novoSaldo <= 0 ? "usado" : "ativo", atualizado_em: new Date().toISOString() })
      .eq("id", vale.id)
      .eq("saldo", vale.saldo) // só baixa se o saldo ainda é o que a tela mostra
      .select("id");
    if (error || !data || data.length === 0) {
      alert(error ? "Erro: " + error.message : "O saldo desse vale mudou. Atualizei a lista, tente de novo.");
      await carregar();
      return;
    }
    registrarAuditoria({
      categoria: "Outros",
      acao: "alteracao",
      registroTipo: "vale_credito",
      registroId: vale.id,
      registroNome: vale.codigo,
      descricao: `Baixa de ${formatarMoeda(usar)} no vale ${vale.codigo} (${vale.cliente_nome}); saldo ${formatarMoeda(novoSaldo)}`,
    });
    setBaixaId(null);
    setBaixaValor("");
    await carregar();
  }

  async function cancelar(vale: Vale) {
    if (!confirm(`Cancelar o vale ${vale.codigo} (saldo ${formatarMoeda(vale.saldo)})? Ele não poderá mais ser usado.`)) return;
    const { error } = await supabase
      .from("vales_credito")
      .update({ status: "cancelado", atualizado_em: new Date().toISOString() })
      .eq("id", vale.id);
    if (error) return alert("Erro: " + error.message);
    registrarAuditoria({
      categoria: "Outros",
      acao: "cancelamento",
      registroTipo: "vale_credito",
      registroId: vale.id,
      registroNome: vale.codigo,
      descricao: `Vale ${vale.codigo} (${vale.cliente_nome}) cancelado com saldo ${formatarMoeda(vale.saldo)}`,
    });
    await carregar();
  }

  const lista = vales.filter((v) => {
    if (filtro === "ativo" && v.status !== "ativo") return false;
    const b = busca.trim().toLowerCase();
    return !b || v.codigo.toLowerCase().includes(b) || v.cliente_nome.toLowerCase().includes(b);
  });
  const totalAberto = vales.filter((v) => v.status === "ativo").reduce((s, v) => s + v.saldo, 0);

  return (
    <div className="max-w-4xl">
      <h2 className="font-display text-xl text-madeira-900 mb-1">Vale crédito</h2>
      <p className="text-sm text-madeira-600 mb-5">
        Crie um vale com o valor e o nome do cliente. Ele ganha um código e vale em todas as lojas. Quando o cliente usar,
        dê baixa aqui (pode ser só uma parte do valor). Só administrador cria e altera.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
        <label className="block md:col-span-2">
          <span className="text-xs text-madeira-600 mb-1 block">Nome do cliente</span>
          <input className="input-base" value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Ex.: Maria da Silva" />
        </label>
        <label className="block">
          <span className="text-xs text-madeira-600 mb-1 block">Valor do vale (R$)</span>
          <input className="input-base" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" />
        </label>
        <label className="block">
          <span className="text-xs text-madeira-600 mb-1 block">Observação (opcional)</span>
          <input className="input-base" value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: troca do sofá" />
        </label>
      </div>
      <div className="flex items-center gap-3 mb-8">
        <button className="btn-primario" onClick={criar} disabled={salvando}>
          {salvando ? "Criando..." : "Criar vale crédito"}
        </button>
        {msg && <span className="text-sm text-green-700 font-medium">{msg}</span>}
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-3">
        <input className="input-base max-w-xs" placeholder="Buscar por código ou cliente" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <select className="input-base max-w-[180px]" value={filtro} onChange={(e) => setFiltro(e.target.value as "ativo" | "todos")}>
          <option value="ativo">Só com saldo</option>
          <option value="todos">Todos</option>
        </select>
        <span className="text-sm text-madeira-600">
          Em aberto: <strong>{formatarMoeda(totalAberto)}</strong>
        </span>
      </div>

      {carregando ? (
        <p className="text-madeira-500">Carregando...</p>
      ) : lista.length === 0 ? (
        <p className="text-madeira-500 text-sm">Nenhum vale encontrado.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-madeira-600 border-b border-estofado-100">
                <th className="py-2 pr-3">Código</th>
                <th className="py-2 pr-3">Cliente</th>
                <th className="py-2 pr-3">Criado</th>
                <th className="py-2 pr-3 text-right">Valor</th>
                <th className="py-2 pr-3 text-right">Saldo</th>
                <th className="py-2 pr-3">Situação</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {lista.map((v) => (
                <tr key={v.id} className="border-b border-estofado-100 align-top">
                  <td className="py-2 pr-3 font-mono font-semibold">{v.codigo}</td>
                  <td className="py-2 pr-3">
                    {v.cliente_nome}
                    {v.observacao && <span className="block text-xs text-madeira-500">{v.observacao}</span>}
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap">{new Date(v.criado_em).toLocaleDateString("pt-BR")}</td>
                  <td className="py-2 pr-3 text-right">{formatarMoeda(v.valor)}</td>
                  <td className="py-2 pr-3 text-right font-semibold">{formatarMoeda(v.saldo)}</td>
                  <td className="py-2 pr-3">
                    <span className={v.status === "ativo" ? "text-green-700" : v.status === "usado" ? "text-madeira-500" : "text-red-600"}>
                      {v.status === "ativo" ? "Com saldo" : v.status === "usado" ? "Usado" : "Cancelado"}
                    </span>
                  </td>
                  <td className="py-2">
                    {v.status !== "ativo" && (
                      <button className="text-madeira-700 underline" onClick={() => imprimir(v)}>
                        🖨 Imprimir
                      </button>
                    )}
                    {v.status === "ativo" &&
                      (baixaId === v.id ? (
                        <span className="flex items-center gap-2">
                          <input
                            className="input-base w-24"
                            inputMode="decimal"
                            autoFocus
                            placeholder="Valor usado"
                            value={baixaValor}
                            onChange={(e) => setBaixaValor(e.target.value)}
                          />
                          <button className="btn-primario" onClick={() => darBaixa(v)}>OK</button>
                          <button className="text-madeira-500 text-xs" onClick={() => setBaixaId(null)}>fechar</button>
                        </span>
                      ) : (
                        <span className="flex items-center gap-3 whitespace-nowrap">
                          <button className="text-madeira-700 underline" onClick={() => imprimir(v)}>
                            🖨 Imprimir
                          </button>
                          <button
                            className="text-madeira-700 underline"
                            onClick={() => {
                              setBaixaId(v.id);
                              setBaixaValor(String(v.saldo).replace(".", ","));
                            }}
                          >
                            Dar baixa
                          </button>
                          <button className="text-red-600 underline" onClick={() => cancelar(v)}>Cancelar</button>
                        </span>
                      ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div id="area-impressao">
        {imprimindo && <ComprovanteVale vale={imprimindo} loja={lojaInfo} />}
      </div>
    </div>
  );
}
