import { formatarMoeda } from "@/lib/format";
import type { VendaItem, LojaCompleta } from "@/types";

interface PagamentoResumo {
  forma: string;
  parcelas: number;
  valorAPagar: number;
}

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
  numeroPedido: number;
  cliente: ClienteResumo;
  itens: VendaItem[];
  total: number;
  formaPagamento: string;
  pagamentos?: PagamentoResumo[];
  prazoEntregaMaximo?: string | null;
  loja?: LojaCompleta | null;
  tag?: string;
}

function enderecoLojaTexto(loja?: LojaCompleta | null): string | null {
  if (!loja) return null;
  const partes = [
    loja.rua && loja.numero ? `${loja.rua}, ${loja.numero}` : loja.rua,
    loja.complemento,
    loja.bairro,
    loja.cidade && loja.estado ? `${loja.cidade}/${loja.estado}` : loja.cidade || loja.estado,
    loja.cep,
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

function formatarCpf(cpf?: string | null): string | null {
  if (!cpf) return null;
  const digitos = cpf.replace(/\D/g, "");
  if (digitos.length !== 11) return cpf;
  return `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-${digitos.slice(9)}`;
}

// distribui o total realmente pago (já com desconto/acréscimo da forma
// escolhida) proporcionalmente entre os itens, pra não mostrar dois valores
// que parecem não bater (preço "a prazo" do item vs total pago da venda)
function valorPagoItem(item: VendaItem, todos: VendaItem[], totalPago: number): number {
  const somaListada = todos.reduce((s, i) => s + i.total, 0);
  if (somaListada <= 0) return 0;
  return Math.round(totalPago * (item.total / somaListada) * 100) / 100;
}

function linhaItem(item: VendaItem, itens: VendaItem[], total: number, qtd: number) {
  return (
    <tr key={item.id + "-" + qtd}>
      <td>
        {item.nome_produto} {item.tipo_entrega === "encomenda" ? "(ENCOMENDA)" : "(PRONTA ENTREGA)"}
        {item.variante ? ` — ${item.variante}` : ""}
        {item.observacao && (
          <>
            {" — Obs: "}
            <strong>{item.observacao}</strong>
          </>
        )}
      </td>
      <td>{qtd}</td>
      <td>
        {formatarMoeda(Math.round((valorPagoItem(item, itens, total) / item.quantidade) * qtd * 100) / 100)}
      </td>
    </tr>
  );
}

function ViaComprovante({
  numeroPedido,
  cliente,
  itens,
  total,
  formaPagamento,
  pagamentos,
  prazoEntregaMaximo,
  loja,
  tag,
  rotulo,
}: Props & { rotulo: string }) {
  const enderecoLoja = enderecoLojaTexto(loja);
  const enderecoCliente = enderecoClienteTexto(cliente);
  const cpfFormatado = formatarCpf(cliente.cpf);
  const temPrazo = itens.some((i) => i.tipo_entrega === "encomenda") && prazoEntregaMaximo;

  const itensRetirada = itens.filter((i) => (i.quantidade_retirada ?? (i.retirada ? i.quantidade : 0)) > 0);
  const itensEntrega = itens.filter(
    (i) => (i.quantidade_entrega ?? (i.retirada ? 0 : i.quantidade)) > 0
  );
  const ehMisto = itensRetirada.length > 0 && itensEntrega.length > 0;

  return (
    <div className="imp-via">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 3 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "1rem" }}>{loja?.nome || "Caruaru Móveis"}</h2>
          {loja?.cnpj && <p style={{ margin: "1px 0 0", fontSize: "0.68rem", color: "#666" }}>CNPJ: {loja.cnpj}</p>}
          {enderecoLoja && <p style={{ margin: "1px 0 0", fontSize: "0.68rem", color: "#666" }}>{enderecoLoja}</p>}
          {loja?.telefone && <p style={{ margin: "1px 0 0", fontSize: "0.68rem", color: "#666" }}>Tel: {loja.telefone}</p>}
        </div>
        <span className="imp-numero-pedido">#{numeroPedido}</span>
      </div>
      <p style={{ margin: "4px 0 6px", fontSize: "0.68rem", color: "#666" }}>
        {rotulo} {tag ? `· ${tag}` : ""} · {new Date().toLocaleString("pt-BR")}
      </p>

      <p style={{ fontWeight: 700, fontSize: "0.72rem", margin: "0 0 2px" }}>Cliente</p>
      <p style={{ margin: "0.5px 0" }}>{cliente.nome}</p>
      {cpfFormatado && <p style={{ margin: "0.5px 0" }}>CPF: {cpfFormatado}</p>}
      {cliente.telefone && <p style={{ margin: "0.5px 0" }}>Cel: {cliente.telefone}</p>}
      {enderecoCliente && <p style={{ margin: "0.5px 0" }}>End: {enderecoCliente}</p>}

      {ehMisto ? (
        <>
          <p style={{ fontWeight: 700, fontSize: "0.72rem", margin: "6px 0 2px" }}>RETIRADA NA LOJA</p>
          <table>
            <thead>
              <tr>
                <th>Produto</th>
                <th>Qtd.</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {itensRetirada.map((item) =>
                linhaItem(item, itens, total, item.quantidade_retirada ?? item.quantidade)
              )}
            </tbody>
          </table>
          <p style={{ fontWeight: 700, fontSize: "0.72rem", margin: "6px 0 2px" }}>ENTREGA</p>
          <table>
            <thead>
              <tr>
                <th>Produto</th>
                <th>Qtd.</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {itensEntrega.map((item) =>
                linhaItem(item, itens, total, item.quantidade_entrega ?? item.quantidade)
              )}
            </tbody>
          </table>
        </>
      ) : (
        <>
          <p style={{ fontWeight: 700, fontSize: "0.72rem", margin: "6px 0 2px" }}>Itens</p>
          <table>
            <thead>
              <tr>
                <th>Produto</th>
                <th>Qtd.</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>{itens.map((item) => linhaItem(item, itens, total, item.quantidade))}</tbody>
          </table>
        </>
      )}

      {pagamentos && pagamentos.length > 1 ? (
        <>
          <p style={{ marginTop: 6, marginBottom: 1 }}>
            <strong>Pagamento dividido:</strong>
          </p>
          {pagamentos.map((p, idx) => (
            <p key={idx} style={{ margin: "0.5px 0" }}>
              {p.forma}
              {p.forma === "Crédito" && p.parcelas > 1 ? ` ${p.parcelas}x` : ""}: {formatarMoeda(p.valorAPagar)}
            </p>
          ))}
          <p style={{ margin: "2px 0" }}>
            <strong>Total: {formatarMoeda(total)}</strong>
          </p>
        </>
      ) : (
        <p style={{ margin: "4px 0" }}>
          <strong>Total: {formatarMoeda(total)}</strong> ({formaPagamento})
        </p>
      )}
      {temPrazo && (
        <p style={{ margin: "2px 0" }}>
          Prazo máximo: {new Date(prazoEntregaMaximo as string).toLocaleDateString("pt-BR")}
        </p>
      )}

      <div style={{ marginTop: 10 }}>
        {rotulo === "Via da loja" ? (
          <>
            <p style={{ margin: "6px 0 2px" }}>Assinatura do cliente: ________________________</p>
            <p style={{ margin: "2px 0" }}>Data que recebeu: ___ /___ /______</p>
          </>
        ) : (
          <>
            <p style={{ margin: "6px 0 2px" }}>Assinatura do entregador: ________________________</p>
            <p style={{ margin: "2px 0" }}>Data da entrega: ___ /___ /______</p>
          </>
        )}
      </div>

      {rotulo === "Via do cliente" && (
        <div style={{ marginTop: 10, paddingTop: 6, borderTop: "1px dashed #999", fontSize: "0.62rem", color: "#555" }}>
          <p style={{ margin: "0 0 2px", fontWeight: 700 }}>DEVOLUÇÃO DE VALORES</p>
          <p style={{ margin: 0 }}>
            Em compras presenciais, não devolvemos dinheiro ou diferença de valor por arrependimento ou troca
            por produto mais barato, salvo nos casos previstos em lei.
          </p>
        </div>
      )}
    </div>
  );
}

export default function ComprovanteImpressao(props: Props) {
  return (
    <>
      <ViaComprovante {...props} rotulo="Via da loja" />
      <ViaComprovante {...props} rotulo="Via do cliente" />
    </>
  );
}
