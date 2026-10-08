import { NextResponse } from "next/server";
import JSZip from "jszip";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { type AmbienteFiscal, consultarNota, hostFocus, type TipoNota, tokenDaLoja } from "@/lib/focusNfe";

export const maxDuration = 60;

// Pacote mensal para a contadora: ZIP com os XMLs das notas (autorizadas e canceladas)
// + planilha CSV com o relatório. Só notas de PRODUÇÃO (teste não vale nada fiscalmente).
// GET /api/fiscal/contabilidade?lojaId=...&de=AAAA-MM-DD&ate=AAAA-MM-DD
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { data: perfil } = await supabase.from("usuarios").select("funcao").eq("id", user.id).maybeSingle();
  if (perfil?.funcao !== "admin" && perfil?.funcao !== "gerente") {
    return NextResponse.json({ error: "Só admin ou gerente gera o pacote da contadora." }, { status: 403 });
  }

  const p = new URL(request.url).searchParams;
  const lojaId = p.get("lojaId");
  const de = p.get("de");
  const ate = p.get("ate");
  const dataOk = (d: string | null) => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);
  if (!lojaId || !dataOk(de) || !dataOk(ate) || de! > ate!) {
    return NextResponse.json({ error: "Informe a loja e um período válido." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: loja } = await admin.from("lojas").select("nome, fiscal_chave").eq("id", lojaId).maybeSingle();
  if (!loja?.fiscal_chave) return NextResponse.json({ error: "Loja sem nota fiscal configurada." }, { status: 400 });

  const fim = new Date(new Date(`${ate}T00:00:00-03:00`).getTime() + 24 * 3600 * 1000).toISOString();
  const { data: notas } = await admin
    .from("notas_fiscais")
    .select("*, vendas(numero_pedido, total)")
    .eq("loja_id", lojaId)
    .eq("ambiente", "producao")
    .in("status", ["autorizada", "cancelada"])
    .gte("criado_em", new Date(`${de}T00:00:00-03:00`).toISOString())
    .lt("criado_em", fim)
    .order("criado_em", { ascending: true });

  if (!notas || notas.length === 0) {
    return NextResponse.json({ error: "Nenhuma nota fiscal real emitida nesse período." }, { status: 404 });
  }

  const token = tokenDaLoja(loja.fiscal_chave, "producao");
  if (!token) return NextResponse.json({ error: "Token da Focus não configurado." }, { status: 500 });
  const host = hostFocus("producao" as AmbienteFiscal);
  const auth = { Authorization: "Basic " + Buffer.from(`${token}:`).toString("base64") };

  async function baixar(url: string | null | undefined): Promise<Buffer | null> {
    if (!url) return null;
    const abs = url.startsWith("http") ? url : host + url;
    if (!abs.startsWith(host)) return null;
    try {
      const r = await fetch(abs, { headers: auth, cache: "no-store" });
      return r.ok ? Buffer.from(await r.arrayBuffer()) : null;
    } catch {
      return null;
    }
  }

  const zip = new JSZip();
  const linhas: string[][] = [];
  const faltando: string[] = [];
  let totalAutorizado = 0;
  let qtdAutorizada = 0;
  let qtdCancelada = 0;

  type Nota = (typeof notas)[number];
  async function processar(n: Nota) {
    const venda = n.vendas as { numero_pedido?: number; total?: number } | null;
    const valor = Number(venda?.total ?? 0);
    const rotuloTipo = n.tipo === "nfe" ? "NFe" : "NFCe";
    const base = `${rotuloTipo}-${String(n.serie ?? "")}-${String(n.numero ?? "")}`;
    const xml = await baixar(n.url_xml);
    if (xml) zip.file(`XML/${base}.xml`, xml);
    else faltando.push(`${base} (XML da nota)`);
    if (n.status === "cancelada") {
      // o XML do cancelamento vem na consulta da nota
      let xmlCanc: Buffer | null = null;
      try {
        const c = (await consultarNota((n.tipo || "nfce") as TipoNota, "producao", token!, n.referencia)).corpo;
        xmlCanc = await baixar(typeof c.caminho_xml_cancelamento === "string" ? c.caminho_xml_cancelamento : null);
      } catch {}
      if (xmlCanc) zip.file(`XML/${base}-cancelamento.xml`, xmlCanc);
      else faltando.push(`${base} (XML do cancelamento)`);
    }
    linhas.push([
      new Date(n.criado_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
      String(venda?.numero_pedido ?? ""),
      rotuloTipo,
      String(n.serie ?? ""),
      String(n.numero ?? ""),
      n.status === "cancelada" ? "Cancelada" : "Autorizada",
      valor.toFixed(2).replace(".", ","),
      String(n.chave ?? "").replace(/\D/g, ""),
    ]);
    if (n.status === "autorizada") {
      totalAutorizado += valor;
      qtdAutorizada++;
    } else qtdCancelada++;
  }
  for (let i = 0; i < notas.length; i += 5) await Promise.all(notas.slice(i, i + 5).map(processar));
  linhas.sort((a, b) => a[0].localeCompare(b[0]) || Number(a[4]) - Number(b[4]));

  const cel = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const csv = [
    ["Data/hora emissão", "Pedido", "Tipo", "Série", "Nº da nota", "Situação", "Valor (R$)", "Chave de acesso"],
    ...linhas,
    [],
    ["Notas autorizadas", String(qtdAutorizada), "", "", "", "", totalAutorizado.toFixed(2).replace(".", ","), ""],
    ["Notas canceladas", String(qtdCancelada)],
  ]
    .map((l) => l.map(cel).join(";"))
    .join("\r\n");
  zip.file(`Relatorio-notas-${de}-a-${ate}.csv`, "﻿" + csv);
  if (faltando.length) zip.file("AVISO-arquivos-nao-encontrados.txt", "Não foi possível baixar:\r\n" + faltando.join("\r\n"));

  const bytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  const nomeLoja = String(loja.nome).normalize("NFD").replace(/[^\w]+/g, "-");
  return new NextResponse(bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="Notas-fiscais-${nomeLoja}-${de}-a-${ate}.zip"`,
      "Cache-Control": "private, no-store",
    },
  });
}
