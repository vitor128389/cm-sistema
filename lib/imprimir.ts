// Define o tamanho da página de impressão (@page) dinamicamente, na hora
// de imprimir — não dá pra deixar isso fixo no CSS porque a via A4 (duas
// vias por folha) e o cupom 88mm (impressora térmica) precisam de
// tamanhos de papel completamente diferentes. Isso injeta/atualiza uma
// tag <style> exclusiva pra essa regra, sempre antes do window.print().
export function definirTamanhoPagina(formato: "a4" | "cupom88") {
  const id = "pagina-impressao-dinamica";
  let tag = document.getElementById(id) as HTMLStyleElement | null;
  if (!tag) {
    tag = document.createElement("style");
    tag.id = id;
    document.head.appendChild(tag);
  }
  tag.textContent =
    formato === "cupom88"
      ? "@page { size: 80mm auto; margin: 0; }"
      : "@page { size: A4; margin: 8mm; }";
}
