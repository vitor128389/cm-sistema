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
// 1 folha só — em vez de deixar o conteúdo estourar pra uma segunda
// página quando o pedido tem muita coisa (pagamento dividido, endereço
// bem longo, muitos produtos, etc.), reduz a fonte só o suficiente pra
// cada via caber perto da sua metade da folha. Pedidos curtos não são
// afetados — só encolhe quando alguma das duas vias realmente precisa.
export function ajustarEscalaImpressaoA4() {
  const area = document.getElementById("area-impressao");
  if (!area) return;
  area.style.fontSize = ""; // tira um ajuste de uma impressão anterior antes de medir de novo

  const vias = Array.from(area.querySelectorAll<HTMLElement>(".imp-via"));
  if (vias.length === 0) return;

  // como cada via usa min-height (não height fixo — ver comentário no
  // CSS), ela nunca "estoura" a própria caixa, só cresce. Por isso, em
  // vez de comparar o scrollHeight da via contra ela mesma, mede contra
  // uma referência de verdade: um elemento provisório de exatamente
  // 138.5mm, só pra converter mm em pixels nessa tela/impressora.
  const referencia = document.createElement("div");
  referencia.style.height = "138.5mm";
  referencia.style.position = "absolute";
  referencia.style.visibility = "hidden";
  document.body.appendChild(referencia);
  const alturaAlvoPx = referencia.offsetHeight;
  document.body.removeChild(referencia);

  let piorRazao = 1; // 1 = coube perfeitamente; >1 = precisa encolher nessa proporção
  for (const via of vias) {
    if (alturaAlvoPx > 0 && via.scrollHeight > alturaAlvoPx) {
      piorRazao = Math.max(piorRazao, via.scrollHeight / alturaAlvoPx);
    }
  }

  if (piorRazao > 1) {
    const fonteAtualPx = parseFloat(window.getComputedStyle(area).fontSize);
    // uma folguinha de 3% de segurança, pra garantir que cabe de verdade
    const fator = Math.max((1 / piorRazao) * 0.97, 0.62); // nunca encolhe abaixo de 62% (fica ilegível)
    area.style.fontSize = `${fonteAtualPx * fator}px`;
  }
}
