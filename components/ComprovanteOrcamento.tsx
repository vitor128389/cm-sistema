import { formatarMoeda } from "@/lib/format";
import { calcularTotais, dataBrCurta, valorPrazo, type FormaExibicao } from "@/lib/orcamento";
import type { LojaCompleta } from "@/types";

const VERDE = "#123C2E";
const VERDE_CLARO = "#E8F1EC";

export interface DadosOrcamentoImpressao {
  numero: number | null;
  criadoEm: string | null;
  validade: string | null;
  prazoEntrega: string | null;
  clienteNome: string;
  clienteTelefone: string | null;
  clienteEndereco: string | null;
  itens: { nome: string; variante: string | null; quantidade: number; valor_avista: number }[];
  desconto: number;
  frete: number;
  forma: FormaExibicao;
  observacoes: string | null;
  loja: LojaCompleta | null;
}

// Proposta em A4 pra entregar/mandar ao cliente (sem dados fiscais, sem estoque).
export default function ComprovanteOrcamento(d: DadosOrcamentoImpressao) {
  const t = calcularTotais(d.itens, d.desconto, d.frete);
  const mostraAvista = d.forma !== "prazo";
  const mostraPrazo = d.forma !== "avista";
  const loja = d.loja;
  const endereco = [
    [loja?.rua, loja?.numero].filter(Boolean).join(", "),
    loja?.bairro,
    [loja?.cidade, loja?.estado].filter(Boolean).join("/"),
  ]
    .filter(Boolean)
    .join(" - ");
  const dir = { textAlign: "right" as const };

  return (
    <div style={{ padding: "4mm 2mm", fontFamily: "Arial, Helvetica, sans-serif", color: "#222" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: `3px solid ${VERDE}`, paddingBottom: 8 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: VERDE, textTransform: "uppercase" }}>{loja?.nome || "Caruaru Móveis"}</div>
          {endereco && <div style={{ fontSize: 12 }}>{endereco}</div>}
          <div style={{ fontSize: 12 }}>
            {loja?.telefone ? `Tel.: ${loja.telefone}` : ""}
            {loja?.telefone && loja?.cnpj ? "  •  " : ""}
            {loja?.cnpj ? `CNPJ: ${loja.cnpj}` : ""}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ display: "inline-block", background: VERDE, color: "#fff", fontWeight: 800, fontSize: 18, padding: "3px 12px", borderRadius: 6 }}>
            ORÇAMENTO{d.numero ? ` Nº ${d.numero}` : ""}
          </div>
          <div style={{ fontSize: 12, marginTop: 4 }}>
            Emitido em {d.criadoEm ? new Date(d.criadoEm).toLocaleDateString("pt-BR") : new Date().toLocaleDateString("pt-BR")}
          </div>
          {d.validade && <div style={{ fontSize: 12, fontWeight: 700 }}>Válido até {dataBrCurta(d.validade)}</div>}
        </div>
      </div>

      <div style={{ background: VERDE_CLARO, borderRadius: 6, padding: "8px 10px", margin: "10px 0", fontSize: 13 }}>
        <div><b>Cliente:</b> {d.clienteNome}</div>
        {d.clienteTelefone && <div><b>Telefone:</b> {d.clienteTelefone}</div>}
        {d.clienteEndereco && <div><b>Endereço:</b> {d.clienteEndereco}</div>}
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: VERDE, color: "#fff" }}>
            <th style={{ padding: "6px 8px", textAlign: "left" }}>Produto</th>
            <th style={{ padding: "6px 8px", width: 40, textAlign: "center" }}>Qtd</th>
            {mostraAvista && <th style={{ padding: "6px 8px", ...dir }}>{mostraPrazo ? "Unit. à vista" : "Valor unit."}</th>}
            {mostraPrazo && <th style={{ padding: "6px 8px", ...dir }}>{mostraAvista ? "Unit. a prazo" : "Valor unit."}</th>}
            <th style={{ padding: "6px 8px", ...dir }}>Subtotal{mostraAvista && mostraPrazo ? " (à vista)" : ""}</th>
          </tr>
        </thead>
        <tbody>
          {d.itens.map((i, idx) => {
            const nome = i.variante && i.variante !== "Padrão" ? `${i.nome} - ${i.variante}` : i.nome;
            const unidade = mostraAvista ? i.valor_avista : valorPrazo(i.valor_avista);
            return (
              <tr key={idx} style={{ borderBottom: "1px solid #ddd" }}>
                <td style={{ padding: "6px 8px" }}>{nome}</td>
                <td style={{ padding: "6px 8px", textAlign: "center" }}>{i.quantidade}</td>
                {mostraAvista && <td style={{ padding: "6px 8px", ...dir }}>{formatarMoeda(i.valor_avista)}</td>}
                {mostraPrazo && <td style={{ padding: "6px 8px", ...dir }}>{formatarMoeda(valorPrazo(i.valor_avista))}</td>}
                <td style={{ padding: "6px 8px", ...dir }}>{formatarMoeda(unidade * i.quantidade)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
        <div style={{ minWidth: 280, fontSize: 13 }}>
          {t.desconto > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between" }}><span>Desconto</span><span>- {formatarMoeda(t.desconto)}</span></div>
          )}
          {t.frete > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between" }}><span>Frete / montagem</span><span>{formatarMoeda(t.frete)}</span></div>
          )}
          {mostraAvista && (
            <div style={{ display: "flex", justifyContent: "space-between", background: VERDE, color: "#fff", padding: "6px 10px", borderRadius: 6, marginTop: 6, fontSize: 16, fontWeight: 800 }}>
              <span>TOTAL À VISTA</span><span>{formatarMoeda(t.totalAvista)}</span>
            </div>
          )}
          {mostraPrazo && (
            <div style={{ display: "flex", justifyContent: "space-between", background: mostraAvista ? VERDE_CLARO : VERDE, color: mostraAvista ? VERDE : "#fff", padding: "6px 10px", borderRadius: 6, marginTop: 6, fontSize: mostraAvista ? 14 : 16, fontWeight: 800 }}>
              <span>TOTAL A PRAZO</span><span>{formatarMoeda(t.totalPrazo)}</span>
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: 14, fontSize: 12.5, lineHeight: 1.5 }}>
        {d.prazoEntrega && <div><b>Prazo de entrega:</b> {d.prazoEntrega}</div>}
        {d.observacoes?.trim() && <div style={{ whiteSpace: "pre-wrap" }}><b>Observações:</b> {d.observacoes.trim()}</div>}
      </div>

      <div style={{ marginTop: 18, borderTop: "1px solid #bbb", paddingTop: 6, fontSize: 11, color: "#555" }}>
        Orçamento sem valor fiscal. Os valores e a disponibilidade dos produtos podem mudar após a data de validade.
        A venda só é confirmada com o pagamento ou sinal.
      </div>
    </div>
  );
}
