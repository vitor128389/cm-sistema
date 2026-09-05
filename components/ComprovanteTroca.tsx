import { formatarMoeda } from "@/lib/format";
import type { LojaCompleta, TrocaItemDevolvido, TrocaItemNovo } from "@/types";

interface ClienteResumo {
  nome: string;
  cpf?: string | null;
  telefone?: string | null;
  endereco?: string | null;
  numero?: string | null;
  complemento?: string | null;
  cidade?: string | null;
}

interface Props {
  numeroTroca: number;
  numeroPedidoOriginal: number;
  cliente: ClienteResumo;
  devolvidos: TrocaItemDevolvido[];
  novos: TrocaItemNovo[];
  tipoPreco: "avista" | "aprazo";
  diferenca: number;
  formaPagamentoDiferenca: string | null;
  loja?: LojaCompleta | null;
}

function enderecoLojaTexto(loja?: LojaCompleta | null): string | null {
  if (!loja) return null;
  const partes = [
    loja.rua && loja.numero ? `${loja.rua}, ${loja.numero}` : loja.rua,
    loja.bairro,
    loja.cidade && loja.estado ? `${loja.cidade}/${loja.estado}` : loja.cidade || loja.estado,
  ].filter(Boolean);
  return partes.length > 0 ? partes.join(" — ") : null;
}

function enderecoClienteTexto(c: ClienteResumo): string | null {
  const partes = [
    c.endereco && c.numero ? `${c.endereco}, ${c.numero}` : c.endereco,
    c.complemento,
    c.cidade,
  ].filter(Boolean);
  return partes.length > 0 ? partes.join(" — ") : null;
}

function ViaTroca({
  numeroTroca,
  numeroPedidoOriginal,
  cliente,
  devolvidos,
  novos,
  tipoPreco,
  diferenca,
  formaPagamentoDiferenca,
  loja,
  rotulo,
}: Props & { rotulo: string }) {
  const enderecoLoja = enderecoLojaTexto(loja);
  const enderecoCliente = enderecoClienteTexto(cliente);
  const valorItem = (v: { valor_unitario_avista: number; valor_unitario_aprazo: number }, qtd: number) =>
    (tipoPreco === "avista" ? v.valor_unitario_avista : v.valor_unitario_aprazo) * qtd;

  return (
    <div className="imp-via">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 3 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "1rem" }}>{loja?.nome || "Caruaru Móveis"}</h2>
          {loja?.cnpj && <p style={{ margin: "1px 0 0", fontSize: "0.68rem", color: "#666" }}>CNPJ: {loja.cnpj}</p>}
          {enderecoLoja && <p style={{ margin: "1px 0 0", fontSize: "0.68rem", color: "#666" }}>{enderecoLoja}</p>}
        </div>
        <span className="imp-numero-pedido">TROCA #{numeroTroca}</span>
      </div>
      <p style={{ margin: "4px 0 6px", fontSize: "0.68rem", color: "#666" }}>
        {rotulo} · {new Date().toLocaleString("pt-BR")}
      </p>

      <p style={{ fontWeight: 700, fontSize: "0.85rem", margin: "4px 0", textAlign: "center", border: "1px solid #222", padding: "3px" }}>
        TROCA DE PRODUTOS
      </p>

      <p style={{ margin: "4px 0 2px" }}>
        Pedido original: <strong>#{numeroPedidoOriginal}</strong>
      </p>
      <p style={{ margin: "0 0 2px" }}>Cliente: {cliente.nome}</p>
      {cliente.telefone && <p style={{ margin: "0 0 2px" }}>Cel: {cliente.telefone}</p>}
      {enderecoCliente && <p style={{ margin: "0 0 6px" }}>End: {enderecoCliente}</p>}

      <p style={{ fontWeight: 700, fontSize: "0.72rem", margin: "6px 0 2px" }}>PRODUTOS DEVOLVIDOS</p>
      <table>
        <thead>
          <tr>
            <th>Produto</th>
            <th>Qtd.</th>
            <th>Valor</th>
          </tr>
        </thead>
        <tbody>
          {devolvidos.map((d) => (
            <tr key={d.id}>
              <td>
                {d.produto_nome}
                {d.variante ? ` — ${d.variante}` : ""}
              </td>
              <td>{d.quantidade}</td>
              <td>{formatarMoeda(valorItem(d, d.quantidade))}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p style={{ fontWeight: 700, fontSize: "0.72rem", margin: "6px 0 2px" }}>NOVOS PRODUTOS</p>
      <table>
        <thead>
          <tr>
            <th>Produto</th>
            <th>Qtd.</th>
            <th>Valor</th>
          </tr>
        </thead>
        <tbody>
          {novos.map((n) => (
            <tr key={n.id}>
              <td>
                {n.produto_nome}
                {n.variante ? ` — ${n.variante}` : ""}
              </td>
              <td>{n.quantidade}</td>
              <td>{formatarMoeda(valorItem(n, n.quantidade))}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p style={{ margin: "6px 0 2px", fontSize: "0.68rem", color: "#666" }}>
        Cálculo feito com preço {tipoPreco === "avista" ? "à vista" : "a prazo"}.
      </p>

      {diferenca === 0 && (
        <p style={{ margin: "4px 0" }}>
          <strong>Diferença: {formatarMoeda(0)}</strong>
        </p>
      )}
      {diferenca > 0 && (
        <p style={{ margin: "4px 0" }}>
          <strong>Diferença paga pelo cliente: {formatarMoeda(diferenca)}</strong>
          {formaPagamentoDiferenca ? ` — Forma de pagamento: ${formaPagamentoDiferenca}` : ""}
        </p>
      )}
      {diferenca < 0 && (
        <p style={{ margin: "4px 0" }}>
          <strong>Valor devolvido ao cliente: {formatarMoeda(Math.abs(diferenca))}</strong>
          {formaPagamentoDiferenca ? ` — Forma: ${formaPagamentoDiferenca}` : ""}
        </p>
      )}

      <div style={{ marginTop: 10 }}>
        <p style={{ margin: "6px 0 2px" }}>Assinatura do cliente: ________________________</p>
        <p style={{ margin: "2px 0" }}>Data: ___ /___ /______</p>
      </div>
    </div>
  );
}

export default function ComprovanteTroca(props: Props) {
  return (
    <>
      <ViaTroca {...props} rotulo="Via da loja" />
      <ViaTroca {...props} rotulo="Via do cliente" />
    </>
  );
}
