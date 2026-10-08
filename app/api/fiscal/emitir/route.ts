import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  type AmbienteFiscal,
  apenasDigitos,
  arred,
  codigoPagamento,
  consultarNfce,
  cpfValido,
  enviarNfce,
  normalizarResposta,
  tokenDaLoja,
} from "@/lib/focusNfe";

export const maxDuration = 30;

const dorme = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Emite a NFC-e de uma venda (só quando alguém clica em "Emitir nota fiscal").
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { data: perfil } = await supabase.from("usuarios").select("funcao").eq("id", user.id).maybeSingle();
  if (!perfil || perfil.funcao === "producao") {
    return NextResponse.json({ error: "Seu usuário não pode emitir nota fiscal." }, { status: 403 });
  }

  const { vendaId } = (await request.json()) as { vendaId?: string };
  if (!vendaId) return NextResponse.json({ error: "Venda não informada." }, { status: 400 });

  const admin = createAdminClient();

  const { data: venda } = await admin
    .from("vendas")
    .select("*, clientes(nome, cpf), venda_itens(*), venda_pagamentos(*)")
    .eq("id", vendaId)
    .maybeSingle();
  if (!venda) return NextResponse.json({ error: "Venda não encontrada." }, { status: 404 });
  if (venda.cancelada) return NextResponse.json({ error: "Venda cancelada não emite nota." }, { status: 400 });

  const { data: loja } = await admin.from("lojas").select("*").eq("id", venda.loja_id).maybeSingle();
  if (!loja || !loja.fiscal_ativo || !loja.fiscal_chave) {
    return NextResponse.json({ error: "Essa loja ainda não está liberada para emitir nota fiscal." }, { status: 400 });
  }
  const cnpj = apenasDigitos(loja.cnpj);
  if (cnpj.length !== 14) {
    return NextResponse.json({ error: "CNPJ da loja não está cadastrado corretamente." }, { status: 400 });
  }
  const ambiente = (loja.fiscal_ambiente === "producao" ? "producao" : "homologacao") as AmbienteFiscal;
  const token = tokenDaLoja(loja.fiscal_chave, ambiente);
  if (!token) {
    return NextResponse.json(
      { error: `Token da Focus não configurado na Vercel (FOCUS_TOKEN_${String(loja.fiscal_chave).toUpperCase()}_${ambiente === "producao" ? "PROD" : "HOMOLOG"}).` },
      { status: 500 }
    );
  }

  // já tem nota dessa venda?
  const { data: anteriores } = await admin
    .from("notas_fiscais")
    .select("*")
    .eq("venda_id", vendaId)
    .eq("ambiente", ambiente)
    .order("criado_em", { ascending: false });
  const vigente = (anteriores || []).find((n) => n.status === "autorizada" || n.status === "processando");
  if (vigente) {
    return NextResponse.json({ nota: vigente, jaExistia: true });
  }

  // itens + dados fiscais dos produtos
  const itens = (venda.venda_itens || []) as Array<{
    id: string;
    produto_id: string | null;
    nome_produto: string;
    variante: string | null;
    quantidade: number;
    total: number;
    trocado?: boolean;
  }>;
  const itensNota = itens.filter((i) => !i.trocado);
  if (itensNota.length === 0) return NextResponse.json({ error: "Venda sem itens." }, { status: 400 });

  const idsProdutos = Array.from(new Set(itensNota.map((i) => i.produto_id).filter(Boolean))) as string[];
  const { data: produtos } = await admin
    .from("produtos")
    .select("id, nome, ncm, cfop, csosn, unidade")
    .in("id", idsProdutos);
  const mapaProdutos = new Map((produtos || []).map((p) => [p.id, p]));

  const semNcm = itensNota
    .filter((i) => {
      const p = i.produto_id ? mapaProdutos.get(i.produto_id) : null;
      return !p || apenasDigitos(p.ncm).length !== 8;
    })
    .map((i) => i.nome_produto);
  if (semNcm.length > 0) {
    return NextResponse.json(
      { error: `Falta o NCM (8 dígitos) no cadastro de: ${Array.from(new Set(semNcm)).join(", ")}.` },
      { status: 400 }
    );
  }

  // O sistema guarda o preço "a prazo" nos itens e o total da venda é o valor realmente pago.
  // A nota precisa fechar com o total pago: a diferença vai como desconto (ou outras despesas).
  const somaItens = arred(itensNota.reduce((s, i) => s + Number(i.total), 0));
  const totalVenda = arred(Number(venda.total));
  const dif = arred(somaItens - totalVenda); // >0 desconto, <0 acréscimo
  let restante = Math.abs(dif);
  const itensPayload = itensNota.map((i, idx) => {
    const p = mapaProdutos.get(i.produto_id as string)!;
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
    const item: Record<string, unknown> = {
      numero_item: idx + 1,
      codigo_produto: (i.produto_id as string).slice(0, 8).toUpperCase(),
      descricao: descricao.slice(0, 120),
      codigo_ncm: apenasDigitos(p.ncm),
      cfop: p.cfop || "5102",
      unidade_comercial: p.unidade || "UN",
      quantidade_comercial: qtd,
      valor_unitario_comercial: unit,
      unidade_tributavel: p.unidade || "UN",
      quantidade_tributavel: qtd,
      valor_unitario_tributavel: unit,
      valor_bruto: bruto,
      icms_origem: 0,
      icms_situacao_tributaria: p.csosn || "102",
    };
    if (dif > 0 && ajuste > 0) item.valor_desconto = ajuste;
    if (dif < 0 && ajuste > 0) item.valor_outras_despesas = ajuste;
    return item;
  });

  // pagamentos (precisam fechar com o total da nota)
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

  const payload: Record<string, unknown> = {
    natureza_operacao: "VENDA AO CONSUMIDOR",
    data_emissao: new Date().toISOString(),
    presenca_comprador: 1,
    modalidade_frete: 9,
    local_destino: 1,
    cnpj_emitente: cnpj,
    itens: itensPayload,
    formas_pagamento: formas,
  };
  const cpf = apenasDigitos(venda.clientes?.cpf);
  if (cpfValido(cpf)) {
    payload.cpf_destinatario = cpf;
    if (venda.clientes?.nome && ambiente === "producao") payload.nome_destinatario = venda.clientes.nome;
  }

  const tentativa = (anteriores || []).length + 1;
  const referencia = `pedido-${venda.numero_pedido}-${String(loja.fiscal_chave).toLowerCase()}-${ambiente === "producao" ? "p" : "h"}${tentativa}`;

  const { data: registro, error: erroInsert } = await admin
    .from("notas_fiscais")
    .insert({
      venda_id: vendaId,
      loja_id: loja.id,
      tipo: "nfce",
      ambiente,
      referencia,
      status: "processando",
      usuario_id: user.id,
    })
    .select("*")
    .single();
  if (erroInsert || !registro) {
    return NextResponse.json({ error: "Não consegui registrar a nota: " + (erroInsert?.message || "") }, { status: 500 });
  }

  let resposta = await enviarNfce(ambiente, token, referencia, payload);
  let norm = normalizarResposta(ambiente, resposta);

  // a Focus costuma devolver "processando"; espera um pouco pela SEFAZ
  for (let i = 0; i < 6 && norm.status === "processando"; i++) {
    await dorme(2000);
    resposta = await consultarNfce(ambiente, token, referencia);
    norm = normalizarResposta(ambiente, resposta);
  }

  const { data: atualizada } = await admin
    .from("notas_fiscais")
    .update({ ...norm, atualizado_em: new Date().toISOString() })
    .eq("id", registro.id)
    .select("*")
    .single();

  return NextResponse.json({ nota: atualizada });
}
