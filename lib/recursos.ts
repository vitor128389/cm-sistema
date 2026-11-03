import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

// Recursos que a Administração liga/desliga (tabela `configuracoes`, criada no supabase-schema-v33.sql).
// Se a tabela ainda não existir ou der erro, o recurso fica DESLIGADO (o jeito seguro).
export const RECURSO_PAGAMENTO_NA_ENTREGA = "pagamento_na_entrega";

export async function lerRecurso(chave: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.from("configuracoes").select("valor").eq("chave", chave).maybeSingle();
    if (error) return false;
    return data?.valor === "true";
  } catch {
    return false;
  }
}

export async function gravarRecurso(chave: string, ligado: boolean): Promise<string | null> {
  const { error } = await supabase
    .from("configuracoes")
    .upsert({ chave, valor: ligado ? "true" : "false", atualizado_em: new Date().toISOString() }, { onConflict: "chave" });
  return error ? error.message : null;
}

// Fica de olho: atualiza ao voltar pra aba, então quem está vendendo pega a mudança sem F5.
export function useRecurso(chave: string): boolean {
  const [ligado, setLigado] = useState(false);
  useEffect(() => {
    let vivo = true;
    const ler = () => {
      lerRecurso(chave).then((v) => {
        if (vivo) setLigado(v);
      });
    };
    ler();
    const aoVoltar = () => {
      if (document.visibilityState === "visible") ler();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("focus", ler);
    const t = setInterval(aoVoltar, 60000);
    return () => {
      vivo = false;
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("focus", ler);
      clearInterval(t);
    };
  }, [chave]);
  return ligado;
}
