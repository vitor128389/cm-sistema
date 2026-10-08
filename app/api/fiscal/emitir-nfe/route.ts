import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  type AmbienteFiscal,
  apenasDigitos,
  cnpjValido,
  consultarNota,
  cpfValido,
  enviarNota,
  normalizarResposta,
  tokenDaLoja,
} from "@/lib/focusNfe";
import { montarItensEPagamentos } from "@/lib/fiscalVenda";

export const maxDuration = 60;
const UF_EMITENTE = "SE";
const dorme = (ms: number) => new Promise((r) => setTimeout(r, ms));

function agoraBrasilia(): string {
  return new Date().toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" }).replace(" ", "T") + "-03:00";
}

export interface EnderecoNfe {
  cep: string;
  logradouro: string;
  numero: string;
  complemento?: string;
  bairro: string;
  municipio: string;
  uf: string;
  codigoMunicipio: string;
}
export interface DestinatarioNfe extends EnderecoNfe {
  tipo: "pf" | "pj";
  documento: string; // CPF ou CNPJ
  nome: string;
  situacaoIe?: "contribuinte" | "isento" | "nao_contribuinte";
  inscricaoEstadual?: string;
  email?: string;
  telefone?: string;
}

function validarEndereco(e: EnderecoNfe | undefined, rotulo: string): string | null {
  if (!e) return `Preencha o endereço ${rotulo}.`;
  if (apenasDigitos(e.cep).length !== 8) return `CEP ${rotulo} inválido.`;
  if (!e.logradouro?.trim() || !e.numero?.trim() || !e.bairro?.trim() || !e.municipio?.trim()) return `Endereço ${rotulo} incompleto (rua, número, bairro e cidade).`;
  if (!/^[A-Za-z]{2}$/.test(e.uf || "")) return `UF ${rotulo} inválida.`;
  if (apenasDigitos(e.codigoMunicipio).length !== 7) return `Código do município ${rotulo} não encontrado (use o botão de buscar CEP).`;
  return null;
}

// Emite a NF-e (modelo 55) de uma venda, com dados do destinatário e local de entrega.
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

  const { vendaId, destinatario: d, entrega } = (await request.json()) as {
    vendaId?: string;
    destinatario?: DestinatarioNfe;
    entrega?: (EnderecoNfe & { nome?: string }) | null;
  };
  if (!vendaId || !d) return NextResponse.json({ error: "Dados incompletos." }, { status: 400 });

  // ---- valida destinatário
  const doc = apenasDigitos(d.documento);
  if (d.tipo === "pf" ? !cpfValido(doc) : !cnpjValido(doc)) {
    return NextResponse.json({ error: d.tipo === "pf" ? "CPF inválido." : "CNPJ inválido." }, { status: 400 });
  }
  if (!d.nome?.trim() || d.nome.trim().length < 3) return NextResponse.json({ error: "Informe o nome do destinatário." }, { status: 400 });
  const erroEnd = validarEndereco(d, "do destinatário");
  if (erroEnd) return NextResponse.json({ error: erroEnd }, { status: 400 });
  let indicadorIe = 9;
  let consumidorFinal = 1;
  const ie = apenasDigitos(d.inscricaoEstadual);
  if (d.tipo === "pj") {
    if (d.situacaoIe === "contribuinte") {
      if (!ie) return NextResponse.json({ error: "Informe a inscrição estadual do cliente (ou escolha Isento / Não contribuinte)." }, { status: 400 });
      indicadorIe = 1;
      consumidorFinal = 0;
    } else if (d.situacaoIe === "isento") indicadorIe = 2;
  }
  if (entrega) {
    const e2 = validarEndereco(entrega, "de entrega");
    if (e2) return NextResponse.json({ error: e2 }, { status: 400 });
  }
  const foraDoEstado = d.uf.toUpperCase() !== UF_EMITENTE;

  const admin = createAdminClient();
  const { data: venda } = await admin.from("vendas").select("*, venda_itens(*), venda_pagamentos(*)").eq("id", vendaId).maybeSingle();
  if (!venda) return NextResponse.json({ error: "Venda não encontrada." }, { status: 404 });
  if (venda.cancelada) return NextResponse.json({ error: "Venda cancelada não emite nota." }, { status: 400 });

  const { data: loja } = await admin.from("lojas").select("*").eq("id", venda.loja_id).maybeSingle();
  if (!loja || !loja.fiscal_ativo || !loja.fiscal_chave) {
    return NextResponse.json({ error: "Essa loja ainda não está liberada para emitir nota fiscal." }, { status: 400 });
  }
  const cnpj = apenasDigitos(loja.cnpj);
  if (cnpj.length !== 14) return NextResponse.json({ error: "CNPJ da loja não está cadastrado corretamente." }, { status: 400 });
  const ambiente = (loja.fiscal_ambiente === "producao" ? "producao" : "homologacao") as AmbienteFiscal;
  const token = tokenDaLoja(loja.fiscal_chave, ambiente);
  if (!token) {
    return NextResponse.json(
      { error: `Token da Focus não configurado na Vercel (FOCUS_TOKEN_${String(loja.fiscal_chave).toUpperCase()}_${ambiente === "producao" ? "PROD" : "HOMOLOG"}).` },
      { status: 500 }
    );
  }

  const { data: anteriores } = await admin
    .from("notas_fiscais")
    .select("*")
    .eq("venda_id", vendaId)
    .eq("ambiente", ambiente)
    .order("criado_em", { ascending: false });
  const todas = anteriores || [];
  const vigente = todas.find((n) => n.tipo === "nfe" && (n.status === "autorizada" || n.status === "processando"));
  if (vigente) return NextResponse.json({ nota: vigente, jaExistia: true });
  if (todas.some((n) => n.tipo === "nfce" && (n.status === "autorizada" || n.status === "processando"))) {
    return NextResponse.json({ error: "Esse pedido já tem NFC-e. Cancele a NFC-e antes de emitir NF-e (não pode ter as duas)." }, { status: 400 });
  }

  const m = await montarItensEPagamentos(admin, venda, ambiente, { foraDoEstado });
  if ("erro" in m) return NextResponse.json({ error: m.erro }, { status: 400 });

  const payload: Record<string, unknown> = {
    natureza_operacao: "VENDA DE MERCADORIA",
    data_emissao: agoraBrasilia(),
    tipo_documento: 1,
    local_destino: foraDoEstado ? 2 : 1,
    finalidade_emissao: 1,
    consumidor_final: consumidorFinal,
    presenca_comprador: 1,
    modalidade_frete: entrega ? 0 : 9,
    cnpj_emitente: cnpj,
    nome_destinatario: ambiente === "producao" ? d.nome.trim() : "NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL",
    indicador_inscricao_estadual_destinatario: indicadorIe,
    logradouro_destinatario: d.logradouro.trim(),
    numero_destinatario: d.numero.trim(),
    bairro_destinatario: d.bairro.trim(),
    codigo_municipio_destinatario: apenasDigitos(d.codigoMunicipio),
    municipio_destinatario: d.municipio.trim(),
    uf_destinatario: d.uf.toUpperCase(),
    cep_destinatario: apenasDigitos(d.cep),
    pais_destinatario: "Brasil",
    itens: m.itens,
    formas_pagamento: m.formas,
  };
  if (d.tipo === "pf") payload.cpf_destinatario = doc;
  else payload.cnpj_destinatario = doc;
  if (indicadorIe === 1) payload.inscricao_estadual_destinatario = ie;
  if (d.complemento?.trim()) payload.complemento_destinatario = d.complemento.trim();
  if (apenasDigitos(d.telefone).length >= 10) payload.telefone_destinatario = apenasDigitos(d.telefone);
  if (d.email?.includes("@")) payload.email_destinatario = d.email.trim();

  if (entrega) {
    if (d.tipo === "pf") payload.cpf_entrega = doc;
    else payload.cnpj_entrega = doc;
    payload.nome_entrega = (entrega.nome?.trim() || d.nome.trim()).slice(0, 60);
    payload.logradouro_entrega = entrega.logradouro.trim();
    payload.numero_entrega = entrega.numero.trim();
    if (entrega.complemento?.trim()) payload.complemento_entrega = entrega.complemento.trim();
    payload.bairro_entrega = entrega.bairro.trim();
    payload.codigo_municipio_entrega = apenasDigitos(entrega.codigoMunicipio);
    payload.municipio_entrega = entrega.municipio.trim();
    payload.uf_entrega = entrega.uf.toUpperCase();
    payload.cep_entrega = apenasDigitos(entrega.cep);
  }

  const tentativa = todas.filter((n) => n.tipo === "nfe").length + 1;
  const referencia = `nfe-pedido-${venda.numero_pedido}-${String(loja.fiscal_chave).toLowerCase()}-${ambiente === "producao" ? "p" : "h"}${tentativa}`;

  const { data: registro, error: erroInsert } = await admin
    .from("notas_fiscais")
    .insert({
      venda_id: vendaId,
      loja_id: loja.id,
      tipo: "nfe",
      ambiente,
      referencia,
      status: "processando",
      usuario_id: user.id,
      dados: { destinatario: d, entrega: entrega || null },
    })
    .select("*")
    .single();
  if (erroInsert || !registro) {
    return NextResponse.json({ error: "Não consegui registrar a nota: " + (erroInsert?.message || "") }, { status: 500 });
  }

  let resposta = await enviarNota("nfe", ambiente, token, referencia, payload);
  let norm = normalizarResposta(ambiente, resposta);
  for (let i = 0; i < 12 && norm.status === "processando"; i++) {
    await dorme(2000);
    resposta = await consultarNota("nfe", ambiente, token, referencia);
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
