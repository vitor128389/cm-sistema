import { supabase } from "@/lib/supabase";

// Chave de comparação do povoado: sem acento, minúscula, sem "pov"/"povoado" na frente.
export function chavePovoado(p: string): string {
  return p
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(povoado|pov\.?)\s+/, "")
    .trim();
}

// Rota que a loja definiu para esse povoado (null se nunca foi definida).
export async function rotaDoPovoado(lojaId: string, povoado: string): Promise<string | null> {
  const chave = chavePovoado(povoado);
  if (!lojaId || chave.length < 3) return null;
  const { data } = await supabase
    .from("povoado_rota")
    .select("rota_id")
    .eq("loja_id", lojaId)
    .eq("povoado_chave", chave)
    .maybeSingle();
  return data?.rota_id ?? null;
}

// Guarda (ou troca) a rota do povoado: a partir daí todo povoado igual já cai nela.
export async function gravarRotaDoPovoado(lojaId: string, povoado: string, rotaId: string | null) {
  const chave = chavePovoado(povoado);
  if (!lojaId || chave.length < 3) return;
  if (!rotaId) {
    await supabase.from("povoado_rota").delete().eq("loja_id", lojaId).eq("povoado_chave", chave);
    return;
  }
  await supabase
    .from("povoado_rota")
    .upsert(
      { loja_id: lojaId, povoado_chave: chave, povoado_nome: povoado.trim(), rota_id: rotaId, atualizado_em: new Date().toISOString() },
      { onConflict: "loja_id,povoado_chave" }
    );
}
