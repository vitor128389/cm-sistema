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
}

interface Props {
  numeroPedido: number;
  cliente: ClienteResumo | null;
  itens: VendaItem[];
  total: number;
  formaPagamento: string;
  prazoEntregaMaximo?: string | null;
  loja?: LojaCompleta | null;
}

// Cupom enxuto pra impressora térmica de 88mm — sem via da loja/cliente,
// sem assinatura, só o essencial: produto, endereço, total. Pensado pra
// caber na largura estreita do rolo (sem tabela, tudo em linhas simples).
export default function ComprovanteCupom88mm({
  numeroPedido,
  cliente,
  itens,
  total,
  formaPagamento,
  prazoEntregaMaximo,
  loja,
}: Props) {
  const linha = "-".repeat(32);

  return (
    <div
      style={{
        width: "80mm",
        padding: "2mm",
        fontFamily: "'Courier New', monospace",
        fontSize: "12px",
        fontWeight: 700,
        color: "#000",
        lineHeight: 1.45,
        WebkitFontSmoothing: "none" as never,
      }}
    >
      <p style={{ textAlign: "center", fontWeight: 700, fontSize: "14px", margin: "0 0 2px" }}>
        {loja?.nome || "Caruaru Móveis"}
      </p>
      {loja?.telefone && <p style={{ textAlign: "center", margin: "0 0 4px" }}>Tel: {loja.telefone}</p>}
      <p style={{ margin: "2px 0" }}>{linha}</p>

      <p style={{ margin: "2px 0", fontWeight: 700 }}>PEDIDO #{numeroPedido}</p>
      <p style={{ margin: "2px 0" }}>{new Date().toLocaleString("pt-BR")}</p>
      <p style={{ margin: "2px 0" }}>{linha}</p>

      {cliente ? (
        <>
          <p style={{ margin: "2px 0" }}>Cliente: {cliente.nome}</p>
          {cliente.telefone && <p style={{ margin: "2px 0" }}>Cel: {cliente.telefone}</p>}
          {cliente.endereco && (
            <p style={{ margin: "2px 0" }}>
              End: {cliente.endereco}
              {cliente.numero ? `, ${cliente.numero}` : ""}
            </p>
          )}
          {cliente.complemento && <p style={{ margin: "2px 0" }}>{cliente.complemento}</p>}
          {cliente.cidade && <p style={{ margin: "2px 0" }}>Cidade: {cliente.cidade}</p>}
          {cliente.povoado && <p style={{ margin: "2px 0" }}>Povoado: {cliente.povoado}</p>}
        </>
      ) : (
        <p style={{ margin: "2px 0" }}>Venda sem cliente</p>
      )}
      <p style={{ margin: "2px 0" }}>{linha}</p>

      {itens.map((item) => (
        <div key={item.id} style={{ margin: "3px 0" }}>
          <p style={{ margin: 0 }}>
            {item.quantidade}x {item.nome_produto}
            {item.variante ? ` — ${item.variante}` : ""}
          </p>
          <p style={{ margin: 0, textAlign: "right" }}>{formatarMoeda(item.total)}</p>
        </div>
      ))}
      <p style={{ margin: "2px 0" }}>{linha}</p>

      <p style={{ margin: "2px 0", fontWeight: 700, fontSize: "14px" }}>TOTAL: {formatarMoeda(total)}</p>
      <p style={{ margin: "2px 0" }}>Pagamento: {formaPagamento}</p>
      {prazoEntregaMaximo && (
        <p style={{ margin: "2px 0" }}>
          Prazo máximo: {new Date(`${prazoEntregaMaximo}T00:00:00`).toLocaleDateString("pt-BR")}
        </p>
      )}
      <p style={{ margin: "6px 0 0", textAlign: "center" }}>Obrigado pela preferência!</p>
    </div>
  );
}
