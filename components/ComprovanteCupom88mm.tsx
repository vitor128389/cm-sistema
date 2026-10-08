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
  pagamentos?: { forma: string; parcelas: number; valorAPagar: number }[];
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
  pagamentos,
  descontoGeral,
  motivoDescontoGeral,
  custoAdicional,
  descricaoCustoAdicional,
}: Props) {
  itens = mesclarConjuntosSofa(itens);
  const todosRetirada =
    itens.length > 0 &&
    itens.every((i) => (i.quantidade_retirada ?? (i.retirada ? i.quantidade : 0)) >= i.quantidade);
  const somaItens = itens.reduce((s, i) => s + i.total, 0);
  // diferença entre o que os itens somam (+ custo adicional) e o que foi
  // cobrado: desconto geral, desconto à vista etc. — assim a conta fecha
  // sempre (SUBTOTAL - DESCONTO = TOTAL), sem número "sumido".
  const diferenca = Math.round((somaItens + (custoAdicional || 0) - total) * 100) / 100;
  const dataHora = (criadoEm ? new Date(criadoEm) : new Date()).toLocaleString("pt-BR");
  const enderecoLoja = [
    [loja?.rua, loja?.numero].filter(Boolean).join(", "),
    loja?.bairro,
    [loja?.cidade, loja?.estado].filter(Boolean).join("/"),
  ]
    .filter(Boolean)
    .join(" - ");
  const p = (extra: React.CSSProperties = {}): React.CSSProperties => ({ margin: "2px 0", ...extra });

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
      <p style={p({ textAlign: "center", fontSize: 14, fontWeight: 900 })}>COMPROVANTE DE VENDA</p>
      <Linha esquerda={`PEDIDO Nº ${numeroPedido}`} direita={dataHora} tamanho={13} />
      <Divisor />

      {cliente ? (
        <>
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
        </>
      ) : null}

      {todosRetirada && <p style={p({ textAlign: "center", fontWeight: 900 })}>RETIRADA NA LOJA</p>}

      {/* Cabeçalho das colunas — igual ao cupom de referência */}
      <div style={{ display: "flex", fontSize: 11, margin: "2px 0" }}>
        <span style={{ flex: 1 }}>ITEM CÓD DESCRIÇÃO</span>
        <span style={{ width: "13mm", textAlign: "right" }}>QTD UN.</span>
        <span style={{ width: "22mm", textAlign: "right" }}>VL ITEM</span>
      </div>
      <Divisor />

      {itens.map((item, idx) => (
        <div key={item.id} style={{ margin: "5px 0" }}>
          <div style={{ display: "flex", alignItems: "flex-start", fontSize: 14 }}>
            <span style={{ flex: 1, textTransform: "uppercase", paddingRight: 4 }}>
              {idx + 1} {String(idx + 1).padStart(3, "0")} {item.nome_produto}
              {item.variante ? ` — ${item.variante}` : ""}
            </span>
            <span style={{ width: "13mm", textAlign: "right", whiteSpace: "nowrap" }}>UN {item.quantidade}</span>
            <span style={{ width: "22mm", textAlign: "right", whiteSpace: "nowrap" }}>{formatarMoeda(item.total)}</span>
          </div>
          {item.observacao && <p style={p({ fontSize: 12, paddingLeft: "6mm" })}>OBS: {item.observacao}</p>}
          {!!item.desconto && item.desconto > 0 && (
            <p style={p({ fontSize: 12, paddingLeft: "6mm" })}>
              Desconto: {formatarMoeda(item.desconto)}
              {item.motivo_desconto ? ` (${item.motivo_desconto})` : ""}
            </p>
          )}
        </div>
      ))}
      <Divisor />

      <Linha esquerda="SUBTOTAL" direita={formatarMoeda(somaItens)} tamanho={14} />
      {!!custoAdicional && custoAdicional > 0 && (
        <Linha
          esquerda={`CUSTO ADICIONAL${descricaoCustoAdicional ? ` (${descricaoCustoAdicional})` : ""}`}
          direita={formatarMoeda(custoAdicional)}
          tamanho={14}
        />
      )}
      {diferenca > 0 && (
        <Linha
          esquerda={`DESCONTO${motivoDescontoGeral ? ` (${motivoDescontoGeral})` : ""}`}
          direita={`- ${formatarMoeda(diferenca)}`}
          tamanho={14}
        />
      )}
      {diferenca < 0 && <Linha esquerda="ACRÉSCIMO" direita={`+ ${formatarMoeda(-diferenca)}`} tamanho={14} />}

      <div style={{ margin: "8px 0 2px", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: 20, fontWeight: 900 }}>TOTAL</span>
        <span style={{ fontSize: 22, fontWeight: 900 }}>{formatarMoeda(total)}</span>
      </div>
      {pagamentos && pagamentos.length > 0 ? (
        pagamentos.map((pg, i) => (
          <Linha
            key={i}
            esquerda={`${pg.forma.toUpperCase()}${pg.parcelas > 1 ? ` ${pg.parcelas}X` : ""}`}
            direita={formatarMoeda(pg.valorAPagar)}
            tamanho={14}
          />
        ))
      ) : (
        <Linha esquerda={formaPagamento.toUpperCase()} direita={formatarMoeda(total)} tamanho={14} />
      )}
      <Divisor />

      {prazoEntregaMaximo && (
        <p style={p({ textAlign: "center", fontSize: 13, fontWeight: 900 })}>
          {prazoDiasUteis
            ? `PRAZO MÁXIMO: ${prazoDiasUteis} DIAS ÚTEIS — ATÉ ${new Date(
                `${prazoEntregaMaximo}T00:00:00`
              ).toLocaleDateString("pt-BR")}`
            : `PRAZO MÁXIMO: ${new Date(`${prazoEntregaMaximo}T00:00:00`).toLocaleDateString("pt-BR")}`}
        </p>
      )}
      <p style={p({ textAlign: "center", fontSize: 14, margin: "8px 0 0" })}>OBRIGADO PELA PREFERÊNCIA!</p>
      <p style={p({ textAlign: "center", fontSize: 10, margin: "6px 0 0" })}>Este documento não é fiscal.</p>
    </div>
  );
}
