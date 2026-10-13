import { formatarMoeda } from "@/lib/format";
import type { LojaCompleta } from "@/types";

export interface DadosCancelamento {
  numeroPedido: number;
  clienteNome: string;
  total: number;
  formaPagamento: string;
  criadoEm: string | null;
  canceladaEm: string | null;
  motivo: string | null;
  itens: { nome: string; variante: string | null; quantidade: number; total?: number | null }[];
  loja: LojaCompleta | null;
}

const PRETO = "#000";

function Divisor() {
  return <div style={{ borderTop: `2px dashed ${PRETO}`, margin: "7px 0" }} />;
}

// Comprovante de CANCELAMENTO no cupom de impressora térmica de 80/88mm
// (mesmo estilo dos outros cupons: preto puro, negrito, sem serifa).
export default function ComprovanteCancelamento88mm({
  numeroPedido,
  clienteNome,
  total,
  formaPagamento,
  criadoEm,
  canceladaEm,
  motivo,
  itens,
  loja,
}: DadosCancelamento) {
  const p = (extra: React.CSSProperties = {}): React.CSSProperties => ({ margin: "2px 0", ...extra });
  const fmt = (d: string | null) => (d ? new Date(d).toLocaleString("pt-BR") : "—");
  const enderecoLoja = [
    [loja?.rua, loja?.numero].filter(Boolean).join(", "),
    loja?.bairro,
    [loja?.cidade, loja?.estado].filter(Boolean).join("/"),
  ]
    .filter(Boolean)
    .join(" - ");

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
      {loja?.cnpj && <p style={p({ textAlign: "center", fontSize: 13 })}>CNPJ: {loja.cnpj}</p>}
      {enderecoLoja && <p style={p({ textAlign: "center", fontSize: 12 })}>{enderecoLoja}</p>}
      {loja?.telefone && <p style={p({ textAlign: "center", fontSize: 13 })}>Tel: {loja.telefone}</p>}
      <Divisor />

      <div style={{ background: PRETO, color: "#fff", padding: "5px 6px", textAlign: "center", margin: "4px 0" }}>
        <p style={p({ fontSize: 17, fontWeight: 900 })}>COMPROVANTE DE CANCELAMENTO</p>
      </div>
      <p style={p({ textAlign: "center", fontSize: 16, fontWeight: 900 })}>PEDIDO Nº {numeroPedido}</p>
      <Divisor />

      <p style={p({ fontSize: 13 })}>Cliente: {clienteNome}</p>
      <p style={p({ fontSize: 13 })}>Venda feita em: {fmt(criadoEm)}</p>
      <p style={p({ fontSize: 13 })}>Cancelado em: {fmt(canceladaEm)}</p>
      <Divisor />

      <p style={p({ fontSize: 14, fontWeight: 900 })}>ITENS CANCELADOS</p>
      {itens.map((it, i) => (
        <div key={i} style={{ display: "flex", alignItems: "flex-start", fontSize: 14, margin: "4px 0" }}>
          <span style={{ flex: 1, textTransform: "uppercase", paddingRight: 4 }}>
            {it.nome}
            {it.variante ? ` — ${it.variante}` : ""}
          </span>
          <span style={{ width: "10mm", textAlign: "right", whiteSpace: "nowrap" }}>UN {it.quantidade}</span>
          {it.total != null && (
            <span style={{ width: "22mm", textAlign: "right", whiteSpace: "nowrap" }}>{formatarMoeda(it.total)}</span>
          )}
        </div>
      ))}
      <Divisor />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", margin: "4px 0" }}>
        <span style={{ fontSize: 17, fontWeight: 900 }}>VALOR CANCELADO</span>
        <span style={{ fontSize: 19, fontWeight: 900 }}>{formatarMoeda(total)}</span>
      </div>
      <p style={p({ fontSize: 13 })}>Pagamento original: {formaPagamento}</p>
      <Divisor />

      <p style={p({ fontSize: 14, fontWeight: 900 })}>MOTIVO:</p>
      <p style={p({ fontSize: 14 })}>{motivo || "—"}</p>

      <div style={{ marginTop: 14 }}>
        <p style={p({ fontSize: 13 })}>Responsável:</p>
        <div style={{ borderBottom: `2px solid ${PRETO}`, height: 22, margin: "4px 0" }} />
        <p style={p({ fontSize: 13 })}>Cliente:</p>
        <div style={{ borderBottom: `2px solid ${PRETO}`, height: 22, margin: "4px 0" }} />
      </div>
      <p style={p({ textAlign: "center", fontSize: 10, margin: "8px 0 0" })}>Este documento não é fiscal.</p>
    </div>
  );
}
