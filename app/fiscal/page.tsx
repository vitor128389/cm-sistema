"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { formatarMoeda } from "@/lib/format";
import { useLoja } from "@/contexts/LojaContext";
import { baixarDanfePdf, chamarFiscal, imprimirDanfe, preaquecerDanfe, type NotaFiscal } from "@/lib/fiscalCliente";
import FormNfe, { type DadosNfe, enderecoVazio } from "@/components/FormNfe";

interface VendaFiscal {
  id: string;
  numero_pedido: number;
  loja_id: string;
  total: number;
  forma_pagamento: string;
  cancelada: boolean | null;
  criado_em: string;
  clientes: {
    nome: string;
    cpf: string | null;
    telefone: string | null;
    endereco: string | null;
    numero: string | null;
    complemento: string | null;
    bairro: string | null;
    cidade: string | null;
  } | null;
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

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function periodoMesAnterior() {
  const h = new Date();
  return { de: iso(new Date(h.getFullYear(), h.getMonth() - 1, 1)), ate: iso(new Date(h.getFullYear(), h.getMonth(), 0)) };
}

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
  const [de, setDe] = useState(() => periodoMesAnterior().de);
  const [ate, setAte] = useState(() => periodoMesAnterior().ate);
  const [gerandoPacote, setGerandoPacote] = useState(false);
  const [nfeAberta, setNfeAberta] = useState(false);
  const [cartas, setCartas] = useState<{ id: string; nota_id: string; numero: number | null; texto: string; status: string; mensagem: string | null; criado_em: string }[]>([]);
  const [diagnostico, setDiagnostico] = useState<{ notaId: string; campos: Record<string, string> } | null>(null);

  // Assim que a nota aparece na tela, já deixa o cupom pronto: o clique em Imprimir abre na hora.
  useEffect(() => {
    const n = notas.find((x) => x.status === "autorizada" && x.url_danfe && x.tipo === "nfce" && x.venda_id === venda?.id);
    if (n) preaquecerDanfe(n.id);
  }, [notas, venda?.id]);

  useEffect(() => {
    setVenda(null);
    setNotas([]);
    setNfeAberta(false);
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
    setNfeAberta(false);
    const { data } = await supabase
      .from("vendas")
      .select("id, numero_pedido, loja_id, total, forma_pagamento, cancelada, criado_em, clientes(nome, cpf, telefone, endereco, numero, complemento, bairro, cidade), venda_itens(id, nome_produto, variante, quantidade, total, trocado)")
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
    const lista = (data || []) as NotaFiscal[];
    setNotas(lista);
    const ids = lista.filter((n) => n.tipo === "nfe").map((n) => n.id);
    if (ids.length > 0) {
      const { data: cc } = await supabase.from("cartas_correcao").select("*").in("nota_id", ids).order("criado_em", { ascending: true });
      setCartas((cc || []) as typeof cartas);
    } else setCartas([]);
  }

  async function emitirCarta(notaId: string) {
    const texto = prompt(
      "Escreva a correção (15 a 1000 caracteres).\nEx.: \"Razão social do destinatário correta: EMPRESA XYZ LTDA\".\nA carta NÃO pode mudar valores, impostos, datas nem trocar o destinatário."
    );
    if (!texto) return;
    setOcupado(true);
    setAviso("");
    try {
      const resp = await fetch("/api/fiscal/carta-correcao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notaId, correcao: texto }),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || "Não consegui emitir a carta.");
      setAviso("Carta de correção registrada ✓");
      if (venda) await carregarNotas(venda.id);
    } catch (e) {
      setAviso((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  // só vale a nota do ambiente atual da loja (nota de teste não conta em produção)
  const notasValidas = notas.filter((n) => !loja || n.ambiente === loja.fiscal_ambiente);
  const estado = (tipo: "nfce" | "nfe") => {
    const lista = notasValidas.filter((n) => (n.tipo || "nfce") === tipo);
    return {
      vigente: lista.find((n) => n.status === "autorizada" || n.status === "processando"),
      ultimaComErro: lista.find((n) => n.status === "erro"),
    };
  };
  const nfce = estado("nfce");
  const nfe = estado("nfe");
  const real = loja?.fiscal_ambiente === "producao";

  async function acao(rota: "emitir" | "emitir-nfe" | "consultar" | "cancelar", corpo: Record<string, unknown>) {
    if (!venda) return;
    setOcupado(true);
    setAviso("");
    try {
      const nota = await chamarFiscal(rota, corpo);
      await carregarNotas(venda.id);
      await carregarHistorico();
      if (nota.status === "erro") setAviso("A nota foi rejeitada: " + (nota.mensagem || "sem detalhes"));
      else if (nota.status === "processando") setAviso("A SEFAZ ainda está processando. Clique em Atualizar em instantes.");
      else if ((rota === "emitir" || rota === "emitir-nfe") && nota.status === "autorizada") setAviso("Nota autorizada ✓");
      if (rota === "emitir-nfe" && nota.status !== "erro") setNfeAberta(false);
    } catch (e) {
      setAviso((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  function escolherMes(valor: string) {
    if (!/^\d{4}-\d{2}$/.test(valor)) return;
    const [a, m] = valor.split("-").map(Number);
    setDe(iso(new Date(a, m - 1, 1)));
    setAte(iso(new Date(a, m, 0)));
  }

  async function gerarPacote() {
    if (!lojaAtual) return;
    setGerandoPacote(true);
    setAviso("");
    try {
      const resp = await fetch(`/api/fiscal/contabilidade?lojaId=${lojaAtual}&de=${de}&ate=${ate}`);
      if (!resp.ok) throw new Error((await resp.json().catch(() => ({}))).error || "Não consegui gerar o pacote.");
      const blob = await resp.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `Notas-fiscais-${loja?.nome ?? "loja"}-${de}-a-${ate}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      setAviso((e as Error).message);
    } finally {
      setGerandoPacote(false);
    }
  }

  async function rodar(fn: () => Promise<void>) {
    setAviso("");
    try {
      await fn();
    } catch (e) {
      setAviso((e as Error).message);
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

  function cancelar(notaId: string) {
    const motivo = prompt("Motivo do cancelamento da nota fiscal (mínimo 15 caracteres):");
    if (!motivo) return;
    acao("cancelar", { notaId, justificativa: motivo });
  }

  async function diagnosticar(notaId: string) {
    setAviso("");
    setDiagnostico(null);
    setOcupado(true);
    try {
      const resp = await fetch("/api/fiscal/diagnostico", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notaId }),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || "Não consegui consultar.");
      setDiagnostico({ notaId, campos: json.campos });
    } catch (e) {
      setAviso((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  function dadosIniciaisNfe(): DadosNfe {
    const c = venda?.clientes;
    return {
      tipo: "pf",
      documento: c?.cpf || "",
      nome: c?.nome || "",
      situacaoIe: "nao_contribuinte",
      inscricaoEstadual: "",
      email: "",
      telefone: c?.telefone || "",
      endereco: { ...enderecoVazio(), logradouro: c?.endereco || "", numero: c?.numero || "", complemento: c?.complemento || "", bairro: c?.bairro || "", municipio: c?.cidade || "" },
      entregaDiferente: false,
      entrega: enderecoVazio(),
    };
  }

  function emitirNfe(d: DadosNfe) {
    if (!venda) return;
    const texto = real
      ? `ATENÇÃO: isso emite uma NF-e REAL (valor fiscal, vai para a SEFAZ) do pedido #${venda.numero_pedido}, no valor de ${formatarMoeda(venda.total)}, para ${d.nome}. Confirmar?`
      : `Emitir NF-e de TESTE (sem valor fiscal) do pedido #${venda.numero_pedido}?`;
    if (!confirm(texto)) return;
    const tira = (e: DadosNfe["endereco"]) => ({
      cep: e.cep,
      logradouro: e.logradouro,
      numero: e.numero,
      complemento: e.complemento,
      bairro: e.bairro,
      municipio: e.municipio,
      uf: e.uf,
      codigoMunicipio: e.codigoMunicipio,
    });
    acao("emitir-nfe", {
      vendaId: venda.id,
      destinatario: {
        tipo: d.tipo,
        documento: d.documento,
        nome: d.nome,
        situacaoIe: d.situacaoIe,
        inscricaoEstadual: d.inscricaoEstadual,
        email: d.email,
        telefone: d.telefone,
        ...tira(d.endereco),
      },
      entrega: d.entregaDiferente ? { ...tira(d.entrega), nome: d.nome } : null,
    });
  }

  const fiscalLigado = !!loja?.fiscal_ativo;

  function blocoNota(tipo: "nfce" | "nfe", vigente: NotaFiscal | undefined, ultimaComErro: NotaFiscal | undefined) {
    if (!venda) return null;
    const nome = tipo === "nfce" ? "NFC-e (cupom, consumidor)" : "NF-e (nota completa, com dados do cliente)";
    const sigla = tipo === "nfce" ? "NFCe" : "NFe";
    return (
      <div className="mt-4 border-t border-madeira-100 pt-4">
        <p className="text-sm font-medium text-madeira-700 mb-2">{nome}</p>

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
          <p className="mb-3 text-xs text-madeira-500">Nenhuma {tipo === "nfce" ? "NFC-e" : "NF-e"} emitida para esse pedido.</p>
        )}

        <div className="flex flex-wrap gap-2">
          {!vigente && fiscalLigado && tipo === "nfce" && (
            <button className="text-sm px-3 py-2 rounded bg-blue-700 text-white font-medium hover:bg-blue-800 disabled:opacity-50" disabled={ocupado} onClick={emitir}>
              {ocupado ? "Emitindo..." : real ? "🧾 Emitir NFC-e" : "🧾 Emitir NFC-e (teste)"}
            </button>
          )}
          {!vigente && fiscalLigado && tipo === "nfe" && !nfeAberta && (
            <button className="text-sm px-3 py-2 rounded bg-blue-700 text-white font-medium hover:bg-blue-800 disabled:opacity-50" disabled={ocupado} onClick={() => setNfeAberta(true)}>
              🧾 Emitir NF-e
            </button>
          )}
          {vigente?.status === "processando" && (
            <button className="btn-secundario text-sm" disabled={ocupado} onClick={() => acao("consultar", { notaId: vigente.id })}>
              Atualizar status
            </button>
          )}
          {vigente?.status === "autorizada" && vigente.url_danfe && (
            <>
              <button className="btn-primario text-sm" onMouseEnter={() => preaquecerDanfe(vigente.id)} onTouchStart={() => preaquecerDanfe(vigente.id)} disabled={ocupado} onClick={() => rodar(() => imprimirDanfe(vigente.id))}>
                🖨 Imprimir DANFE
              </button>
              <button
                className="btn-secundario text-sm"
                disabled={ocupado}
                onClick={() => rodar(() => baixarDanfePdf(vigente.id, `${sigla}-pedido-${venda.numero_pedido}-${vigente.numero ?? "sn"}.pdf`))}
              >
                ⬇ Baixar PDF
              </button>
            </>
          )}
          {vigente?.status === "autorizada" && vigente.url_xml && (
            <a className="btn-secundario text-sm" href={vigente.url_xml} target="_blank" rel="noreferrer">
              ⬇ XML
            </a>
          )}
          {vigente?.status === "autorizada" && tipo === "nfe" && (
            <button className="btn-secundario text-sm" disabled={ocupado} onClick={() => emitirCarta(vigente.id)}>
              ✏️ Carta de correção
            </button>
          )}
          {vigente?.status === "autorizada" && (
            <button className="btn-secundario text-sm" disabled={ocupado} onClick={() => diagnosticar(vigente.id)}>
              🔎 Verificar na SEFAZ
            </button>
          )}
          {vigente?.status === "autorizada" && (
            <button className="text-sm px-3 py-2 rounded border border-red-300 text-red-700 hover:bg-red-50" disabled={ocupado} onClick={() => cancelar(vigente.id)}>
              Cancelar nota
            </button>
          )}
        </div>

        {tipo === "nfe" && vigente && cartas.filter((c) => c.nota_id === vigente.id).length > 0 && (
          <div className="mt-3 text-xs">
            <p className="font-medium text-madeira-700 mb-1">Cartas de correção</p>
            <ul className="space-y-1">
              {cartas
                .filter((c) => c.nota_id === vigente.id)
                .map((c) => (
                  <li key={c.id} className="p-2 rounded border border-madeira-100 bg-white">
                    <span className={c.status === "autorizada" ? "text-green-700" : "text-red-700"}>
                      {c.status === "autorizada" ? `CC-e nº ${c.numero ?? "?"} registrada` : `Rejeitada: ${c.mensagem || "sem detalhes"}`}
                    </span>{" "}
                    · {new Date(c.criado_em).toLocaleString("pt-BR")}
                    <br />
                    {c.texto}
                    {c.status === "autorizada" && (
                      <>
                        {" "}
                        <a className="underline text-blue-700" href={`/api/fiscal/carta-correcao?id=${c.id}&arquivo=pdf`} target="_blank" rel="noreferrer">
                          PDF
                        </a>{" "}
                        <a className="underline text-blue-700" href={`/api/fiscal/carta-correcao?id=${c.id}&arquivo=xml`} target="_blank" rel="noreferrer">
                          XML
                        </a>
                      </>
                    )}
                  </li>
                ))}
            </ul>
          </div>
        )}
        {vigente && diagnostico?.notaId === vigente.id && (
          <div className="mt-3 p-3 rounded border border-madeira-200 bg-white text-xs">
            <p className="font-medium text-madeira-700 mb-1">Retorno da Focus / SEFAZ</p>
            <table className="w-full">
              <tbody>
                {Object.entries(diagnostico.campos).map(([k, v]) => (
                  <tr key={k} className="border-t border-madeira-100">
                    <td className="pr-3 py-0.5 text-madeira-500 align-top">{k}</td>
                    <td className="py-0.5 break-all">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {tipo === "nfe" && !vigente && nfeAberta && (
          <FormNfe inicial={dadosIniciaisNfe()} ocupado={ocupado} real={real} onEmitir={emitirNfe} onCancelar={() => setNfeAberta(false)} />
        )}
        {vigente?.status === "autorizada" && (
          <p className="text-xs text-madeira-500 mt-2">
            {tipo === "nfce" ? '"Imprimir" abre a janela de impressão para escolher a impressora (térmica ou A4).' : '"Imprimir" abre o PDF da NF-e (A4); imprima por ele com Ctrl+P.'}
          </p>
        )}
      </div>
    );
  }

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
            <>
              {blocoNota("nfce", nfce.vigente, nfce.ultimaComErro)}
              {blocoNota("nfe", nfe.vigente, nfe.ultimaComErro)}
            </>
          )}
        </div>
      )}

      <div className="card p-5 mb-6">
        <h2 className="font-display text-xl text-madeira-900">Pacote para a contadora</h2>
        <p className="text-sm text-madeira-600 mb-3">
          Gera um arquivo ZIP com os XMLs das notas reais do período (autorizadas e canceladas) e a planilha do relatório.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-madeira-600">
            Mês
            <input type="month" className="input-base block" onChange={(e) => escolherMes(e.target.value)} />
          </label>
          <label className="text-xs text-madeira-600">
            De
            <input type="date" className="input-base block" value={de} onChange={(e) => setDe(e.target.value)} />
          </label>
          <label className="text-xs text-madeira-600">
            Até
            <input type="date" className="input-base block" value={ate} onChange={(e) => setAte(e.target.value)} />
          </label>
          <button className="btn-primario" disabled={gerandoPacote || !lojaAtual} onClick={gerarPacote}>
            {gerandoPacote ? "Gerando..." : "📦 Gerar pacote (XML + relatório)"}
          </button>
        </div>
        <p className="text-xs text-madeira-500 mt-2">Vale para a loja selecionada no menu. Só gerente e admin conseguem gerar.</p>
      </div>

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
              <span className="font-medium text-madeira-900">
                {h.tipo === "nfe" ? "NF-e" : "NFC-e"} · Pedido #{h.vendas?.numero_pedido ?? "?"}
              </span>
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
