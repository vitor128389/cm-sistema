// Chamadas do navegador para as rotas de nota fiscal (app/api/fiscal/*).
export interface NotaFiscal {
  id: string;
  venda_id: string;
  loja_id: string | null;
  ambiente: "homologacao" | "producao";
  status: "processando" | "autorizada" | "erro" | "cancelada";
  numero: string | null;
  serie: string | null;
  chave: string | null;
  mensagem: string | null;
  url_danfe: string | null;
  url_xml: string | null;
  criado_em: string;
}

export async function chamarFiscal(rota: "emitir" | "consultar" | "cancelar", corpo: Record<string, unknown>): Promise<NotaFiscal> {
  const resp = await fetch(`/api/fiscal/${rota}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  const json = await resp.json();
  if (!resp.ok) throw new Error(json.error || "Erro ao falar com a nota fiscal.");
  return json.nota as NotaFiscal;
}
