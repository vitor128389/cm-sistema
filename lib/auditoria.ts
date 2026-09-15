import { supabase } from "@/lib/supabase";

export type CategoriaAuditoria =
  | "Produtos"
  | "Estoque"
  | "Vendas"
  | "Clientes"
  | "Encomendas"
  | "Entregas"
  | "Trocas"
  | "Devoluções"
  | "Caixa"
  | "Sangrias"
  | "Usuários"
  | "Permissões"
  | "Configurações"
  | "Outros";

export type AcaoAuditoria =
  | "criacao"
  | "alteracao"
  | "exclusao"
  | "entrada_estoque"
  | "saida_estoque"
  | "transferencia"
  | "cancelamento"
  | "outro";

export interface EntradaAuditoria {
  categoria: CategoriaAuditoria;
  acao: AcaoAuditoria;
  tipoExecucao?: "manual" | "automatica";
  registroTipo?: string; // "produto", "cliente", "venda", "usuario"...
  registroId?: string;
  registroNome?: string; // nome amigável pra exibir na listagem (nome do produto, cliente, etc.)
  numeroPedido?: number;
  descricao: string; // resumo curto — aparece na coluna "Detalhes" da listagem
  dadosAntes?: Record<string, unknown> | null;
  dadosDepois?: Record<string, unknown> | null;
  motivo?: string;
}

// Cache simples do perfil de quem está logado — evita buscar de novo em
// toda ação de auditoria dentro da mesma sessão (só refaz se mudar).
let perfilCache: { userId: string; nome: string | null; email: string | null; funcao: string | null; lojaId: string | null; lojaNome: string | null } | null = null;

async function obterPerfilAtual() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  if (perfilCache && perfilCache.userId === user.id) return perfilCache;

  const { data: perfil } = await supabase
    .from("usuarios")
    .select("nome, email, funcao, loja_id")
    .eq("id", user.id)
    .maybeSingle();

  let lojaNome: string | null = null;
  if (perfil?.loja_id) {
    const { data: loja } = await supabase.from("lojas").select("nome").eq("id", perfil.loja_id).maybeSingle();
    lojaNome = loja?.nome || null;
  }

  perfilCache = {
    userId: user.id,
    nome: perfil?.nome || null,
    email: perfil?.email || user.email || null,
    funcao: perfil?.funcao || null,
    lojaId: perfil?.loja_id || null,
    lojaNome,
  };
  return perfilCache;
}

// Registra uma ação na Auditoria — sempre identifica automaticamente quem
// está logado (nunca aceita um "responsável" escolhido manualmente). Se
// der qualquer erro, só avisa no console: um problema na auditoria NUNCA
// pode travar a ação de verdade que o usuário estava fazendo.
export async function registrarAuditoria(entrada: EntradaAuditoria): Promise<void> {
  try {
    const perfil = await obterPerfilAtual();
    if (!perfil) return; // sem sessão — não tem quem registrar (ex.: script/seed)

    await supabase.from("auditoria").insert({
      usuario_id: perfil.userId,
      usuario_nome: perfil.nome,
      usuario_email: perfil.email,
      usuario_funcao: perfil.funcao,
      loja_id: perfil.lojaId,
      loja_nome: perfil.lojaNome,
      categoria: entrada.categoria,
      acao: entrada.acao,
      tipo_execucao: entrada.tipoExecucao || "manual",
      registro_tipo: entrada.registroTipo || null,
      registro_id: entrada.registroId || null,
      registro_nome: entrada.registroNome || null,
      numero_pedido: entrada.numeroPedido || null,
      descricao: entrada.descricao,
      dados_antes: entrada.dadosAntes || null,
      dados_depois: entrada.dadosDepois || null,
      motivo: entrada.motivo || null,
    });
  } catch (erro) {
    console.error("Erro ao registrar auditoria (ação principal não foi afetada):", erro);
  }
}

// Compara "antes" e "depois" e devolve só os campos que realmente mudaram
// — usado pra não logar campos que ficaram iguais. Devolve null se nada
// mudou de verdade.
export function apenasCamposAlterados(
  antes: Record<string, unknown>,
  depois: Record<string, unknown>
): { antes: Record<string, unknown>; depois: Record<string, unknown> } | null {
  const antesAlterado: Record<string, unknown> = {};
  const depoisAlterado: Record<string, unknown> = {};
  let houveAlteracao = false;

  for (const chave of Object.keys(depois)) {
    const valorAntes = antes[chave];
    const valorDepois = depois[chave];
    if (JSON.stringify(valorAntes) !== JSON.stringify(valorDepois)) {
      antesAlterado[chave] = valorAntes ?? null;
      depoisAlterado[chave] = valorDepois ?? null;
      houveAlteracao = true;
    }
  }

  return houveAlteracao ? { antes: antesAlterado, depois: depoisAlterado } : null;
}
