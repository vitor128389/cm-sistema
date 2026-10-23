import { formatarMoeda } from "@/lib/format";
import type { ItemRestante } from "@/lib/trocaContexto";
import type { LojaCompleta, TrocaItemDevolvido, TrocaItemNovo } from "@/types";

const COR_VERDE_ESCURO = "#123C2E";
const COR_VERDE_FUNDO = "#E8F1EC";
const COR_LARANJA = "#C2660D";
const COR_AZUL = "#1D4E7A";

function origemInfo(i: { tipo_entrega?: string | null; origem_deposito?: boolean | null }) {
  if (i.tipo_entrega === "encomenda") return { texto: "ENCOMENDA", cor: COR_LARANJA };
  if (i.origem_deposito) return { texto: "DEPÓSITO", cor: COR_AZUL };
  return { texto: "PRONTA ENTREGA", cor: COR_VERDE_ESCURO };
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

export interface PropsComprovanteTroca {
  numeroTroca: number;
  numeroPedidoOriginal: number;
  cliente: ClienteResumo;
  devolvidos: TrocaItemDevolvido[];
  novos: TrocaItemNovo[];
  tipoPreco: "avista" | "aprazo";
  diferenca: number;
  diferencaCobrada?: number;
  parcelasDiferenca?: number;
  formaPagamentoDiferenca: string | null;
  loja?: LojaCompleta | null;
  rotaNome?: string | null;
  rotaCor?: string | null;
  criadoEm?: string | null;
  itensRestantes?: ItemRestante[];
}

// Sofá "2 e 3 lugares" trocado como conjunto é salvo em 2 linhas (peça de 2 e
// peça de 3 lugares) porque cada peça baixa do estoque separadamente — mas no
// comprovante aparece como UM produto só, com os valores somados.
export interface ItemMesclavel {
  produto_nome: string;
  variante: string | null;
  quantidade: number;
  valor_unitario_avista: number;
  valor_unitario_aprazo: number;
  tipo_entrega?: string | null;
  origem_deposito?: boolean | null;
}

export function mesclarConjuntosSofa<T extends ItemMesclavel>(itens: T[]): T[] {
  const resultado: T[] = [];
  const usados = new Set<number>();
  const padrao = /^(.*?)\s+—\s+(2|3) Lugares(.*)$/;

  itens.forEach((item, i) => {
    if (usados.has(i)) return;
    const m = item.variante ? padrao.exec(item.variante) : null;
    if (m && m[2] === "2") {
      const [, prefixo, , sufixo] = m;
      const idxPar = itens.findIndex((outro, j) => {
        if (j === i || usados.has(j) || !outro.variante) return false;
        const mo = padrao.exec(outro.variante);
        return (
          !!mo &&
          mo[2] === "3" &&
          mo[1] === prefixo &&
          mo[3] === sufixo &&
          outro.produto_nome === item.produto_nome &&
          outro.quantidade === item.quantidade &&
          (outro.tipo_entrega ?? null) === (item.tipo_entrega ?? null)
        );
      });
      if (idxPar !== -1) {
        const par = itens[idxPar];
        usados.add(i);
        usados.add(idxPar);
        const jaTemNoNome = item.produto_nome.toUpperCase().includes("2 E 3 LUGARES");
        resultado.push({
          ...item,
          variante: jaTemNoNome ? `${prefixo}${sufixo}` : `${prefixo} — 2 e 3 Lugares${sufixo}`,
          valor_unitario_avista: item.valor_unitario_avista + par.valor_unitario_avista,
          valor_unitario_aprazo: item.valor_unitario_aprazo + par.valor_unitario_aprazo,
        });
        return;
      }
    }
    resultado.push(item);
  });

  return resultado;
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
    c.bairro ? `Bairro: ${c.bairro}` : null,
    c.endereco && c.numero ? `${c.endereco}, ${c.numero}` : c.endereco,
    c.complemento,
    c.cidade,
    c.povoado ? `Povoado: ${c.povoado}` : null,
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
  diferencaCobrada,
  parcelasDiferenca,
  formaPagamentoDiferenca,
  loja,
  rotaNome,
  rotaCor,
  criadoEm,
  itensRestantes,
  rotulo,
}: PropsComprovanteTroca & { rotulo: string }) {
  const enderecoLoja = enderecoLojaTexto(loja);
  const enderecoCliente = enderecoClienteTexto(cliente);
  const devolvidosExibir = mesclarConjuntosSofa(devolvidos);
  const novosExibir = mesclarConjuntosSofa(novos);
  const tagOrigem = (i: { tipo_entrega?: string | null; origem_deposito?: boolean | null }) => {
    const o = origemInfo(i);
    const viaLoja = rotulo === "Via da loja";
    return (
      <span style={{ color: viaLoja ? o.cor : undefined, fontWeight: viaLoja ? 700 : 400 }}>({o.texto})</span>
    );
  };
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
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
          <span className="imp-numero-pedido">TROCA #{numeroTroca}</span>
          {rotaNome && rotulo === "Via da loja" && (
            <span
              style={{
                display: "block",
                marginTop: 3,
                fontSize: "0.68rem",
                fontWeight: 700,
                textAlign: "right",
                color: rotaCor || "#111",
                border: `1px solid ${rotaCor || "#111"}`,
                borderRadius: 4,
                padding: "1px 6px",
              }}
            >
              {rotaNome.toUpperCase()}
            </span>
          )}
        </div>
      </div>
      <p style={{ margin: "4px 0 6px", fontSize: "0.68rem", color: "#666" }}>
        {rotulo} · {(criadoEm ? new Date(criadoEm) : new Date()).toLocaleString("pt-BR")}
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
          {devolvidosExibir.map((d) => (
            <tr key={d.id}>
              <td>
                {d.produto_nome} {tagOrigem(d)}
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
          {novosExibir.map((n) => {
            const temBracosAlmofada = n.variante?.includes("Braços de Almofada");
            const varianteSemBracos = n.variante?.replace(/ — Braços de Almofada$/, "") || null;
            return (
              <tr key={n.id}>
                <td>
                  {n.produto_nome} {tagOrigem(n)}
                  {varianteSemBracos ? ` — ${varianteSemBracos}` : ""}
                  {temBracosAlmofada && (
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
                      BRAÇOS DE ALMOFADA
                    </span>
                  )}
                </td>
                <td>{n.quantidade}</td>
                <td>{formatarMoeda(valorItem(n, n.quantidade))}</td>
              </tr>
            );
          })}
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
          <strong>
            Diferença paga pelo cliente: {formatarMoeda(diferencaCobrada ?? diferenca)}
          </strong>
          {formaPagamentoDiferenca ? ` — Forma de pagamento: ${formaPagamentoDiferenca}` : ""}
          {parcelasDiferenca && parcelasDiferenca > 1 ? ` em ${parcelasDiferenca}x` : ""}
        </p>
      )}
      {diferenca < 0 && (
        <p style={{ margin: "4px 0" }}>
          <strong>Valor devolvido ao cliente: {formatarMoeda(Math.abs(diferenca))}</strong>
          {formaPagamentoDiferenca ? ` — Forma: ${formaPagamentoDiferenca}` : ""}
        </p>
      )}

      {itensRestantes && (
        <>
          <p style={{ fontWeight: 700, fontSize: "0.72rem", margin: "8px 0 2px" }}>
            SITUAÇÃO FINAL DO PEDIDO (o que o cliente fica com)
          </p>
          <table>
            <thead>
              <tr>
                <th>Produto</th>
                <th>Qtd.</th>
              </tr>
            </thead>
            <tbody>
              {[...itensRestantes, ...novosExibir].map((i, idx) => (
                <tr key={`${i.produto_nome}-${idx}`}>
                  <td>
                    {i.produto_nome} {tagOrigem(i)}
                    {i.variante ? ` — ${i.variante}` : ""}
                  </td>
                  <td>{i.quantidade}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <div style={{ marginTop: 10 }}>
        <p style={{ margin: "6px 0 2px" }}>Assinatura do cliente: ________________________</p>
        <p style={{ margin: "2px 0" }}>Data: ___ /___ /______</p>
      </div>
    </div>
  );
}

export default function ComprovanteTroca(props: PropsComprovanteTroca) {
  return (
    <>
      <ViaTroca {...props} rotulo="Via da loja" />
      <ViaTroca {...props} rotulo="Via do cliente" />
    </>
  );
}
