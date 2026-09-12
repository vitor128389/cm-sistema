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
// estourar pra uma segunda página (ou empurrar o corte pra fora do meio)
// quando o pedido tem muita coisa (pagamento dividido, observação grande,
// endereço bem longo, muitos produtos, etc.), reduz a fonte só o
// suficiente pra cada via caber na sua metade exata da folha. Pedidos
// curtos não são afetados — só encolhe quando alguma das duas vias
// realmente precisa.
export function ajustarEscalaImpressaoA4() {
  const area = document.getElementById("area-impressao");
  if (!area) return;
  area.style.fontSize = ""; // tira um ajuste de uma impressão anterior antes de medir de novo

  const vias = Array.from(area.querySelectorAll<HTMLElement>(".imp-via"));
  if (vias.length === 0) return;

  // cada via tem height fixo (138.5mm) — se o conteúdo de dentro precisar
  // de mais que isso, o próprio scrollHeight da via acusa. Mede cada via
  // com o clientHeight DELA MESMA (a segunda tem um pouquinho menos de
  // área útil por causa do padding/borda do separador).
  let piorRazao = 1; // 1 = coube perfeitamente; >1 = precisa encolher nessa proporção
  for (const via of vias) {
    const alturaAlvo = via.clientHeight;
    if (alturaAlvo > 0 && via.scrollHeight > alturaAlvo) {
      piorRazao = Math.max(piorRazao, via.scrollHeight / alturaAlvo);
    }
  }

  if (piorRazao > 1) {
    const fonteAtualPx = parseFloat(window.getComputedStyle(area).fontSize);
    // uma folguinha de 3% de segurança, pra garantir que cabe de verdade
    const fator = Math.max((1 / piorRazao) * 0.97, 0.62); // nunca encolhe abaixo de 62% (fica ilegível)
    area.style.fontSize = `${fonteAtualPx * fator}px`;
  }
}
