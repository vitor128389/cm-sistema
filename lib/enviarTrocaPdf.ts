import { supabase } from "@/lib/supabase";
import { carregarContextoTroca } from "@/lib/trocaContexto";
import { gerarTrocaPdf } from "@/lib/gerarTrocaPdf";
import type { LojaCompleta, TrocaGrupo } from "@/types";

// Gera o PDF da nota da troca e manda pro cliente: no celular abre o
// compartilhar do sistema já com o arquivo; no computador baixa o PDF e abre
// o WhatsApp na conversa do cliente pra anexar.
export async function enviarPdfTroca(t: TrocaGrupo) {
  let loja: LojaCompleta | null = null;
  if (t.loja_id) {
    const { data } = await supabase.from("lojas").select("*").eq("id", t.loja_id).maybeSingle();
    loja = data as LojaCompleta | null;
  }
  const ctx = await carregarContextoTroca(supabase, t);
  const blob = await gerarTrocaPdf(ctx.troca, ctx.restantes, loja);
  const pedido = t.vendas?.numero_pedido ?? "";
  const nomeArquivo = `troca-${t.numero_troca}-pedido-${pedido}.pdf`;
  const arquivo = new File([blob], nomeArquivo, { type: "application/pdf" });
  const cliente = t.vendas?.clientes?.nome || "cliente";

  if (typeof navigator !== "undefined" && "canShare" in navigator && navigator.canShare({ files: [arquivo] })) {
    try {
      await navigator.share({
        files: [arquivo],
        title: `Troca #${t.numero_troca}`,
        text: `Troca #${t.numero_troca} — pedido #${pedido} — ${cliente}`,
      });
    } catch {
      /* cancelou o compartilhamento */
    }
    return;
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeArquivo;
  link.click();
  URL.revokeObjectURL(url);

  const digitos = (t.vendas?.clientes?.telefone || "").replace(/\D/g, "");
  if (digitos.length >= 10) {
    const comDDI = digitos.length <= 11 ? `55${digitos}` : digitos;
    alert("PDF baixado. O WhatsApp vai abrir — é só anexar o arquivo baixado na conversa.");
    window.open(
      `https://wa.me/${comDDI}?text=${encodeURIComponent(`Segue a nota da troca #${t.numero_troca} (pedido #${pedido}) em PDF.`)}`,
      "_blank",
      "noopener"
    );
  } else {
    alert("PDF baixado. Esse cliente não tem celular cadastrado pra abrir o WhatsApp direto.");
  }
}
