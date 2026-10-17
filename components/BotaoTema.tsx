"use client";

import { useEffect, useState } from "react";
import Icone from "@/components/Icones";

// Alterna entre modo claro e escuro. A escolha fica salva no navegador
// (localStorage "tema") e a classe "dark" é aplicada no <html> — o script
// no <head> do layout já aplica antes da tela aparecer, pra não piscar.
export default function BotaoTema() {
  const [escuro, setEscuro] = useState(false);

  useEffect(() => {
    setEscuro(document.documentElement.classList.contains("dark"));
  }, []);

  function alternar() {
    const novo = !escuro;
    setEscuro(novo);
    document.documentElement.classList.toggle("dark", novo);
    try {
      localStorage.setItem("tema", novo ? "dark" : "light");
    } catch {
      /* navegador sem localStorage — vale só até recarregar */
    }
  }

  return (
    <button
      type="button"
      onClick={alternar}
      title={escuro ? "Modo claro" : "Modo escuro"}
      aria-label={escuro ? "Ativar modo claro" : "Ativar modo escuro"}
      className="w-8 h-8 rounded-full border border-estofado-100 flex items-center justify-center text-madeira-600 hover:bg-madeira-50"
    >
      <Icone nome={escuro ? "sol" : "lua"} tamanho={16} />
    </button>
  );
}
