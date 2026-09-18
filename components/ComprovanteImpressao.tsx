import { formatarMoeda } from "@/lib/format";
import type { VendaItem, LojaCompleta } from "@/types";

// Paleta de cores da notinha — mudar só aqui já reflete em toda a
// impressão (Via da loja e Via do cliente).
const COR_VERDE_ESCURO = "#123C2E";
const COR_VERDE_FUNDO = "#E8F1EC";
const COR_TEXTO = "#111111";
const COR_SECUNDARIO = "#666666";
const COR_AVISO = "#9E2525";
const COR_LARANJA = "#C2660D";
const COR_AZUL = "#1D4E7A";
const COR_ROXO = "#5B3A8E";

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
  rotaNome?: string | null;
  rotaCor?: string | null;
  cliente: ClienteResumo;
  itens: VendaItem[];
  total: number;
  formaPagamento: string;
  pagamentos?: PagamentoResumo[];
  prazoEntregaMaximo?: string | null;
  prazoDiasUteis?: number | null;
  loja?: LojaCompleta | null;
  tag?: string;
  lojasPorId?: Record<string, string>;
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

// Sofá "2 e 3 lugares" vendido como conjunto vira 2 linhas no carrinho
// (uma peça de 2 e outra de 3 lugares) porque cada peça baixa do estoque
// separadamente — mas na impressão isso deve aparecer como 1 produto só,
// com o nome "... — 2 e 3 Lugares" e o valor somado. Só mescla quando os 2
// realmente formam um par certinho (mesmo produto, mesmo tecido, não
// mistura pronta entrega com encomenda nem retirada com entrega).
function mesclarConjuntosSofa(itens: VendaItem[]): VendaItem[] {
  const resultado: VendaItem[] = [];
  const usados = new Set<number>();

  itens.forEach((item, i) => {
    if (usados.has(i)) return;
    const variante = item.variante || "";
    if (variante.endsWith("— 2 Lugares")) {
      const prefixo = variante.slice(0, -"2 Lugares".length); // ex: "Suede — "
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
        // se o nome do produto já diz "2 e 3 Lugares" (caso comum desse
        // tipo de sofá), não repete isso de novo na variante — só o
        // tecido mesmo, ou nada se não tiver tecido.
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

function linhaItem(
  item: VendaItem,
  itens: VendaItem[],
  total: number,
  qtd: number,
  ehViaLoja: boolean,
  lojasPorId: Record<string, string> | undefined,
  mostrarColunaVU: boolean
) {
  // O valor de cada linha é sempre o valor real do item, do jeito que foi
  // vendido — nunca redistribuído proporcionalmente pelo total pago (isso
  // causava números estranhos quando o pagamento era dividido em mais de
  // uma forma). A divisão de pagamento aparece certinho na seção própria
  // dela, embaixo, sem precisar mexer no valor de cada produto.
  const totalLinha = Math.round((item.total / item.quantidade) * qtd * 100) / 100;
  const valorUnitario = qtd > 0 ? Math.round((totalLinha / qtd) * 100) / 100 : 0;
  const nomeLojaOrigem = item.origem_loja_id ? lojasPorId?.[item.origem_loja_id] : null;

  // Origem/situação do produto — cada item verifica a própria origem
  // individualmente, então um pedido misto mostra cada linha certinha.
  // Prioridade: encomenda > depósito > estoque de outra loja > própria loja.
  let situacaoTexto: string;
  let situacaoCor: string;
  if (item.tipo_entrega === "encomenda") {
    situacaoTexto = "ENCOMENDA";
    situacaoCor = COR_LARANJA;
  } else if (item.origem_deposito) {
    situacaoTexto = "DEPÓSITO";
    situacaoCor = COR_AZUL;
  } else if (nomeLojaOrigem) {
    situacaoTexto = `LOJA ${nomeLojaOrigem.toUpperCase()}`;
    situacaoCor = COR_ROXO;
  } else {
    situacaoTexto = "PRONTA ENTREGA";
    situacaoCor = COR_VERDE_ESCURO;
  }

  return (
    <tr key={item.id + "-" + qtd}>
      <td style={{ color: COR_TEXTO }}>
        {item.nome_produto}{" "}
        <span style={{ color: ehViaLoja ? situacaoCor : COR_TEXTO, fontWeight: ehViaLoja ? 700 : 400 }}>
          ({situacaoTexto})
        </span>
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
      {mostrarColunaVU && (
        <td style={{ color: COR_TEXTO }}>{qtd >= 2 ? formatarMoeda(valorUnitario) : ""}</td>
      )}
      <td style={{ color: COR_TEXTO }}>{formatarMoeda(totalLinha)}</td>
    </tr>
  );
}

function ViaComprovante({
  numeroPedido,
  rotaNome,
  rotaCor,
  cliente,
  itens,
  total,
  formaPagamento,
  pagamentos,
  prazoEntregaMaximo,
  prazoDiasUteis,
  loja,
  tag,
  lojasPorId,
  rotulo,
}: Props & { rotulo: string }) {
  const ehViaLoja = rotulo === "Via da loja";
  itens = mesclarConjuntosSofa(itens);
  // a coluna de valor unitário só aparece quando o pedido tem mais de um
  // produto — com um produto só, o valor unitário não ajuda muito, já dá
  // pra ver óbvio no total.
  const mostrarColunaVU = itens.length > 1;
  const enderecoLoja = enderecoLojaTexto(loja);
  const enderecoCliente = enderecoClienteTexto(cliente);
  const cpfFormatado = formatarCpf(cliente.cpf);
  // Mostra o prazo sempre que ele foi preenchido — o formulário já só
  // pede/mostra esse campo quando é relevante (encomenda, ou entrega
  // dividida com retirada), então bastar ter um valor aqui já garante que
  // faz sentido mostrar. Antes isso exigia também ter algum item marcado
  // como "encomenda", o que escondia o prazo em vendas mistas (retirada +
  // entrega) mesmo com o prazo preenchido e salvo.
  const temPrazo = !!prazoEntregaMaximo;

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
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
          <span className="imp-numero-pedido">#{numeroPedido}</span>
          {rotaNome && ehViaLoja && (
            <span
              style={{
                display: "block",
                marginTop: 3,
                fontSize: "0.68rem",
                fontWeight: 700,
                textAlign: "right",
                color: rotaCor || COR_TEXTO,
                border: `1px solid ${rotaCor || COR_TEXTO}`,
                borderRadius: 4,
                padding: "1px 6px",
              }}
            >
              {rotaNome.toUpperCase()}
            </span>
          )}
        </div>
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
      {cliente.cidade && (
        <p style={{ margin: "0.5px 0", color: COR_TEXTO }}>
          Cidade: {ehViaLoja ? <strong>{cliente.cidade}</strong> : cliente.cidade}
        </p>
      )}
      {cliente.povoado && (
        <p style={{ margin: "0.5px 0", color: COR_TEXTO }}>
          Povoado: {ehViaLoja ? <strong>{cliente.povoado}</strong> : cliente.povoado}
        </p>
      )}

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
                {mostrarColunaVU && (
                  <th style={{ backgroundColor: COR_VERDE_FUNDO, color: COR_VERDE_ESCURO, fontWeight: 700 }}>
                    V.U.
                  </th>
                )}
                <th style={{ backgroundColor: COR_VERDE_FUNDO, color: COR_VERDE_ESCURO, fontWeight: 700 }}>
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {itensRetirada.map((item) =>
                linhaItem(item, itens, total, item.quantidade_retirada ?? item.quantidade, ehViaLoja, lojasPorId, mostrarColunaVU)
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
                {mostrarColunaVU && (
                  <th style={{ backgroundColor: COR_VERDE_FUNDO, color: COR_VERDE_ESCURO, fontWeight: 700 }}>
                    V.U.
                  </th>
                )}
                <th style={{ backgroundColor: COR_VERDE_FUNDO, color: COR_VERDE_ESCURO, fontWeight: 700 }}>
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {itensEntrega.map((item) =>
                linhaItem(item, itens, total, item.quantidade_entrega ?? item.quantidade, ehViaLoja, lojasPorId, mostrarColunaVU)
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
                {mostrarColunaVU && (
                  <th style={{ backgroundColor: COR_VERDE_FUNDO, color: COR_VERDE_ESCURO, fontWeight: 700 }}>
                    V.U.
                  </th>
                )}
                <th style={{ backgroundColor: COR_VERDE_FUNDO, color: COR_VERDE_ESCURO, fontWeight: 700 }}>
                  Total
                </th>
              </tr>
            </thead>
            <tbody>{itens.map((item) => linhaItem(item, itens, total, item.quantidade, ehViaLoja, lojasPorId, mostrarColunaVU))}</tbody>
          </table>
        </>
      )}

      {(() => {
        const descontoTotal = itens.reduce((s, i) => s + (i.desconto || 0), 0);
        if (descontoTotal <= 0) return null;
        return (
          <p style={{ margin: "2px 0 0", color: COR_TEXTO, fontSize: "0.8rem" }}>
            Subtotal: {formatarMoeda(total + descontoTotal)} — Desconto:{" "}
            <strong style={{ color: COR_AVISO }}>{formatarMoeda(descontoTotal)}</strong>
          </p>
        );
      })()}

      {pagamentos && pagamentos.length > 1 ? (
        <>
          <p style={{ marginTop: 6, marginBottom: 1, color: COR_TEXTO }}>
            <strong>Pagamento dividido:</strong>
          </p>
          {pagamentos.map((p, idx) => (
            <p key={idx} style={{ margin: "0.5px 0", color: COR_TEXTO }}>
              {p.forma}
              {(p.forma === "Crédito" || p.forma === "Link") && p.parcelas > 1 ? ` ${p.parcelas}x` : ""}: {formatarMoeda(p.valorAPagar)}
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
        <p
          style={{
            margin: "2px 0",
            color: COR_TEXTO,
            backgroundColor: "#E8E8E8",
            display: "block",
            width: "fit-content",
            padding: "1px 6px",
            borderRadius: 3,
          }}
        >
          {prazoDiasUteis
            ? `PRAZO MÁXIMO: ${prazoDiasUteis} DIAS ÚTEIS — ATÉ ${new Date(
                `${prazoEntregaMaximo}T00:00:00`
              ).toLocaleDateString("pt-BR")}`
            : `Prazo máximo: ${new Date(`${prazoEntregaMaximo}T00:00:00`).toLocaleDateString("pt-BR")}`}
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
            Compras presenciais não possuem devolução por arrependimento ou desistência. O direito de
            arrependimento de 7 dias aplica-se apenas às compras realizadas fora da loja, conforme Art. 49 do CDC
            (Lei nº 8.078/90). Casos de defeito seguem o Art. 18 do CDC.
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
