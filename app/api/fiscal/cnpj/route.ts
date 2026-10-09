import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 30;

interface Dados {
  nome: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  municipio: string;
  uf: string;
  codigoMunicipio: string;
}

async function pegar(url: string) {
  const r = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "cm-sistema/1.0" }, cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}

const fontes: Array<(c: string) => Promise<Dados>> = [
  // 1) BrasilAPI
  async (c) => {
    const j = await pegar(`https://brasilapi.com.br/api/cnpj/v1/${c}`);
    return {
      nome: String(j.razao_social || ""),
      cep: String(j.cep || ""),
      logradouro: [j.descricao_tipo_de_logradouro, j.logradouro].filter(Boolean).join(" "),
      numero: String(j.numero || ""),
      complemento: String(j.complemento || ""),
      bairro: String(j.bairro || ""),
      municipio: String(j.municipio || ""),
      uf: String(j.uf || ""),
      codigoMunicipio: String(j.codigo_municipio_ibge || ""),
    };
  },
  // 2) CNPJ.ws (consulta pública)
  async (c) => {
    const j = await pegar(`https://publica.cnpj.ws/cnpj/${c}`);
    const e = j.estabelecimento || {};
    return {
      nome: String(j.razao_social || ""),
      cep: String(e.cep || ""),
      logradouro: [e.tipo_logradouro, e.logradouro].filter(Boolean).join(" "),
      numero: String(e.numero || ""),
      complemento: String(e.complemento || ""),
      bairro: String(e.bairro || ""),
      municipio: String(e.cidade?.nome || ""),
      uf: String(e.estado?.sigla || ""),
      codigoMunicipio: String(e.cidade?.ibge_id || ""),
    };
  },
  // 3) ReceitaWS
  async (c) => {
    const j = await pegar(`https://receitaws.com.br/v1/cnpj/${c}`);
    if (j.status === "ERROR") throw new Error(String(j.message));
    return {
      nome: String(j.nome || ""),
      cep: String(j.cep || "").replace(/\D/g, ""),
      logradouro: String(j.logradouro || ""),
      numero: String(j.numero || ""),
      complemento: String(j.complemento || ""),
      bairro: String(j.bairro || ""),
      municipio: String(j.municipio || ""),
      uf: String(j.uf || ""),
      codigoMunicipio: "",
    };
  },
];

// Consulta pública de CNPJ feita pelo servidor, com 3 fontes em sequência.
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const c = (new URL(request.url).searchParams.get("cnpj") || "").replace(/\D/g, "");
  if (c.length !== 14) return NextResponse.json({ error: "CNPJ inválido." }, { status: 400 });

  for (const f of fontes) {
    try {
      const d = await f(c);
      if (d.nome) return NextResponse.json(d);
    } catch {
      /* tenta a próxima fonte */
    }
  }
  return NextResponse.json({ error: "Não encontrei esse CNPJ nas consultas públicas." }, { status: 404 });
}
