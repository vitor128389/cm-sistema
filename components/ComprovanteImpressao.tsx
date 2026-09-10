import { formatarMoeda } from "@/lib/format";
import type { VendaItem, LojaCompleta } from "@/types";

// Paleta de cores da notinha — mudar só aqui já reflete em toda a
// impressão (Via da loja e Via do cliente).
const COR_VERDE_ESCURO = "#123C2E";
const COR_VERDE_FUNDO = "#E8F1EC";
const COR_TEXTO = "#111111";
const COR_SECUNDARIO = "#666666";
const COR_AVISO = "#9E2525";

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
  povoado?: string | null;
  bairro?: string | null;
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
      <td style={{ color: COR_TEXTO }}>
        {item.nome_produto}{" "}
        {item.tipo_entrega === "encomenda"
          ? "(ENCOMENDA)"
          : item.categoria === "Móveis Depósito"
          ? "(DEPÓSITO)"
          : "(PRONTA ENTREGA)"}
        {item.variante ? ` — ${item.variante}` : ""}
        {item.observacao && (
          <span
            style={{
              display: "inline-block",
              marginLeft: 4,
              color: COR_VERDE_ESCURO,
              fontWeight: 700,
              backgroundColor: COR_VERDE_FUNDO,
              border: `1px solid ${COR_VERDE_ESCURO}`,
              borderRadius: 4,
              padding: "1px 5px",
            }}
          >
            OBS: {item.observacao}
          </span>
        )}
        {!!item.desconto && item.desconto > 0 && (
          <>
            {" — Desconto: "}
            <strong>
              {formatarMoeda(item.desconto)}
              {item.motivo_desconto ? ` (${item.motivo_desconto})` : ""}
            </strong>
          </>
        )}
      </td>
      <td style={{ color: COR_TEXTO }}>{qtd}</td>
      <td style={{ color: COR_TEXTO }}>
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
  const temPrazo =
    itens.some((i) => i.tipo_entrega === "encomenda" || i.status_entrega === "encomenda") &&
    !!prazoEntregaMaximo;

  const itensRetirada = itens.filter((i) => (i.quantidade_retirada ?? (i.retirada ? i.quantidade : 0)) > 0);
  const itensEntrega = itens.filter(
    (i) => (i.quantidade_entrega ?? (i.retirada ? 0 : i.quantidade)) > 0
  );
  const ehMisto = itensRetirada.length > 0 && itensEntrega.length > 0;

  return (
    <div className="imp-via">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 3 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "1.2rem", color: COR_VERDE_ESCURO, fontWeight: 700 }}>
            {loja?.nome || "Caruaru Móveis"}
          </h2>
          {loja?.cnpj && (
            <p style={{ margin: "1px 0 0", fontSize: "0.82rem", color: COR_SECUNDARIO }}>CNPJ: {loja.cnpj}</p>
          )}
          {enderecoLoja && (
            <p style={{ margin: "1px 0 0", fontSize: "0.82rem", color: COR_SECUNDARIO }}>{enderecoLoja}</p>
          )}
          {loja?.telefone && (
            <p style={{ margin: "1px 0 0", fontSize: "0.82rem", color: COR_SECUNDARIO }}>Tel: {loja.telefone}</p>
          )}
        </div>
        <span className="imp-numero-pedido">#{numeroPedido}</span>
      </div>
      <p style={{ margin: "4px 0 6px", fontSize: "0.82rem", color: COR_SECUNDARIO }}>
        {rotulo} {tag ? `· ${tag}` : ""} · {new Date().toLocaleString("pt-BR")}
      </p>

      <p style={{ fontWeight: 700, fontSize: "0.88rem", margin: "0 0 2px", color: COR_VERDE_ESCURO }}>Cliente</p>
      <p style={{ margin: "0.5px 0", color: COR_TEXTO }}>{cliente.nome}</p>
      {cpfFormatado && <p style={{ margin: "0.5px 0", color: COR_TEXTO }}>CPF: {cpfFormatado}</p>}
      {cliente.telefone && <p style={{ margin: "0.5px 0", color: COR_TEXTO }}>Cel: {cliente.telefone}</p>}
      {cliente.bairro && <p style={{ margin: "0.5px 0", color: COR_TEXTO }}>Bairro: {cliente.bairro}</p>}
      {enderecoCliente && <p style={{ margin: "0.5px 0", color: COR_TEXTO }}>End: {enderecoCliente}</p>}
      {cliente.cidade && <p style={{ margin: "0.5px 0", color: COR_TEXTO }}>Cidade: {cliente.cidade}</p>}
      {cliente.povoado && <p style={{ margin: "0.5px 0", color: COR_TEXTO }}>Povoado: {cliente.povoado}</p>}

      {ehMisto ? (
        <>
          <span
            style={{
              display: "inline-block",
              fontWeight: 700,
              fontSize: "0.82rem",
              margin: "6px 0 2px",
              color: COR_VERDE_ESCURO,
              backgroundColor: COR_VERDE_FUNDO,
              borderRadius: 4,
              padding: "2px 7px",
            }}
          >
            RETIRADA NA LOJA
          </span>
          <table>
            <thead>
              <tr>
                <th style={{ backgroundColor: COR_VERDE_FUNDO, color: COR_VERDE_ESCURO, fontWeight: 700 }}>
                  Produto
                </th>
                <th style={{ backgroundColor: COR_VERDE_FUNDO, color: COR_VERDE_ESCURO, fontWeight: 700 }}>
                  Qtd.
                </th>
                <th style={{ backgroundColor: COR_VERDE_FUNDO, color: COR_VERDE_ESCURO, fontWeight: 700 }}>
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {itensRetirada.map((item) =>
                linhaItem(item, itens, total, item.quantidade_retirada ?? item.quantidade)
              )}
            </tbody>
          </table>
          <span
            style={{
              display: "inline-block",
              fontWeight: 700,
              fontSize: "0.82rem",
              margin: "6px 0 2px",
              color: COR_VERDE_ESCURO,
              backgroundColor: COR_VERDE_FUNDO,
              borderRadius: 4,
              padding: "2px 7px",
            }}
          >
            ENTREGA
          </span>
          <table>
            <thead>
              <tr>
                <th style={{ backgroundColor: COR_VERDE_FUNDO, color: COR_VERDE_ESCURO, fontWeight: 700 }}>
                  Produto
                </th>
                <th style={{ backgroundColor: COR_VERDE_FUNDO, color: COR_VERDE_ESCURO, fontWeight: 700 }}>
                  Qtd.
                </th>
                <th style={{ backgroundColor: COR_VERDE_FUNDO, color: COR_VERDE_ESCURO, fontWeight: 700 }}>
                  Total
                </th>
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
          {itensRetirada.length === itens.length && itens.length > 0 ? (
            <span
              style={{
                display: "inline-block",
                fontWeight: 700,
                fontSize: "0.82rem",
                margin: "6px 0 2px",
                color: COR_VERDE_ESCURO,
                backgroundColor: COR_VERDE_FUNDO,
                borderRadius: 4,
                padding: "2px 7px",
              }}
            >
              RETIRADA NA LOJA
            </span>
          ) : (
            <p style={{ fontWeight: 700, fontSize: "0.88rem", margin: "6px 0 2px", color: COR_VERDE_ESCURO }}>
              Itens
            </p>
          )}
          <table>
            <thead>
              <tr>
                <th style={{ backgroundColor: COR_VERDE_FUNDO, color: COR_VERDE_ESCURO, fontWeight: 700 }}>
                  Produto
                </th>
                <th style={{ backgroundColor: COR_VERDE_FUNDO, color: COR_VERDE_ESCURO, fontWeight: 700 }}>
                  Qtd.
                </th>
                <th style={{ backgroundColor: COR_VERDE_FUNDO, color: COR_VERDE_ESCURO, fontWeight: 700 }}>
                  Total
                </th>
              </tr>
            </thead>
            <tbody>{itens.map((item) => linhaItem(item, itens, total, item.quantidade))}</tbody>
          </table>
        </>
      )}

      {pagamentos && pagamentos.length > 1 ? (
        <>
          <p style={{ marginTop: 6, marginBottom: 1, color: COR_TEXTO }}>
            <strong>Pagamento dividido:</strong>
          </p>
          {pagamentos.map((p, idx) => (
            <p key={idx} style={{ margin: "0.5px 0", color: COR_TEXTO }}>
              {p.forma}
              {p.forma === "Crédito" && p.parcelas > 1 ? ` ${p.parcelas}x` : ""}: {formatarMoeda(p.valorAPagar)}
            </p>
          ))}
          <p
            style={{
              margin: "4px 0",
              padding: "4px 7px",
              backgroundColor: COR_VERDE_FUNDO,
              borderRadius: 4,
              display: "inline-block",
            }}
          >
            <strong style={{ color: COR_TEXTO }}>Total: </strong>
            <span style={{ color: COR_VERDE_ESCURO, fontWeight: 700 }}>{formatarMoeda(total)}</span>
          </p>
        </>
      ) : (
        <p
          style={{
            margin: "4px 0",
            padding: "4px 7px",
            backgroundColor: COR_VERDE_FUNDO,
            borderRadius: 4,
            display: "inline-block",
          }}
        >
          <strong style={{ color: COR_TEXTO }}>Total: </strong>
          <span style={{ color: COR_VERDE_ESCURO, fontWeight: 700 }}>{formatarMoeda(total)}</span>
          <span style={{ color: COR_TEXTO }}> ({formaPagamento})</span>
        </p>
      )}
      {temPrazo && (
        <p style={{ margin: "2px 0", color: COR_TEXTO }}>
          Prazo máximo: {new Date(`${prazoEntregaMaximo}T00:00:00`).toLocaleDateString("pt-BR")}
        </p>
      )}

      <div style={{ marginTop: 10, color: COR_TEXTO }}>
        {rotulo === "Via da loja" ? (
          <>
            <p style={{ margin: "6px 0 6px" }}>
              Declaro que recebi os produtos acima em perfeito estado.
            </p>
            <p style={{ margin: "6px 0 6px" }}>Assinatura do cliente: __________________________________</p>
            <p style={{ margin: "2px 0" }}>Data que recebeu: ___ /___ /______</p>
          </>
        ) : (
          <>
            <p style={{ margin: "6px 0 6px" }}>Assinatura do entregador: __________________________________</p>
            <p style={{ margin: "2px 0" }}>Data da entrega: ___ /___ /______</p>
          </>
        )}
      </div>

      {rotulo === "Via do cliente" && (
        <div
          style={{
            marginTop: 10,
            paddingTop: 6,
            borderTop: "1px dashed #999",
            fontSize: "0.75rem",
            color: COR_SECUNDARIO,
          }}
        >
          <p style={{ margin: "0 0 2px", fontWeight: 700, color: COR_AVISO }}>DEVOLUÇÃO DE VALORES</p>
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
