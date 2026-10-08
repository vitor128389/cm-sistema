"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { formatarMoeda } from "@/lib/format";
import { useLoja } from "@/contexts/LojaContext";
import { chamarFiscal, type NotaFiscal } from "@/lib/fiscalCliente";

interface VendaFiscal {
  id: string;
  numero_pedido: number;
  loja_id: string;
  total: number;
  forma_pagamento: string;
  cancelada: boolean | null;
  criado_em: string;
  clientes: { nome: string; cpf: string | null } | null;
  venda_itens: { id: string; nome_produto: string; variante: string | null; quantidade: number; total: number; trocado?: boolean }[];
}

interface LojaFiscal {
  nome: string;
  fiscal_ativo: boolean;
  fiscal_ambiente: string;
}

interface LinhaHistorico extends NotaFiscal {
  vendas: { numero_pedido: number } | null;
}

const ROTULO_STATUS: Record<NotaFiscal["status"], string> = {
  autorizada: "Autorizada",
  processando: "Processando",
  erro: "Rejeitada",
  cancelada: "Cancelada",
};
const COR_STATUS: Record<NotaFiscal["status"], string> = {
  autorizada: "bg-green-50 text-green-700",
  processando: "bg-amber-50 text-amber-700",
  erro: "bg-red-50 text-red-700",
  cancelada: "bg-gray-100 text-gray-600",
};

export default function FiscalPage() {
  const { lojaAtual } = useLoja();
  const [loja, setLoja] = useState<LojaFiscal | null>(null);
  const [pedido, setPedido] = useState("");
  const [venda, setVenda] = useState<VendaFiscal | null>(null);
  const [notas, setNotas] = useState<NotaFiscal[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState("");
  const [historico, setHistorico] = useState<LinhaHistorico[]>([]);

  useEffect(() => {
    setVenda(null);
    setNotas([]);
    setAviso("");
    if (!lojaAtual) {
      setLoja(null);
      setHistorico([]);
      return;
    }
    supabase
      .from("lojas")
      .select("nome, fiscal_ativo, fiscal_ambiente")
      .eq("id", lojaAtual)
      .maybeSingle()
      .then(({ data }) => setLoja((data as LojaFiscal) || null));
    carregarHistorico();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lojaAtual]);

  async function carregarHistorico() {
    if (!lojaAtual) return;
    const { data } = await supabase
      .from("notas_fiscais")
      .select("*, vendas(numero_pedido)")
      .eq("loja_id", lojaAtual)
      .order("criado_em", { ascending: false })
      .limit(20);
    setHistorico((data || []) as unknown as LinhaHistorico[]);
  }

  async function buscar(numero?: string) {
    const n = parseInt((numero ?? pedido).replace(/\D/g, ""), 10);
    setAviso("");
    if (!lojaAtual) {
      setAviso("Escolha uma loja no menu lateral.");
      return;
    }
    if (!n) {
      setAviso("Digite o número do pedido.");
      return;
    }
    setBuscando(true);
    setVenda(null);
    setNotas([]);
    const { data } = await supabase
      .from("vendas")
      .select("id, numero_pedido, loja_id, total, forma_pagamento, cancelada, criado_em, clientes(nome, cpf), venda_itens(id, nome_produto, variante, quantidade, total, trocado)")
      .eq("numero_pedido", n)
      .eq("loja_id", lojaAtual)
      .maybeSingle();
    if (!data) {
      setAviso(`Pedido #${n} não encontrado nessa loja.`);
      setBuscando(false);
      return;
    }
    const v = data as unknown as VendaFiscal;
    setVenda(v);
    await carregarNotas(v.id);
    setBuscando(false);
  }

  async function carregarNotas(vendaId: string) {
    const { data } = await supabase
      .from("notas_fiscais")
      .select("*")
      .eq("venda_id", vendaId)
      .order("criado_em", { ascending: false });
    setNotas((data || []) as NotaFiscal[]);
  }

  // só vale a nota do ambiente atual da loja (nota de teste não conta em produção)
  const notasValidas = notas.filter((n) => !loja || n.ambiente === loja.fiscal_ambiente);
  const vigente = notasValidas.find((n) => n.status === "autorizada" || n.status === "processando");
  const ultimaComErro = notasValidas.find((n) => n.status === "erro");
  const real = loja?.fiscal_ambiente === "producao";

  async function acao(rota: "emitir" | "consultar" | "cancelar", corpo: Record<string, unknown>) {
    if (!venda) return;
    setOcupado(true);
    setAviso("");
    try {
      const nota = await chamarFiscal(rota, corpo);
      await carregarNotas(venda.id);
      await carregarHistorico();
      if (nota.status === "erro") setAviso("A nota foi rejeitada: " + (nota.mensagem || "sem detalhes"));
      else if (nota.status === "processando") setAviso("A SEFAZ ainda está processando. Clique em Atualizar em instantes.");
      else if (rota === "emitir" && nota.status === "autorizada") setAviso("Nota autorizada ✓");
    } catch (e) {
      setAviso((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  function emitir() {
    if (!venda) return;
    const texto = real
      ? `ATENÇÃO: isso emite uma NOTA FISCAL REAL (valor fiscal, vai para a SEFAZ) do pedido #${venda.numero_pedido}, no valor de ${formatarMoeda(venda.total)}. Confirmar?`
      : `Emitir nota fiscal de TESTE (sem valor fiscal) do pedido #${venda.numero_pedido}?`;
    if (!confirm(texto)) return;
    acao("emitir", { vendaId: venda.id });
  }

  function cancelar() {
    if (!vigente) return;
    const motivo = prompt("Motivo do cancelamento da nota fiscal (mínimo 15 caracteres):");
    if (!motivo) return;
    acao("cancelar", { notaId: vigente.id, justificativa: motivo });
  }

  const fiscalLigado = !!loja?.fiscal_ativo;

  return (
    <div className="p-4 md:p-8 max-w-4xl">
      <h1 className="font-display text-3xl text-madeira-900">Emissões Fiscais</h1>
      <p className="text-madeira-600 mt-1 mb-5">
        Digite o número do pedido para emitir, consultar, imprimir ou cancelar a nota fiscal.
      </p>

      {loja && !fiscalLigado && (
        <div className="card p-4 mb-4 text-sm text-amber-800 bg-amber-50">
          A loja <strong>{loja.nome}</strong> ainda não está liberada para emitir nota fiscal.
        </div>
      )}
      {loja && fiscalLigado && (
        <p className="text-xs mb-3">
          <span className={`px-2 py-1 rounded font-medium ${real ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-700"}`}>
            {loja.nome} — {real ? "PRODUÇÃO (notas reais)" : "HOMOLOGAÇÃO (teste, sem valor fiscal)"}
          </span>
        </p>
      )}

      <form
        className="flex gap-2 mb-4"
        onSubmit={(e) => {
          e.preventDefault();
          buscar();
        }}
      >
        <input
          className="input-base max-w-[220px]"
          inputMode="numeric"
          placeholder="Nº do pedido (ex.: 777)"
          value={pedido}
          onChange={(e) => setPedido(e.target.value)}
        />
        <button className="btn-primario" type="submit" disabled={buscando}>
          {buscando ? "Buscando..." : "Buscar"}
        </button>
      </form>

      {aviso && <div className="card p-3 mb-4 text-sm text-madeira-800">{aviso}</div>}

      {venda && (
        <div className="card p-5 mb-6">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
            <div>
              <p className="font-display text-xl text-madeira-900">
                Pedido #{venda.numero_pedido} — {venda.clientes?.nome || "Cliente"}
              </p>
              <p className="text-xs text-madeira-500">
                {new Date(venda.criado_em).toLocaleString("pt-BR")} · {venda.forma_pagamento}
                {venda.clientes?.cpf ? " · CPF cadastrado" : " · sem CPF (consumidor não identificado)"}
              </p>
            </div>
            <p className="font-display text-2xl text-madeira-900">{formatarMoeda(venda.total)}</p>
          </div>

          <ul className="mt-3 text-sm text-madeira-600 space-y-1">
            {venda.venda_itens
              .filter((i) => !i.trocado)
              .map((i) => (
                <li key={i.id}>
                  {i.quantidade}x {i.nome_produto}
                  {i.variante ? ` — ${i.variante}` : ""}
                </li>
              ))}
          </ul>

          {venda.cancelada && <p className="mt-3 text-sm text-red-700 font-medium">Venda cancelada: não emite nota.</p>}

          {!venda.cancelada && (
            <div className="mt-4 border-t border-madeira-100 pt-4">
              <p className="text-sm font-medium text-madeira-700 mb-2">Nota fiscal de consumidor (NFC-e)</p>

              {vigente ? (
                <p className="mb-3">
                  <span className={`text-xs px-2 py-1 rounded font-medium ${COR_STATUS[vigente.status]}`}>
                    {ROTULO_STATUS[vigente.status]}
                    {vigente.numero ? ` · nº ${vigente.numero} série ${vigente.serie ?? ""}` : ""}
                    {vigente.ambiente === "homologacao" ? " · TESTE" : ""}
                  </span>
                </p>
              ) : ultimaComErro ? (
                <p className="mb-3 text-xs text-red-700">Última tentativa rejeitada: {ultimaComErro.mensagem || "sem detalhes"}</p>
              ) : (
                <p className="mb-3 text-xs text-madeira-500">Nenhuma nota emitida para esse pedido.</p>
              )}

              <div className="flex flex-wrap gap-2">
                {!vigente && fiscalLigado && (
                  <button
                    className="text-sm px-3 py-2 rounded bg-blue-700 text-white font-medium hover:bg-blue-800 disabled:opacity-50"
                    disabled={ocupado}
                    onClick={emitir}
                  >
                    {ocupado ? "Emitindo..." : real ? "🧾 Emitir NFC-e (REAL)" : "🧾 Emitir NFC-e (teste)"}
                  </button>
                )}
                {vigente?.status === "processando" && (
                  <button className="btn-secundario text-sm" disabled={ocupado} onClick={() => acao("consultar", { notaId: vigente.id })}>
                    Atualizar status
                  </button>
                )}
                {vigente?.status === "autorizada" && vigente.url_danfe && (
                  <a className="btn-secundario text-sm" href={vigente.url_danfe} target="_blank" rel="noreferrer">
                    🖨 Abrir / imprimir DANFE
                  </a>
                )}
                {vigente?.status === "autorizada" && vigente.url_xml && (
                  <a className="btn-secundario text-sm" href={vigente.url_xml} target="_blank" rel="noreferrer">
                    ⬇ XML
                  </a>
                )}
                {vigente?.status === "autorizada" && (
                  <button className="text-sm px-3 py-2 rounded border border-red-300 text-red-700 hover:bg-red-50" disabled={ocupado} onClick={cancelar}>
                    Cancelar nota
                  </button>
                )}
                <button
                  className="btn-secundario text-sm opacity-50 cursor-not-allowed"
                  disabled
                  title="Emissão de NF-e (modelo 55, com dados completos do cliente) ainda não está disponível"
                >
                  NF-e (em breve)
                </button>
              </div>
              {vigente?.status === "autorizada" && (
                <p className="text-xs text-madeira-500 mt-2">
                  Para imprimir, abra o DANFE e use Ctrl+P (impressora térmica ou A4).
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <h2 className="font-display text-xl text-madeira-900 mb-2">Últimas notas desta loja</h2>
      {historico.length === 0 ? (
        <p className="text-sm text-madeira-500">Nenhuma nota emitida ainda.</p>
      ) : (
        <div className="card divide-y divide-madeira-100">
          {historico.map((h) => (
            <button
              key={h.id}
              className="w-full text-left p-3 flex flex-wrap items-center gap-3 hover:bg-madeira-50 text-sm"
              onClick={() => {
                const n = String(h.vendas?.numero_pedido ?? "");
                setPedido(n);
                buscar(n);
              }}
            >
              <span className="font-medium text-madeira-900">Pedido #{h.vendas?.numero_pedido ?? "?"}</span>
              <span className={`text-xs px-2 py-0.5 rounded font-medium ${COR_STATUS[h.status]}`}>{ROTULO_STATUS[h.status]}</span>
              <span className="text-xs text-madeira-500">
                {h.numero ? `nº ${h.numero} série ${h.serie ?? ""} · ` : ""}
                {h.ambiente === "homologacao" ? "TESTE · " : ""}
                {new Date(h.criado_em).toLocaleString("pt-BR")}
              </span>
              {h.status === "erro" && h.mensagem && <span className="text-xs text-red-700 truncate max-w-full">{h.mensagem}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
