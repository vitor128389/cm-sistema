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

// Garante que a notinha A4 (Via da loja + Via do cliente) sempre caiba em
// 1 folha só, com o corte bem no meio — em vez de deixar o conteúdo
// estourar pra uma segunda página quando o pedido tem muita coisa
// (pagamento dividido, observação grande, muitos produtos, etc.), reduz a
// fonte só o suficiente pra caber. Pedidos curtos não são afetados —
// só encolhe quando realmente precisa.
export function ajustarEscalaImpressaoA4() {
  const area = document.getElementById("area-impressao");
  if (!area) return;

  const estiloOriginal = area.getAttribute("style") || "";
  area.style.fontSize = "";

  // #area-impressao fica com display:none fora da impressão (CSS base) —
  // pra medir o tamanho real do conteúdo é preciso forçar ele a aparecer
  // por um instante, fora da tela, sem o usuário nem perceber.
  area.style.display = "block";
  area.style.position = "fixed";
  area.style.left = "-99999px";
  area.style.top = "0";
  area.style.width = "194mm"; // largura real de impressão (A4 210mm - 8mm de margem dos 2 lados)
  area.style.height = "281mm";
  area.style.visibility = "visible";

  const alturaDisponivel = area.clientHeight;
  const alturaNecessaria = area.scrollHeight;

  let fonteAjustada = "";
  if (alturaDisponivel > 0 && alturaNecessaria > alturaDisponivel) {
    const fonteAtualPx = parseFloat(window.getComputedStyle(area).fontSize);
    // uma folguinha de 2% de segurança, pra garantir que cabe de verdade
    const fator = (alturaDisponivel / alturaNecessaria) * 0.98;
    fonteAjustada = `${fonteAtualPx * fator}px`;
  }

  // desfaz a exibição forçada (volta a ficar do jeito que a impressão de
  // verdade vai renderizar — escondido, controlado pelo @media print) e
  // só mantém a fonte ajustada, que essa sim precisa continuar valendo.
  area.setAttribute("style", estiloOriginal);
  if (fonteAjustada) area.style.fontSize = fonteAjustada;
}
