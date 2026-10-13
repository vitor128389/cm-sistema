import { formatarMoeda } from "@/lib/format";
import { mesclarConjuntosSofa, type PropsComprovanteTroca } from "@/components/ComprovanteTroca";

// Comprovante de TROCA no cupom de impressora térmica de 80/88mm: mesmo estilo do cupom
// de venda (preto puro, sem serifa, negrito, divisórias tracejadas, largura total do papel).
const PRETO = "#000";
const BORDA_TRACEJADA = `2px dashed ${PRETO}`;

function Divisor() {
  return <div style={{ borderTop: BORDA_TRACEJADA, margin: "7px 0" }} />;
}

function Linha({ esquerda, direita, tamanho = 15 }: { esquerda: string; direita: string; tamanho?: number }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: tamanho, margin: "2px 0" }}>
      <span>{esquerda}</span>
      <span style={{ whiteSpace: "nowrap" }}>{direita}</span>
    </div>
  );
}

export default function ComprovanteTrocaCupom88mm({
  numeroTroca,
  numeroPedidoOriginal,
  cliente,
  devolvidos,
  novos,
  tipoPreco,
  diferenca,
  diferencaCobrada,
  parcelasDiferenca,
  formaPagamentoDiferenca,
  loja,
  rotaNome,
  criadoEm,
}: PropsComprovanteTroca) {
  const devolvidosExibir = mesclarConjuntosSofa(devolvidos);
  const novosExibir = mesclarConjuntosSofa(novos);
  const valorItem = (v: { valor_unitario_avista: number; valor_unitario_aprazo: number }, qtd: number) =>
    (tipoPreco === "avista" ? v.valor_unitario_avista : v.valor_unitario_aprazo) * qtd;

  const enderecoLoja = [
    [loja?.rua, loja?.numero].filter(Boolean).join(", "),
    loja?.bairro,
    [loja?.cidade, loja?.estado].filter(Boolean).join("/"),
  ]
    .filter(Boolean)
    .join(" - ");
  const p = (extra: React.CSSProperties = {}): React.CSSProperties => ({ margin: "2px 0", ...extra });
  const dataHora = (criadoEm ? new Date(criadoEm) : new Date()).toLocaleString("pt-BR");
  const tituloLista = (t: string) => <p style={p({ fontSize: 14, fontWeight: 900, margin: "6px 0 2px" })}>{t}</p>;

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
      <p style={p({ textAlign: "center", fontSize: 15, fontWeight: 900 })}>COMPROVANTE DE TROCA</p>
      <Linha esquerda={`TROCA Nº ${numeroTroca}`} direita={dataHora} tamanho={13} />
      <Linha esquerda={`PEDIDO ORIGINAL Nº ${numeroPedidoOriginal}`} direita="" tamanho={13} />
      {rotaNome && <p style={p({ fontSize: 13, fontWeight: 900 })}>ROTA: {rotaNome.toUpperCase()}</p>}
      <Divisor />

      <p style={p({ fontSize: 15, fontWeight: 900 })}>{cliente.nome}</p>
      {cliente.telefone && <p style={p({ fontSize: 13 })}>Cel: {cliente.telefone}</p>}
      {cliente.endereco && (
        <p style={p({ fontSize: 13 })}>
          {cliente.endereco}
          {cliente.numero ? `, ${cliente.numero}` : ""}
        </p>
      )}
      {cliente.bairro && <p style={p({ fontSize: 13 })}>Bairro: {cliente.bairro}</p>}
      {cliente.complemento && <p style={p({ fontSize: 13 })}>{cliente.complemento}</p>}
      {cliente.cidade && <p style={p({ fontSize: 13 })}>Cidade: {cliente.cidade}</p>}
      {cliente.povoado && <p style={p({ fontSize: 13 })}>Povoado: {cliente.povoado}</p>}
      <Divisor />

      {tituloLista("PRODUTOS DEVOLVIDOS")}
      {devolvidosExibir.map((d) => (
        <div key={d.id} style={{ display: "flex", alignItems: "flex-start", fontSize: 14, margin: "4px 0" }}>
          <span style={{ flex: 1, textTransform: "uppercase", paddingRight: 4 }}>
            {d.produto_nome}
            {d.variante ? ` — ${d.variante}` : ""}
          </span>
          <span style={{ width: "10mm", textAlign: "right", whiteSpace: "nowrap" }}>UN {d.quantidade}</span>
          <span style={{ width: "22mm", textAlign: "right", whiteSpace: "nowrap" }}>
            {formatarMoeda(valorItem(d, d.quantidade))}
          </span>
        </div>
      ))}
      <Divisor />

      {tituloLista("NOVOS PRODUTOS")}
      {novosExibir.map((n) => (
        <div key={n.id} style={{ display: "flex", alignItems: "flex-start", fontSize: 14, margin: "4px 0" }}>
          <span style={{ flex: 1, textTransform: "uppercase", paddingRight: 4 }}>
            {n.produto_nome}
            {n.variante ? ` — ${n.variante}` : ""}
            <br />
            <span style={{ fontSize: 12, fontWeight: 900 }}>
              {n.tipo_entrega === "encomenda" ? "[ENCOMENDA]" : "[PRONTA ENTREGA]"}
            </span>
          </span>
          <span style={{ width: "10mm", textAlign: "right", whiteSpace: "nowrap" }}>UN {n.quantidade}</span>
          <span style={{ width: "22mm", textAlign: "right", whiteSpace: "nowrap" }}>
            {formatarMoeda(valorItem(n, n.quantidade))}
          </span>
        </div>
      ))}
      <Divisor />

      <p style={p({ fontSize: 12 })}>Cálculo feito com preço {tipoPreco === "avista" ? "à vista" : "a prazo"}.</p>

      {diferenca === 0 && <Linha esquerda="DIFERENÇA" direita={formatarMoeda(0)} tamanho={16} />}
      {diferenca > 0 && (
        <div style={{ background: PRETO, color: "#fff", padding: "4px 6px", margin: "6px 0" }}>
          <Linha esquerda="CLIENTE PAGA" direita={formatarMoeda(diferencaCobrada ?? diferenca)} tamanho={17} />
        </div>
      )}
      {diferenca < 0 && (
        <div style={{ background: PRETO, color: "#fff", padding: "4px 6px", margin: "6px 0" }}>
          <Linha esquerda="DEVOLVIDO AO CLIENTE" direita={formatarMoeda(Math.abs(diferenca))} tamanho={17} />
        </div>
      )}
      {diferenca !== 0 && formaPagamentoDiferenca && (
        <p style={p({ fontSize: 13 })}>
          Forma: {formaPagamentoDiferenca}
          {parcelasDiferenca && parcelasDiferenca > 1 ? ` em ${parcelasDiferenca}x` : ""}
        </p>
      )}

      <div style={{ marginTop: 14 }}>
        <p style={p({ fontSize: 13 })}>Assinatura do cliente:</p>
        <div style={{ borderBottom: `2px solid ${PRETO}`, height: 22, margin: "4px 0" }} />
        <p style={p({ fontSize: 13 })}>Data: ___ /___ /______</p>
      </div>
    </div>
  );
}
