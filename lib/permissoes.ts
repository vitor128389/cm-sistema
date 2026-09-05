import type { SupabaseClient } from "@supabase/supabase-js";

export const TELAS_PROTEGIDAS = [
  "vender",
  "produtos",
  "clientes",
  "encomendas",
  "notas",
  "trocas",
  "caixa",
  "movimento",
  "administracao",
] as const;

export type Tela = (typeof TELAS_PROTEGIDAS)[number];

// "/" (Painel) não entra aqui de propósito — todo mundo logado pode ver o Painel.
const ROTA_PARA_TELA: Record<string, Tela> = {
  "/vender": "vender",
  "/produtos": "produtos",
  "/clientes": "clientes",
  "/encomendas": "encomendas",
  "/notas": "notas",
  "/trocas": "trocas",
  "/caixa": "caixa",
  "/movimento": "movimento",
  "/administracao": "administracao",
};

export function telaDaRota(pathname: string): Tela | null {
  for (const [rota, tela] of Object.entries(ROTA_PARA_TELA)) {
    if (pathname === rota || pathname.startsWith(rota + "/")) return tela;
  }
  return null;
}

/**
 * Calcula o que o usuário pode acessar: começa com o padrão do cargo dele
 * (tabela `permissoes`), depois aplica por cima qualquer permissão
 * individual configurada pra essa pessoa (`usuario_permissoes`), que sempre
 * tem prioridade. Admin sempre tem acesso a tudo.
 */
export async function obterPermissoesEfetivas(
  supabase: SupabaseClient,
  userId: string
): Promise<{ funcao: string | null; permissoes: Record<Tela, boolean> }> {
  const { data: perfil } = await supabase
    .from("usuarios")
    .select("funcao")
    .eq("id", userId)
    .maybeSingle();
  const funcao = perfil?.funcao ?? null;

  const resultado = {} as Record<Tela, boolean>;

  if (funcao === "admin") {
    TELAS_PROTEGIDAS.forEach((t) => (resultado[t] = true));
    return { funcao, permissoes: resultado };
  }

  const { data: padrao } = funcao
    ? await supabase.from("permissoes").select("tela, pode_acessar").eq("funcao", funcao)
    : { data: [] as { tela: string; pode_acessar: boolean }[] | null };

  TELAS_PROTEGIDAS.forEach((t) => {
    resultado[t] = padrao?.find((p) => p.tela === t)?.pode_acessar ?? false;
  });

  const { data: excecoes } = await supabase
    .from("usuario_permissoes")
    .select("tela, pode_acessar")
    .eq("usuario_id", userId);

  (excecoes || []).forEach((e) => {
    if ((TELAS_PROTEGIDAS as readonly string[]).includes(e.tela)) {
      resultado[e.tela as Tela] = e.pode_acessar;
    }
  });

  return { funcao, permissoes: resultado };
}
