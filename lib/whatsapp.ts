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

interface ItemMensagem {
  nome_produto: string;
  variante: string | null;
  quantidade: number;
  tipo_entrega?: string | null;
}

// espessura ("5cm") vai colada no nome, como "CAMA CASAL 5CM"; tecido/cor vai depois de " - "
const texto = (nome: string, variante: string | null) => {
  if (!variante) return nome.toUpperCase();
  const sep = /^\d+([.,]\d+)?\s?cm$/i.test(variante.trim()) ? " " : " - ";
  return `${nome}${sep}${variante.replace(/\s+—\s+/g, " - ")}`.toUpperCase();
};

/**
 * Linhas "01 NOME - COR" das encomendas pra mensagem do grupo. Sofá "2 e 3
 * lugares" é salvo como dois itens (peça de 2 e peça de 3); aqui eles voltam
 * a ser UMA linha só: "01 SOFÁ TURQUIA 2 E 3 LUGARES - SUEDE - COR 05 (BLACK)".
 */
export function linhasEncomendaMensagem(itens: ItemMensagem[]): string[] {
  const linhas: string[] = [];
  const pecas = new Map<string, { nome: string; base: string; q2: number; q3: number; ordem: number }>();
  itens.forEach((i, ordem) => {
    const m = i.variante?.match(/^(.*?)\s+—\s+(2|3) Lugares$/);
    if (m && /2 E 3/i.test(i.nome_produto)) {
      const chave = `${i.nome_produto}|${m[1]}`;
      const g = pecas.get(chave) || { nome: i.nome_produto, base: m[1], q2: 0, q3: 0, ordem };
      if (m[2] === "2") g.q2 += i.quantidade;
      else g.q3 += i.quantidade;
      pecas.set(chave, g);
    } else {
      linhas.push(`${String(i.quantidade).padStart(2, "0")} ${texto(i.nome_produto, i.variante)}`);
    }
  });
  pecas.forEach((g) => {
    const conjuntos = Math.min(g.q2, g.q3);
    if (conjuntos > 0) linhas.push(`${String(conjuntos).padStart(2, "0")} ${texto(g.nome, g.base)}`);
    // sobrou só uma das peças (quantidades diferentes): vira linha da peça avulsa
    const nomeSo = (n: number) => g.nome.replace(/2 E 3 LUGARES/i, `${n} LUGARES`);
    if (g.q2 > conjuntos) linhas.push(`${String(g.q2 - conjuntos).padStart(2, "0")} ${texto(nomeSo(2), g.base)}`);
    if (g.q3 > conjuntos) linhas.push(`${String(g.q3 - conjuntos).padStart(2, "0")} ${texto(nomeSo(3), g.base)}`);
  });
  return linhas;
}
