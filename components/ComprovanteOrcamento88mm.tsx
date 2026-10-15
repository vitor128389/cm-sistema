import { formatarMoeda } from "@/lib/format";
import { calcularTotais, dataBrCurta, valorPrazo } from "@/lib/orcamento";
import type { DadosOrcamentoImpressao } from "@/components/ComprovanteOrcamento";

const PRETO = "#000";

function Divisor() {
  return <div style={{ borderTop: `2px dashed ${PRETO}`, margin: "7px 0" }} />;
}

// Orçamento no cupom da impressora térmica de 80/88mm (mesmo estilo dos
// outros cupons: preto puro, negrito, sem serifa).
export default function ComprovanteOrcamento88mm(d: DadosOrcamentoImpressao) {
  const t = calcularTotais(d.itens, d.desconto, d.frete);
  const mostraAvista = d.forma !== "prazo";
  const mostraPrazo = d.forma !== "avista";
  const loja = d.loja;
  const p = (extra: React.CSSProperties = {}): React.CSSProperties => ({ margin: "2px 0", ...extra });
  const linha = (rotulo: string, valor: string, extra: React.CSSProperties = {}) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 6, margin: "2px 0", ...extra }}>
      <span>{rotulo}</span>
      <span style={{ whiteSpace: "nowrap" }}>{valor}</span>
    </div>
  );
  const enderecoLoja = [
    [loja?.rua, loja?.numero].filter(Boolean).join(", "),
    loja?.bairro,
    [loja?.cidade, loja?.estado].filter(Boolean).join("/"),
  ].filter(Boolean).join(" - ");

  return (
    <div
      style={{
        width: "100%",
        boxSizing: "border-box",
        padding: "2mm 3.5mm 10mm",
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: 14,
        fontWeight: 700,
        color: PRETO,
        lineHeight: 1.25,
      }}
    >
      <p style={p({ textAlign: "center", fontSize: 18, fontWeight: 900, textTransform: "uppercase", lineHeight: 1.15 })}>
        {loja?.nome || "Caruaru Móveis"}
      </p>
      {enderecoLoja && <p style={p({ textAlign: "center", fontSize: 12 })}>{enderecoLoja}</p>}
      {loja?.telefone && <p style={p({ textAlign: "center", fontSize: 12 })}>Tel.: {loja.telefone}</p>}
      <Divisor />
      <p style={p({ textAlign: "center", fontSize: 20, fontWeight: 900 })}>ORÇAMENTO{d.numero ? ` Nº ${d.numero}` : ""}</p>
      <p style={p({ textAlign: "center", fontSize: 12 })}>
        {(d.criadoEm ? new Date(d.criadoEm) : new Date()).toLocaleString("pt-BR")}
      </p>
      {d.validade && <p style={p({ textAlign: "center", fontSize: 13 })}>VÁLIDO ATÉ {dataBrCurta(d.validade)}</p>}
      <Divisor />
      <p style={p({ textTransform: "uppercase" })}>Cliente: {d.clienteNome}</p>
      {d.clienteTelefone && <p style={p({ fontSize: 13 })}>Tel.: {d.clienteTelefone}</p>}
      {d.clienteEndereco && <p style={p({ fontSize: 13 })}>{d.clienteEndereco}</p>}
      <Divisor />

      {d.itens.map((i, idx) => {
        const nome = i.variante && i.variante !== "Padrão" ? `${i.nome} - ${i.variante}` : i.nome;
        const un = mostraAvista ? i.valor_avista : valorPrazo(i.valor_avista);
        return (
          <div key={idx} style={{ margin: "5px 0" }}>
            <p style={p({ textTransform: "uppercase" })}>{i.quantidade}x {nome}</p>
            {linha(`${i.quantidade} x ${formatarMoeda(un)}`, formatarMoeda(un * i.quantidade), { fontSize: 13 })}
            {mostraAvista && mostraPrazo && (
              <p style={p({ fontSize: 12, textAlign: "right" })}>a prazo: {formatarMoeda(valorPrazo(i.valor_avista) * i.quantidade)}</p>
            )}
          </div>
        );
      })}

      <Divisor />
      {t.desconto > 0 && linha("Desconto", `- ${formatarMoeda(t.desconto)}`)}
      {t.frete > 0 && linha("Frete/montagem", `+ ${formatarMoeda(t.frete)}`)}
      {mostraAvista && linha("TOTAL À VISTA", formatarMoeda(t.totalAvista), { fontSize: 17, fontWeight: 900, marginTop: 4 })}
      {mostraPrazo && linha("TOTAL A PRAZO", formatarMoeda(t.totalPrazo), { fontSize: mostraAvista ? 15 : 17, fontWeight: 900, marginTop: 4 })}
      <Divisor />
      {d.prazoEntrega && <p style={p({ fontSize: 13, textTransform: "uppercase" })}>Entrega: {d.prazoEntrega}</p>}
      {d.observacoes?.trim() && <p style={p({ fontSize: 13, whiteSpace: "pre-wrap" })}>Obs.: {d.observacoes.trim()}</p>}
      <p style={p({ textAlign: "center", fontSize: 11, marginTop: 8 })}>Orçamento sem valor fiscal.</p>
      <p style={p({ textAlign: "center", fontSize: 12 })}>Obrigado pela preferência!</p>
    </div>
  );
}
