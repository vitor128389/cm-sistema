// Monta itens e pagamentos de uma venda no formato da Focus (usado pela NF-e).
// Mesma regra da NFC-e: o sistema guarda o preço "a prazo" nos itens e o total da venda é o valor pago;
// a diferença vai como desconto (ou outras despesas) para a nota fechar com o total.
import { type AmbienteFiscal, apenasDigitos, arred, codigoPagamento } from "@/lib/focusNfe";

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function montarItensEPagamentos(
  admin: any,
  venda: any,
  ambiente: AmbienteFiscal,
  opcoes: { foraDoEstado: boolean; pisCofins?: string }
): Promise<{ erro: string } | { itens: Record<string, unknown>[]; formas: Record<string, unknown>[]; totalVenda: number }> {
  const itens = (venda.venda_itens || []) as Array<{
    produto_id: string | null;
    nome_produto: string;
    variante: string | null;
    quantidade: number;
    total: number;
    trocado?: boolean;
  }>;
  const itensNota = itens.filter((i) => !i.trocado);
  if (itensNota.length === 0) return { erro: "Venda sem itens." };

  const ids = Array.from(new Set(itensNota.map((i) => i.produto_id).filter(Boolean))) as string[];
  const { data: produtos } = await admin.from("produtos").select("id, nome, ncm, ncm_validado, cfop, csosn, unidade").in("id", ids);
  const mapa = new Map<string, any>((produtos || []).map((p: any) => [p.id, p]));

  const semNcm = itensNota
    .filter((i) => {
      const p = i.produto_id ? mapa.get(i.produto_id) : null;
      return !p || apenasDigitos(p.ncm).length !== 8;
    })
    .map((i) => i.nome_produto);
  if (semNcm.length > 0) return { erro: `Falta o NCM (8 dígitos) no cadastro de: ${Array.from(new Set(semNcm)).join(", ")}.` };

  if (ambiente === "producao") {
    const nao = itensNota.filter((i) => !mapa.get(i.produto_id as string)?.ncm_validado).map((i) => i.nome_produto);
    if (nao.length > 0) {
      return { erro: `NCM ainda não conferido pela contadora: ${Array.from(new Set(nao)).join(", ")}. Marque "NCM conferido" no cadastro do produto.` };
    }
  }

  const somaItens = arred(itensNota.reduce((s, i) => s + Number(i.total), 0));
  const totalVenda = arred(Number(venda.total));
  const dif = arred(somaItens - totalVenda);
  let restante = Math.abs(dif);
  const pc = opcoes.pisCofins || "49";

  const itensPayload = itensNota.map((i, idx) => {
    const p = mapa.get(i.produto_id as string);
    const bruto = arred(Number(i.total));
    let ajuste = 0;
    if (restante > 0) {
      ajuste = idx === itensNota.length - 1 ? restante : Math.min(restante, arred((bruto / somaItens) * Math.abs(dif)));
      ajuste = arred(ajuste);
      restante = arred(restante - ajuste);
    }
    const qtd = Number(i.quantidade);
    const descricao = i.variante ? `${i.nome_produto} - ${i.variante}` : i.nome_produto;
    const unit = arred(bruto / qtd) === bruto / qtd ? bruto / qtd : Number((bruto / qtd).toFixed(4));
    let cfop: string = p.cfop || "5102";
    if (opcoes.foraDoEstado && cfop.startsWith("5")) cfop = "6" + cfop.slice(1);
    const item: Record<string, unknown> = {
      numero_item: idx + 1,
      codigo_produto: (i.produto_id as string).slice(0, 8).toUpperCase(),
      descricao: descricao.slice(0, 120),
      codigo_ncm: apenasDigitos(p.ncm),
      cfop,
      unidade_comercial: p.unidade || "UN",
      quantidade_comercial: qtd,
      valor_unitario_comercial: unit,
      unidade_tributavel: p.unidade || "UN",
      quantidade_tributavel: qtd,
      valor_unitario_tributavel: unit,
      valor_bruto: bruto,
      icms_origem: 0,
      icms_situacao_tributaria: p.csosn || "103",
      pis_situacao_tributaria: pc,
      cofins_situacao_tributaria: pc,
    };
    if (dif > 0 && ajuste > 0) item.valor_desconto = ajuste;
    if (dif < 0 && ajuste > 0) item.valor_outras_despesas = ajuste;
    return item;
  });

  const pagsBanco = (venda.venda_pagamentos || []) as Array<{ forma_pagamento: string; valor: number }>;
  const pags = pagsBanco.length > 0 ? pagsBanco : [{ forma_pagamento: venda.forma_pagamento, valor: totalVenda }];
  const formas = pags.map((p) => {
    const cod = codigoPagamento(p.forma_pagamento);
    const f: Record<string, unknown> = { forma_pagamento: cod, valor_pagamento: arred(Number(p.valor)) };
    if (cod === "03" || cod === "04") {
      f.tipo_integracao = "2";
      f.bandeira_operadora = "99";
    }
    return f;
  });
  const somaPag = arred(formas.reduce((s, f) => s + (f.valor_pagamento as number), 0));
  if (somaPag !== totalVenda) {
    const ult = formas[formas.length - 1];
    ult.valor_pagamento = arred((ult.valor_pagamento as number) + (totalVenda - somaPag));
  }
  return { itens: itensPayload, formas, totalVenda };
}
