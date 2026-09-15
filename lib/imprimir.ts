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

// Garante que a notinha A4 (Via da loja + Via do cliente) sempre caiba
// numa folha só, não importa quantos produtos tiver — reduz a fonte, o
// espaçamento da tabela e as margens (tudo escala junto, via a variável
// CSS --escala-impressao) só o suficiente pra caber, nunca escondendo ou
// cortando nada. Pedido curto continua do tamanho normal.
//
// Retorna uma Promise que só resolve depois que o navegador já pintou a
// escala nova na tela — chamar window.print() antes disso é o que causava
// bug de "calculou certo mas imprimiu do tamanho errado" nas tentativas
// anteriores.
export function ajustarEscalaImpressaoA4(): Promise<void> {
  return new Promise((resolve) => {
    const area = document.getElementById("area-impressao");
    if (!area) {
      resolve();
      return;
    }

    // tira qualquer escala de uma impressão anterior antes de medir de novo
    area.style.setProperty("--escala-impressao", "1");

    const estiloOriginal = area.getAttribute("style") || "";

    // #area-impressao fica com display:none fora da impressão — pra medir
    // o tamanho real do conteúdo (nessa mesma largura que vai pro papel)
    // precisa forçar ele a aparecer por um instante, fora da tela.
    area.style.display = "block";
    area.style.position = "fixed";
    area.style.left = "-99999px";
    area.style.top = "0";
    area.style.width = "194mm"; // largura real de impressão (A4 210mm - 8mm de margem dos 2 lados)
    area.style.visibility = "visible";

    // elemento de referência de exatamente 138.5mm, só pra converter
    // mm → px nessa tela/impressora certinho
    const referencia = document.createElement("div");
    referencia.style.height = "138.5mm";
    referencia.style.position = "absolute";
    referencia.style.visibility = "hidden";
    document.body.appendChild(referencia);
    const alturaAlvoPx = referencia.offsetHeight;
    document.body.removeChild(referencia);

    const vias = Array.from(area.querySelectorAll<HTMLElement>(".imp-via"));
    let piorRazao = 1; // 1 = coube perfeitamente; >1 = precisa encolher nessa proporção
    for (const via of vias) {
      if (alturaAlvoPx > 0 && via.scrollHeight > alturaAlvoPx) {
        piorRazao = Math.max(piorRazao, via.scrollHeight / alturaAlvoPx);
      }
    }

    let fatorFinal = "1";
    if (piorRazao > 1) {
      // uma folguinha de 3% de segurança; nunca encolhe abaixo de 40% do
      // tamanho normal, pra não virar um ponto ilegível em pedidos
      // absurdamente grandes — mas segura o suficiente pra praticamente
      // qualquer pedido do dia a dia caber numa folha só
      const fator = Math.max((1 / piorRazao) * 0.97, 0.4);
      fatorFinal = String(fator);
    }

    // desfaz a exibição forçada (volta a ficar do jeito que a impressão de
    // verdade vai renderizar — escondido, controlado pelo @media print) e
    // só mantém a escala calculada.
    area.setAttribute("style", estiloOriginal);
    area.style.setProperty("--escala-impressao", fatorFinal);

    // espera dois quadros de repintura — garante que o navegador já
    // aplicou visualmente a escala nova antes de mandar imprimir
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}
