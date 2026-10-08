import { formatarMoeda } from "@/lib/format";
import type { VendaItem, LojaCompleta } from "@/types";

interface ClienteResumo {
  nome: string;
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
  cliente: ClienteResumo | null;
  itens: VendaItem[];
  total: number;
  formaPagamento: string;
  prazoEntregaMaximo?: string | null;
  prazoDiasUteis?: number | null;
  loja?: LojaCompleta | null;
  criadoEm?: string | null;
  descontoGeral?: number;
  motivoDescontoGeral?: string | null;
  custoAdicional?: number;
  descricaoCustoAdicional?: string | null;
}

// Sofá "2 e 3 lugares" vendido como conjunto vira 2 linhas no carrinho
// (uma peça de 2 e outra de 3 lugares) porque cada peça baixa do estoque
// separadamente — mas na impressão isso deve aparecer como 1 produto só.
function mesclarConjuntosSofa(itens: VendaItem[]): VendaItem[] {
  const resultado: VendaItem[] = [];
  const usados = new Set<number>();

  itens.forEach((item, i) => {
    if (usados.has(i)) return;
    const variante = item.variante || "";
    if (variante.endsWith("— 2 Lugares")) {
      const prefixo = variante.slice(0, -"2 Lugares".length);
      const idxPar = itens.findIndex(
        (outro, j) =>
          j !== i &&
          !usados.has(j) &&
          outro.nome_produto === item.nome_produto &&
          (outro.variante || "") === `${prefixo}3 Lugares` &&
          outro.tipo_entrega === item.tipo_entrega &&
          outro.retirada === item.retirada
      );
      if (idxPar !== -1) {
        const par = itens[idxPar];
        usados.add(i);
        usados.add(idxPar);
        const jaTemNoNome = item.nome_produto.toUpperCase().includes("2 E 3 LUGARES");
        const varianteFinal = jaTemNoNome
          ? prefixo.replace(/\s*—\s*$/, "").trim() || null
          : `${prefixo}2 e 3 Lugares`;
        resultado.push({
          ...item,
          variante: varianteFinal,
          total: item.total + par.total,
          desconto: (item.desconto || 0) + (par.desconto || 0),
        });
        return;
      }
    }
    resultado.push(item);
  });

  return resultado;
}

// Cupom pra impressora térmica de 80/88mm. Pensado pra imprimir nítido em
// papel térmico: tudo preto puro (nada de cinza, que a térmica "falha"),
// fonte sem serifa em negrito e bem maior, divisórias feitas com borda CSS
// (em vez de uma fileira de hifens, que saía quebrada/pulada) e o TOTAL em
// tarja preta com letra branca. Ocupa a largura inteira do papel.
const PRETO = "#000";
const BORDA_TRACEJADA = `2px dashed ${PRETO}`;

function Divisor() {
  return <div style={{ borderTop: BORDA_TRACEJADA, margin: "7px 0" }} />;
}

function Linha({
  esquerda,
  direita,
  tamanho = 15,
}: {
  esquerda: string;
  direita: string;
  tamanho?: number;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: tamanho, margin: "2px 0" }}>
      <span>{esquerda}</span>
      <span style={{ whiteSpace: "nowrap" }}>{direita}</span>
    </div>
  );
}

export default function ComprovanteCupom88mm({
  numeroPedido,
  cliente,
  itens,
  total,
  formaPagamento,
  prazoEntregaMaximo,
  prazoDiasUteis,
  loja,
  criadoEm,
  descontoGeral,
  motivoDescontoGeral,
  custoAdicional,
  descricaoCustoAdicional,
}: Props) {
  itens = mesclarConjuntosSofa(itens);
  const todosRetirada =
    itens.length > 0 &&
    itens.every((i) => (i.quantidade_retirada ?? (i.retirada ? i.quantidade : 0)) >= i.quantidade);
  const descontoItens = itens.reduce((s, i) => s + (i.desconto || 0), 0);
  const descontoTotal = descontoItens + (descontoGeral || 0);
  const dataHora = (criadoEm ? new Date(criadoEm) : new Date()).toLocaleString("pt-BR");
  const p = (extra: React.CSSProperties = {}): React.CSSProperties => ({ margin: "2px 0", ...extra });

  return (
    <div
      style={{
        width: "100%",
        boxSizing: "border-box",
        padding: "2mm 3.5mm 10mm",
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: 15,
        fontWeight: 700,
        color: PRETO,
        lineHeight: 1.3,
      }}
    >
      <p style={p({ textAlign: "center", fontSize: 21, fontWeight: 900, textTransform: "uppercase", lineHeight: 1.15 })}>
        {loja?.nome || "Caruaru Móveis"}
      </p>
      {loja?.telefone && <p style={p({ textAlign: "center", fontSize: 15 })}>Tel: {loja.telefone}</p>}
      <Divisor />

      <p style={p({ fontSize: 23, fontWeight: 900 })}>PEDIDO #{numeroPedido}</p>
      <p style={p({ fontSize: 14 })}>{dataHora}</p>
      <Divisor />

      {cliente ? (
        <>
          <p style={p({ fontSize: 17, fontWeight: 900 })}>{cliente.nome}</p>
          {cliente.telefone && <p style={p()}>Cel: {cliente.telefone}</p>}
          {cliente.endereco && (
            <p style={p()}>
              {cliente.endereco}
              {cliente.numero ? `, ${cliente.numero}` : ""}
            </p>
          )}
          {cliente.bairro && <p style={p()}>Bairro: {cliente.bairro}</p>}
          {cliente.complemento && <p style={p()}>{cliente.complemento}</p>}
          {cliente.cidade && <p style={p()}>Cidade: {cliente.cidade}</p>}
          {cliente.povoado && <p style={p()}>Povoado: {cliente.povoado}</p>}
        </>
      ) : (
        <p style={p()}>Venda sem cliente</p>
      )}
      <Divisor />

      {todosRetirada && (
        <p
          style={p({
            textAlign: "center",
            border: `2px solid ${PRETO}`,
            padding: "3px 0",
            margin: "0 0 6px",
            fontSize: 16,
            fontWeight: 900,
          })}
        >
          RETIRADA NA LOJA
        </p>
      )}

      {itens.map((item) => (
        <div key={item.id} style={{ margin: "7px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 16 }}>
            <span style={{ fontWeight: 900 }}>
              {item.quantidade}x {item.nome_produto}
            </span>
            <span style={{ whiteSpace: "nowrap", fontWeight: 900 }}>{formatarMoeda(item.total)}</span>
          </div>
          {item.variante && <p style={p({ fontSize: 14 })}>{item.variante}</p>}
          {item.observacao && (
            <p style={p({ fontSize: 13, border: `1.5px solid ${PRETO}`, padding: "2px 4px" })}>
              OBS: {item.observacao}
            </p>
          )}
          {!!item.desconto && item.desconto > 0 && (
            <p style={p({ fontSize: 13 })}>
              Desconto: {formatarMoeda(item.desconto)}
              {item.motivo_desconto ? ` (${item.motivo_desconto})` : ""}
            </p>
          )}
        </div>
      ))}
      <Divisor />

      {descontoTotal > 0 && (
        <>
          <Linha esquerda="Subtotal" direita={formatarMoeda(total + descontoTotal)} tamanho={14} />
          <Linha
            esquerda={`Desconto${motivoDescontoGeral ? ` (${motivoDescontoGeral})` : ""}`}
            direita={`- ${formatarMoeda(descontoTotal)}`}
            tamanho={14}
          />
        </>
      )}
      {!!custoAdicional && custoAdicional > 0 && (
        <Linha
          esquerda={`Custo adicional${descricaoCustoAdicional ? ` (${descricaoCustoAdicional})` : ""}`}
          direita={`+ ${formatarMoeda(custoAdicional)}`}
          tamanho={14}
        />
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: PRETO,
          color: "#fff",
          padding: "5px 6px",
          margin: "6px 0",
          fontSize: 22,
          fontWeight: 900,
        }}
      >
        <span>TOTAL</span>
        <span>{formatarMoeda(total)}</span>
      </div>
      <p style={p({ fontSize: 15 })}>Pagamento: {formaPagamento}</p>

      {prazoEntregaMaximo && (
        <p style={p({ border: `2px solid ${PRETO}`, padding: "4px 5px", margin: "8px 0 0", fontSize: 14, fontWeight: 900 })}>
          {prazoDiasUteis
            ? `PRAZO MÁXIMO: ${prazoDiasUteis} DIAS ÚTEIS — ATÉ ${new Date(
                `${prazoEntregaMaximo}T00:00:00`
              ).toLocaleDateString("pt-BR")}`
            : `PRAZO MÁXIMO: ${new Date(`${prazoEntregaMaximo}T00:00:00`).toLocaleDateString("pt-BR")}`}
        </p>
      )}
      <Divisor />
      <p style={p({ textAlign: "center", fontSize: 15, fontWeight: 900 })}>Obrigado pela preferência!</p>
    </div>
  );
}
