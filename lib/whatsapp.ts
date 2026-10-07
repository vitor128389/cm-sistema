/**
 * Abre o WhatsApp já com um texto pronto, SEM número: o WhatsApp pede pra
 * escolher o contato/grupo e é só apertar em enviar. (Não existe jeito de
 * mandar direto pra um grupo sem escolher.)
 * Tenta abrir o aplicativo direto; se o navegador não abrir nada, cai no
 * link web do WhatsApp.
 */
export function abrirWhatsAppComTexto(texto: string) {
  const codificado = encodeURIComponent(texto);
  const web = `https://wa.me/?text=${codificado}`;
  let saiu = false;
  const marcar = () => {
    saiu = true;
  };
  window.addEventListener("blur", marcar, { once: true });
  document.addEventListener("visibilitychange", marcar, { once: true });
  window.location.href = `whatsapp://send?text=${codificado}`;
  setTimeout(() => {
    window.removeEventListener("blur", marcar);
    document.removeEventListener("visibilitychange", marcar);
    if (!saiu) window.open(web, "_blank", "noopener");
  }, 1500);
}

/** "2026-10-15" (ou ISO completo) → "15/10/2026", sem erro de fuso. */
export function dataBr(data: string | null | undefined): string {
  const m = data?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
}
