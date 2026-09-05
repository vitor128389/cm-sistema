import { supabase } from "./supabase";

export interface ResultadoConsultaCpf {
  encontrado: boolean;
  nome?: string;
  dataNascimento?: string;
  erro?: string;
}

/**
 * Consulta o nome do titular de um CPF via Edge Function (que por sua vez
 * chama a API da CPFHub.io usando uma chave secreta guardada no Supabase).
 * Use isso no formulário de cliente: assim que o CPF completar 11 dígitos,
 * chame essa função pra preencher o nome automaticamente.
 */
export async function consultarCpf(cpf: string): Promise<ResultadoConsultaCpf> {
  const cpfLimpo = cpf.replace(/\D/g, "");
  if (cpfLimpo.length !== 11) {
    return { encontrado: false };
  }

  const { data, error } = await supabase.functions.invoke("consulta-cpf", {
    body: { cpf: cpfLimpo },
  });

  if (error) {
    return { encontrado: false, erro: error.message };
  }
  return data as ResultadoConsultaCpf;
}
