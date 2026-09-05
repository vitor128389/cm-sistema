"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { formatarMoeda } from "@/lib/format";
import { useLoja } from "@/contexts/LojaContext";
import type { Caixa, TurnoCaixa, LojaCompleta, Sangria } from "@/types";

export default function CaixaPage() {
  const { lojaAtual } = useLoja();
  const [caixas, setCaixas] = useState<Caixa[]>([]);
  const [caixaSelecionada, setCaixaSelecionada] = useState<string>("");
  const [turno, setTurno] = useState<TurnoCaixa | null>(null);
  const [qtdVendas, setQtdVendas] = useState(0);
  const [fundoInicial, setFundoInicial] = useState("0");
  const [carregando, setCarregando] = useState(true);
  const [modoFinalizado, setModoFinalizado] = useState(false);
  const [lojaInfo, setLojaInfo] = useState<LojaCompleta | null>(null);
  const [nomeCaixaAtual, setNomeCaixaAtual] = useState("");
  const [sangrias, setSangrias] = useState<Sangria[]>([]);

  const [mostrarModalSangria, setMostrarModalSangria] = useState(false);
  const [valorSangria, setValorSangria] = useState("");
  const [motivoSangria, setMotivoSangria] = useState("");
  const [salvandoSangria, setSalvandoSangria] = useState(false);

  useEffect(() => {
    carregarCaixas();
    if (lojaAtual) {
      supabase
        .from("lojas")
        .select("*")
        .eq("id", lojaAtual)
        .maybeSingle()
        .then(({ data }) => setLojaInfo(data as LojaCompleta | null));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lojaAtual]);

  useEffect(() => {
    if (caixaSelecionada) carregarTurno();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caixaSelecionada]);

  async function carregarCaixas() {
    if (!lojaAtual) {
      setCaixas([]);
      setCarregando(false);
      return;
    }
    const { data } = await supabase
      .from("caixas")
      .select("*")
      .eq("ativo", true)
      .eq("loja_id", lojaAtual)
      .order("nome");
    if (data) {
      setCaixas(data as Caixa[]);
      setCaixaSelecionada(data.length > 0 ? data[0].id : "");
    }
    setCarregando(false);
  }

  async function carregarTurno() {
    setModoFinalizado(false);
    setNomeCaixaAtual(caixas.find((c) => c.id === caixaSelecionada)?.nome || "");
    const { data } = await supabase
      .from("turnos_caixa")
      .select("*")
      .eq("caixa_id", caixaSelecionada)
      .order("aberto_em", { ascending: false })
      .limit(1)
      .maybeSingle();

    setTurno(data as TurnoCaixa | null);

    if (data) {
      const { count } = await supabase
        .from("vendas")
        .select("id", { count: "exact", head: true })
        .eq("turno_caixa_id", data.id);
      setQtdVendas(count || 0);

      const { data: sangriasDoTurno } = await supabase
        .from("sangrias")
        .select("*, usuarios(nome)")
        .eq("turno_caixa_id", data.id)
        .order("criado_em", { ascending: false });
      setSangrias((sangriasDoTurno || []) as unknown as Sangria[]);
    } else {
      setQtdVendas(0);
      setSangrias([]);
    }
  }

  async function abrirCaixa() {
    if (!lojaAtual || !caixaSelecionada) {
      alert("Selecione uma loja ativa no menu lateral antes de abrir o caixa.");
      return;
    }
    const { error } = await supabase.from("turnos_caixa").insert({
      caixa_id: caixaSelecionada,
      fundo_inicial: parseFloat(fundoInicial) || 0,
      status: "aberto",
      loja_id: lojaAtual,
    });
    if (!error) {
      setFundoInicial("0");
      carregarTurno();
    } else {
      alert("Erro ao abrir o caixa: " + error.message);
    }
  }

  async function fecharCaixa() {
    if (!turno) return;
    if (!confirm("Fechar o caixa agora? Depois de fechado só é possível conferir e imprimir.")) return;
    const { error } = await supabase
      .from("turnos_caixa")
      .update({ status: "fechado", fechado_em: new Date().toISOString() })
      .eq("id", turno.id);
    if (!error) {
      carregarTurno();
      setModoFinalizado(true);
    } else {
      alert("Erro ao fechar o caixa: " + error.message);
    }
  }

  const totalCartao = (turno?.total_debito || 0) + (turno?.total_credito || 0);
  const totalGeral = (turno?.total_dinheiro || 0) + (turno?.total_pix || 0) + totalCartao;
  const ticketMedio = qtdVendas > 0 ? (turno?.total_vendido || 0) / qtdVendas : 0;
  const totalDinheiroVendido = (turno?.fundo_inicial || 0) + (turno?.total_dinheiro || 0);
  const totalSangrias = sangrias.reduce((s, sg) => s + sg.valor, 0);
  const saldoDinheiroAtual = totalDinheiroVendido - totalSangrias;

  const aberto = turno?.status === "aberto";
  const fechadoAposTurno = turno?.status === "fechado" && modoFinalizado;

  function abrirModalSangria() {
    setValorSangria("");
    setMotivoSangria("");
    setMostrarModalSangria(true);
  }

  async function confirmarSangria() {
    const valor = parseFloat(valorSangria.replace(",", "."));
    if (!valor || valor <= 0) {
      alert("Informe um valor de sangria maior que zero.");
      return;
    }
    if (valor > saldoDinheiroAtual) {
      alert(
        `Esse valor é maior do que o dinheiro disponível no caixa (${formatarMoeda(saldoDinheiroAtual)}).`
      );
      return;
    }
    if (!motivoSangria.trim()) {
      alert("Preencha o motivo da sangria.");
      return;
    }
    if (!turno || !lojaAtual) return;

    setSalvandoSangria(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { error } = await supabase.from("sangrias").insert({
        turno_caixa_id: turno.id,
        loja_id: lojaAtual,
        valor,
        motivo: motivoSangria.trim(),
        usuario_id: user?.id || null,
      });
      if (error) throw error;

      setMostrarModalSangria(false);
      carregarTurno();
    } catch (erro: unknown) {
      const erroObj = erro as { message?: string } | null;
      alert("Erro ao registrar a sangria: " + (erroObj?.message || "tente novamente."));
    } finally {
      setSalvandoSangria(false);
    }
  }

  return (
    <div className="p-8">
      <div className="flex items-start justify-between mb-2">
        <div>
          <h1 className="font-display text-3xl text-madeira-900">Caixa</h1>
          <p className="text-madeira-600 mt-1">Conferência do dinheiro em caixa e resumo do turno.</p>
        </div>
        {turno && (
          <span
            className={`text-sm px-3 py-1.5 rounded-full font-medium ${
              aberto ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
            }`}
          >
            {aberto ? "Caixa aberto" : "Caixa fechado"}
          </span>
        )}
      </div>

      {caixas.length > 1 && (
        <label className="block max-w-xs my-4">
          <span className="text-xs text-madeira-600 mb-1 block">Caixa</span>
          <select
            className="input-base"
            value={caixaSelecionada}
            onChange={(e) => setCaixaSelecionada(e.target.value)}
          >
            {caixas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
      )}

      {carregando ? (
        <p className="text-madeira-500 text-sm mt-6">Carregando...</p>
      ) : caixas.length === 0 ? (
        <div className="card p-6 max-w-md mt-6 text-sm text-madeira-600">
          Essa loja ainda não tem nenhum caixa cadastrado. Vá em Administração → Caixas e cadastre um
          primeiro.
        </div>
      ) : !turno || turno.status === "fechado" && !fechadoAposTurno ? (
        <div className="card p-6 max-w-md mt-6">
          <p className="text-sm text-madeira-600 mb-4">
            Nenhum caixa aberto no momento. Informe o troco inicial e abra o caixa pra começar a vender.
          </p>
          <label className="block mb-4">
            <span className="text-xs text-madeira-600 mb-1 block">Fundo de caixa inicial (troco)</span>
            <input
              className="input-base"
              type="number"
              value={fundoInicial}
              onChange={(e) => setFundoInicial(e.target.value)}
            />
          </label>
          <button className="btn-primario w-full" onClick={abrirCaixa}>
            Abrir caixa
          </button>
        </div>
      ) : (
        <div className="mt-6">
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="card p-4">
              <p className="text-xs text-madeira-500 mb-1">Total vendido</p>
              <p className="font-display text-xl">{formatarMoeda(turno.total_vendido)}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-madeira-500 mb-1">Quantidade de vendas</p>
              <p className="font-display text-xl">{qtdVendas}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-madeira-500 mb-1">Ticket médio</p>
              <p className="font-display text-xl">{formatarMoeda(ticketMedio)}</p>
            </div>
          </div>

          <p className="text-sm font-semibold text-madeira-700 mb-2">Resumo do caixa</p>
          <div className="card overflow-hidden mb-6">
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b border-estofado-100">
                  <td className="px-4 py-2">Dinheiro recebido</td>
                  <td className="px-4 py-2 text-right">{formatarMoeda(turno.total_dinheiro)}</td>
                </tr>
                <tr className="border-b border-estofado-100">
                  <td className="px-4 py-2">Pix</td>
                  <td className="px-4 py-2 text-right">{formatarMoeda(turno.total_pix)}</td>
                </tr>
                <tr className="border-b border-estofado-100">
                  <td className="px-4 py-2">Cartão (débito + crédito)</td>
                  <td className="px-4 py-2 text-right">{formatarMoeda(totalCartao)}</td>
                </tr>
                <tr className="border-b border-estofado-100 font-semibold">
                  <td className="px-4 py-2">Total geral vendido</td>
                  <td className="px-4 py-2 text-right">{formatarMoeda(totalGeral)}</td>
                </tr>
                <tr className="border-b border-estofado-100 text-red-700">
                  <td className="px-4 py-2">Devoluções de troca (não afeta o total vendido)</td>
                  <td className="px-4 py-2 text-right">
                    {turno.total_devolvido > 0 ? `− ${formatarMoeda(turno.total_devolvido)}` : formatarMoeda(0)}
                  </td>
                </tr>
                <tr className="border-b border-estofado-100 text-red-700">
                  <td className="px-4 py-2">Total de sangrias</td>
                  <td className="px-4 py-2 text-right">
                    {totalSangrias > 0 ? `− ${formatarMoeda(totalSangrias)}` : formatarMoeda(0)}
                  </td>
                </tr>
                <tr className="font-semibold">
                  <td className="px-4 py-2">Saldo atual em dinheiro</td>
                  <td className="px-4 py-2 text-right">{formatarMoeda(saldoDinheiroAtual)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className="text-sm font-semibold text-madeira-700 mb-2">Dinheiro em caixa</p>
          <div className="card p-4 mb-6 flex flex-wrap gap-8">
            <div>
              <p className="text-xs text-madeira-500">Fundo inicial</p>
              <p className="font-display">{formatarMoeda(turno.fundo_inicial)}</p>
            </div>
            <div>
              <p className="text-xs text-madeira-500">Vendido em dinheiro</p>
              <p className="font-display">{formatarMoeda(turno.total_dinheiro)}</p>
            </div>
            <div>
              <p className="text-xs text-madeira-500">Sangrias</p>
              <p className="font-display text-red-700">
                {totalSangrias > 0 ? `− ${formatarMoeda(totalSangrias)}` : formatarMoeda(0)}
              </p>
            </div>
            <div>
              <p className="text-xs text-madeira-500">Total disponível em dinheiro</p>
              <p className="font-display text-lg">{formatarMoeda(saldoDinheiroAtual)}</p>
            </div>
          </div>

          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-madeira-700">Movimentações do caixa</p>
            {aberto && (
              <button className="btn-secundario text-xs px-3 py-1.5" onClick={abrirModalSangria}>
                + Fazer Sangria
              </button>
            )}
          </div>
          {sangrias.length === 0 ? (
            <div className="card p-4 text-sm text-madeira-500 mb-6">Nenhuma sangria registrada nesse turno.</div>
          ) : (
            <div className="card overflow-hidden mb-6">
              <table className="w-full text-sm">
                <thead className="bg-madeira-50 text-left">
                  <tr>
                    <th className="px-4 py-2">Tipo</th>
                    <th className="px-4 py-2">Motivo</th>
                    <th className="px-4 py-2">Data</th>
                    <th className="px-4 py-2">Horário</th>
                    <th className="px-4 py-2">Usuário</th>
                    <th className="px-4 py-2 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {sangrias.map((sg) => {
                    const data = new Date(sg.criado_em);
                    return (
                      <tr key={sg.id} className="border-t border-estofado-100">
                        <td className="px-4 py-2">
                          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-red-50 text-red-700">
                            SANGRIA
                          </span>
                        </td>
                        <td className="px-4 py-2">{sg.motivo}</td>
                        <td className="px-4 py-2">{data.toLocaleDateString("pt-BR")}</td>
                        <td className="px-4 py-2">{data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</td>
                        <td className="px-4 py-2">{sg.usuarios?.nome || "—"}</td>
                        <td className="px-4 py-2 text-right text-red-700">− {formatarMoeda(sg.valor)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex gap-3">
            {aberto ? (
              <button className="btn-primario" onClick={fecharCaixa}>
                Fechar caixa
              </button>
            ) : (
              <>
                <button className="btn-secundario" onClick={() => window.print()}>
                  🖨 Imprimir fechamento
                </button>
                <button
                  className="btn-primario"
                  onClick={() => {
                    setModoFinalizado(false);
                    carregarTurno();
                  }}
                >
                  Abrir novo caixa
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {mostrarModalSangria && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6">
            <p className="font-display text-lg mb-4">Fazer Sangria</p>

            <label className="block mb-3">
              <span className="text-xs text-madeira-600 mb-1 block">Valor da sangria</span>
              <input
                className="input-base"
                type="number"
                step="0.01"
                autoFocus
                value={valorSangria}
                onChange={(e) => setValorSangria(e.target.value)}
                placeholder="0,00"
              />
              <span className="text-xs text-madeira-400 mt-1 block">
                Disponível em dinheiro: {formatarMoeda(saldoDinheiroAtual)}
              </span>
            </label>

            <label className="block mb-3">
              <span className="text-xs text-madeira-600 mb-1 block">Motivo da sangria</span>
              <input
                className="input-base"
                value={motivoSangria}
                onChange={(e) => setMotivoSangria(e.target.value)}
                placeholder="Ex: Pagamento de fornecedor"
              />
            </label>

            <label className="block mb-5">
              <span className="text-xs text-madeira-600 mb-1 block">Data e horário</span>
              <input
                className="input-base bg-madeira-50"
                value={new Date().toLocaleString("pt-BR")}
                disabled
              />
            </label>

            <div className="flex gap-3">
              <button
                className="btn-secundario flex-1"
                onClick={() => setMostrarModalSangria(false)}
                disabled={salvandoSangria}
              >
                Cancelar
              </button>
              <button className="btn-primario flex-1" onClick={confirmarSangria} disabled={salvandoSangria}>
                {salvandoSangria ? "Salvando..." : "Confirmar Sangria"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div id="area-impressao">
        {turno && (
          <div className="imp-caixa">
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <h1 style={{ margin: 0, fontSize: "1.6rem" }}>{lojaInfo?.nome || "Caruaru Móveis"}</h1>
              {lojaInfo?.cidade && (
                <p style={{ margin: "4px 0 0", fontSize: "0.95rem", color: "#555" }}>
                  {[lojaInfo.rua, lojaInfo.cidade && lojaInfo.estado ? `${lojaInfo.cidade}/${lojaInfo.estado}` : ""]
                    .filter(Boolean)
                    .join(" — ")}
                </p>
              )}
              <h2 style={{ margin: "10px 0 0", fontSize: "1.2rem" }}>Fechamento de Caixa</h2>
              {nomeCaixaAtual && <p style={{ margin: "4px 0 0", fontSize: "1rem" }}>{nomeCaixaAtual}</p>}
            </div>

            <table style={{ width: "100%", marginBottom: 16, fontSize: "0.95rem" }}>
              <tbody>
                <tr>
                  <td style={{ padding: "3px 0" }}>Aberto em</td>
                  <td style={{ padding: "3px 0", textAlign: "right" }}>
                    {new Date(turno.aberto_em).toLocaleString("pt-BR")}
                  </td>
                </tr>
                {turno.fechado_em && (
                  <tr>
                    <td style={{ padding: "3px 0" }}>Fechado em</td>
                    <td style={{ padding: "3px 0", textAlign: "right" }}>
                      {new Date(turno.fechado_em).toLocaleString("pt-BR")}
                    </td>
                  </tr>
                )}
                <tr>
                  <td style={{ padding: "3px 0" }}>Emitido em</td>
                  <td style={{ padding: "3px 0", textAlign: "right" }}>{new Date().toLocaleString("pt-BR")}</td>
                </tr>
              </tbody>
            </table>

            <h3 style={{ fontSize: "1.05rem", borderBottom: "2px solid #204411", paddingBottom: 4, marginBottom: 8 }}>
              Resumo do movimento
            </h3>
            <table style={{ width: "100%", marginBottom: 16, fontSize: "1rem" }}>
              <tbody>
                <tr>
                  <td style={{ padding: "5px 0" }}>Quantidade de vendas</td>
                  <td style={{ padding: "5px 0", textAlign: "right", fontWeight: 700 }}>{qtdVendas}</td>
                </tr>
                <tr>
                  <td style={{ padding: "5px 0" }}>Ticket médio</td>
                  <td style={{ padding: "5px 0", textAlign: "right", fontWeight: 700 }}>{formatarMoeda(ticketMedio)}</td>
                </tr>
                <tr>
                  <td style={{ padding: "8px 0", fontSize: "1.15rem", fontWeight: 700, borderTop: "1px solid #999" }}>
                    Total vendido
                  </td>
                  <td
                    style={{
                      padding: "8px 0",
                      textAlign: "right",
                      fontSize: "1.15rem",
                      fontWeight: 700,
                      borderTop: "1px solid #999",
                    }}
                  >
                    {formatarMoeda(turno.total_vendido)}
                  </td>
                </tr>
              </tbody>
            </table>

            <h3 style={{ fontSize: "1.05rem", borderBottom: "2px solid #204411", paddingBottom: 4, marginBottom: 8 }}>
              Recebido por forma de pagamento
            </h3>
            <table style={{ width: "100%", marginBottom: 16, fontSize: "1rem" }}>
              <tbody>
                <tr>
                  <td style={{ padding: "5px 0" }}>Dinheiro</td>
                  <td style={{ padding: "5px 0", textAlign: "right" }}>{formatarMoeda(turno.total_dinheiro)}</td>
                </tr>
                <tr>
                  <td style={{ padding: "5px 0" }}>Pix</td>
                  <td style={{ padding: "5px 0", textAlign: "right" }}>{formatarMoeda(turno.total_pix)}</td>
                </tr>
                <tr>
                  <td style={{ padding: "5px 0" }}>Cartão de débito</td>
                  <td style={{ padding: "5px 0", textAlign: "right" }}>{formatarMoeda(turno.total_debito)}</td>
                </tr>
                <tr>
                  <td style={{ padding: "5px 0" }}>Cartão de crédito</td>
                  <td style={{ padding: "5px 0", textAlign: "right" }}>{formatarMoeda(turno.total_credito)}</td>
                </tr>
                <tr>
                  <td style={{ padding: "8px 0", fontWeight: 700, borderTop: "1px solid #999" }}>Total geral</td>
                  <td style={{ padding: "8px 0", textAlign: "right", fontWeight: 700, borderTop: "1px solid #999" }}>
                    {formatarMoeda(totalGeral)}
                  </td>
                </tr>
                {turno.total_devolvido > 0 && (
                  <tr>
                    <td style={{ padding: "5px 0" }}>Devoluções de troca (não afeta o total vendido)</td>
                    <td style={{ padding: "5px 0", textAlign: "right" }}>{formatarMoeda(turno.total_devolvido)}</td>
                  </tr>
                )}
              </tbody>
            </table>

            {sangrias.length > 0 && (
              <>
                <h3 style={{ fontSize: "1.05rem", borderBottom: "2px solid #204411", paddingBottom: 4, marginBottom: 8 }}>
                  Sangrias
                </h3>
                <table style={{ width: "100%", marginBottom: 16, fontSize: "0.9rem" }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", borderBottom: "1px solid #999", padding: "3px 0" }}>Motivo</th>
                      <th style={{ textAlign: "left", borderBottom: "1px solid #999", padding: "3px 0" }}>Data/Hora</th>
                      <th style={{ textAlign: "right", borderBottom: "1px solid #999", padding: "3px 0" }}>Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sangrias.map((sg) => (
                      <tr key={sg.id}>
                        <td style={{ padding: "3px 0" }}>{sg.motivo}</td>
                        <td style={{ padding: "3px 0" }}>{new Date(sg.criado_em).toLocaleString("pt-BR")}</td>
                        <td style={{ padding: "3px 0", textAlign: "right" }}>{formatarMoeda(sg.valor)}</td>
                      </tr>
                    ))}
                    <tr>
                      <td style={{ padding: "5px 0", fontWeight: 700, borderTop: "1px solid #999" }} colSpan={2}>
                        Total de sangrias
                      </td>
                      <td style={{ padding: "5px 0", textAlign: "right", fontWeight: 700, borderTop: "1px solid #999" }}>
                        {formatarMoeda(totalSangrias)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </>
            )}

            <h3 style={{ fontSize: "1.05rem", borderBottom: "2px solid #204411", paddingBottom: 4, marginBottom: 8 }}>
              Conferência de dinheiro em caixa
            </h3>
            <table style={{ width: "100%", marginBottom: 24, fontSize: "1rem" }}>
              <tbody>
                <tr>
                  <td style={{ padding: "5px 0" }}>Fundo inicial (troco)</td>
                  <td style={{ padding: "5px 0", textAlign: "right" }}>{formatarMoeda(turno.fundo_inicial)}</td>
                </tr>
                <tr>
                  <td style={{ padding: "5px 0" }}>Vendido em dinheiro</td>
                  <td style={{ padding: "5px 0", textAlign: "right" }}>{formatarMoeda(turno.total_dinheiro)}</td>
                </tr>
                {totalSangrias > 0 && (
                  <tr>
                    <td style={{ padding: "5px 0" }}>Sangrias</td>
                    <td style={{ padding: "5px 0", textAlign: "right" }}>− {formatarMoeda(totalSangrias)}</td>
                  </tr>
                )}
                <tr>
                  <td style={{ padding: "8px 0", fontSize: "1.15rem", fontWeight: 700, borderTop: "1px solid #999" }}>
                    Total que deve estar no caixa
                  </td>
                  <td
                    style={{
                      padding: "8px 0",
                      textAlign: "right",
                      fontSize: "1.15rem",
                      fontWeight: 700,
                      borderTop: "1px solid #999",
                    }}
                  >
                    {formatarMoeda(saldoDinheiroAtual)}
                  </td>
                </tr>
              </tbody>
            </table>

            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.95rem" }}>
              <div>
                <p>Conferido por: ____________________________</p>
              </div>
              <div>
                <p>Assinatura: ____________________________</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
