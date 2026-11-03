import { useEffect, useRef } from "react";

// Atualização automática da lista de produtos sem precisar dar F5 (que apagaria a venda em andamento).
// - Quando o produto/estoque é mexido em OUTRA ABA do mesmo navegador, a Administração avisa na hora.
// - Em outro computador/celular: atualiza ao voltar pra aba e a cada 30 segundos (com a aba aberta).
const CANAL = "cm-produtos";
const CHAVE = "cm-produtos-mudaram";

export function avisarProdutosMudaram(): void {
  try {
    if (typeof BroadcastChannel !== "undefined") {
      const bc = new BroadcastChannel(CANAL);
      bc.postMessage(Date.now());
      bc.close();
    }
    localStorage.setItem(CHAVE, String(Date.now())); // reserva p/ navegadores sem BroadcastChannel
  } catch {
    /* sem aviso, só não atualiza na hora */
  }
}

export function useProdutosAoVivo(recarregar: () => void | Promise<void>): void {
  const ref = useRef(recarregar);
  ref.current = recarregar;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const disparar = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void ref.current();
      }, 400);
    };
    const aoVoltar = () => {
      if (document.visibilityState === "visible") disparar();
    };
    const aoStorage = (e: StorageEvent) => {
      if (e.key === CHAVE) disparar();
    };

    let bc: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== "undefined") {
        bc = new BroadcastChannel(CANAL);
        bc.onmessage = disparar;
      }
    } catch {
      bc = null;
    }
    window.addEventListener("focus", disparar);
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("storage", aoStorage);
    const intervalo = setInterval(() => {
      if (document.visibilityState === "visible") void ref.current();
    }, 30000);

    return () => {
      if (timer) clearTimeout(timer);
      clearInterval(intervalo);
      window.removeEventListener("focus", disparar);
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("storage", aoStorage);
      bc?.close();
    };
  }, []);
}
