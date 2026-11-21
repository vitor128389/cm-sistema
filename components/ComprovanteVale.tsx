import type { LojaCompleta } from "@/types";
import { formatarMoeda } from "@/lib/format";

export type DadosVale = {
  codigo: string;
  cliente_nome: string;
  observacao: string;
  valor: number;
  saldo: number;
  criado_em: string;
};

function enderecoLojaTexto(loja?: LojaCompleta | null): string | null {
  if (!loja) return null;
  const partes = [
    loja.rua && loja.numero ? `${loja.rua}, ${loja.numero}` : loja.rua,
    loja.bairro,
    loja.cidade && loja.estado ? `${loja.cidade}/${loja.estado}` : loja.cidade || loja.estado,
  ].filter(Boolean);
  return partes.length > 0 ? partes.join(" — ") : null;
}

function ViaVale({ vale, loja, rotulo }: { vale: DadosVale; loja?: LojaCompleta | null; rotulo: string }) {
  const endereco = enderecoLojaTexto(loja);
  return (
    <div className="imp-via">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 3 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "1rem" }}>{loja?.nome || "Caruaru Móveis"}</h2>
          {loja?.cnpj && <p style={{ margin: "1px 0 0", fontSize: "0.68rem", color: "#666" }}>CNPJ: {loja.cnpj}</p>}
          {endereco && <p style={{ margin: "1px 0 0", fontSize: "0.68rem", color: "#666" }}>{endereco}</p>}
        </div>
        <span className="imp-numero-pedido">{vale.codigo}</span>
      </div>
      <p style={{ margin: "4px 0 6px", fontSize: "0.68rem", color: "#666" }}>
        {rotulo} · {new Date(vale.criado_em).toLocaleString("pt-BR")}
      </p>

      <p style={{ fontWeight: 700, fontSize: "0.85rem", margin: "4px 0", textAlign: "center", border: "1px solid #222", padding: "3px" }}>
        VALE CRÉDITO
      </p>

      <p style={{ margin: "10px 0 2px" }}>
        Cliente: <strong>{vale.cliente_nome}</strong>
      </p>
      {vale.observacao && <p style={{ margin: "0 0 2px" }}>Obs.: {vale.observacao}</p>}

      <p style={{ margin: "14px 0 4px", textAlign: "center", fontSize: "0.75rem", color: "#555" }}>Valor do vale</p>
      <p style={{ margin: 0, textAlign: "center", fontSize: "1.9rem", fontWeight: 700 }}>{formatarMoeda(vale.valor)}</p>
      {vale.saldo !== vale.valor && (
        <p style={{ margin: "4px 0 0", textAlign: "center", fontSize: "0.8rem" }}>
          Saldo atual: <strong>{formatarMoeda(vale.saldo)}</strong>
        </p>
      )}

      <p style={{ margin: "12px 0 0", fontSize: "0.68rem", color: "#555", textAlign: "center" }}>
        Vale válido em todas as lojas, mediante apresentação deste comprovante.
      </p>

      <div style={{ marginTop: 14 }}>
        <p style={{ margin: "6px 0 2px" }}>Assinatura do cliente: ________________________</p>
        <p style={{ margin: "2px 0" }}>Data: ___ /___ /______</p>
      </div>
    </div>
  );
}

export default function ComprovanteVale(props: { vale: DadosVale; loja?: LojaCompleta | null }) {
  return (
    <>
      <ViaVale {...props} rotulo="Via da loja" />
      <ViaVale {...props} rotulo="Via do cliente" />
    </>
  );
}
