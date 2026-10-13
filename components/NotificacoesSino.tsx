"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useLoja } from "@/contexts/LojaContext";

interface Aniversariante {
  id: string;
  nome: string;
  telefone: string | null;
  idade: number;
  loja_id: string | null;
  loja_nome: string | null;
}

function hojeBahia(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Bahia" }).format(new Date()); // AAAA-MM-DD
}

function lerVisto(chave: string): boolean {
  try {
    return localStorage.getItem(chave) === "1";
  } catch {
    return false;
  }
}

function marcarVisto(chave: string) {
  try {
    localStorage.setItem(chave, "1");
  } catch {
    /* sem armazenamento: o aviso só volta a aparecer em outra visita */
  }
}

// Sino do topo: hoje avisa os aniversários do dia (cliente + loja).
export default function NotificacoesSino() {
  const { souAdmin, minhaLojaId, carregando } = useLoja();
  const [lista, setLista] = useState<Aniversariante[]>([]);
  const [aberto, setAberto] = useState(false);
  const [visto, setVisto] = useState(true);
  const caixa = useRef<HTMLDivElement>(null);
  const chaveVisto = `aniversarios-vistos-${hojeBahia()}`;

  useEffect(() => {
    if (carregando) return;
    async function carregar() {
      const { data } = await supabase.rpc("aniversariantes_hoje");
      let itens = (data || []) as Aniversariante[];
      // quem não é admin só vê a própria loja
      if (!souAdmin && minhaLojaId) itens = itens.filter((a) => a.loja_id === minhaLojaId);
      setLista(itens);
      setVisto(lerVisto(chaveVisto));
    }
    carregar();
    const intervalo = setInterval(carregar, 30 * 60 * 1000); // vira o dia sem precisar recarregar
    return () => clearInterval(intervalo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carregando, souAdmin, minhaLojaId]);

  useEffect(() => {
    function fora(e: MouseEvent) {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, []);

  function alternar() {
    const novo = !aberto;
    setAberto(novo);
    if (novo && lista.length > 0) {
      marcarVisto(chaveVisto);
      setVisto(true);
    }
  }

  function linkWhats(a: Aniversariante) {
    const n = (a.telefone || "").replace(/\D/g, "");
    if (n.length < 10) return null;
    const texto = encodeURIComponent(`Olá, ${a.nome.split(" ")[0]}! A equipe da Caruaru Móveis deseja a você um feliz aniversário! 🎉`);
    return `https://wa.me/55${n}?text=${texto}`;
  }

  return (
    <div className="relative" ref={caixa}>
      <button
        type="button"
        title="Notificações"
        onClick={alternar}
        className="relative w-8 h-8 rounded-full border border-estofado-100 flex items-center justify-center text-madeira-600 hover:bg-madeira-50"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {lista.length > 0 && !visto && (
          <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-red-600 text-white text-[10px] leading-4 text-center font-semibold">
            {lista.length}
          </span>
        )}
      </button>

      {aberto && (
        <div className="absolute right-0 mt-2 w-72 max-w-[calc(100vw-1.5rem)] bg-white border border-estofado-100 rounded-lg shadow-lg z-30">
          <div className="px-3 py-2 border-b border-estofado-100 text-sm font-semibold text-madeira-800">Notificações</div>
          {lista.length === 0 ? (
            <div className="px-3 py-4 text-sm text-madeira-500">Nenhuma notificação hoje.</div>
          ) : (
            <ul className="max-h-80 overflow-y-auto divide-y divide-estofado-100">
              {lista.map((a) => {
                const wa = linkWhats(a);
                return (
                  <li key={a.id} className="px-3 py-2 text-sm text-madeira-800">
                    <div>
                      🎂 Hoje é aniversário de <strong>{a.nome}</strong>
                      {a.loja_nome ? <> na loja <strong>{a.loja_nome.replace(/^Caruaru Móveis\s+/i, "")}</strong></> : null}
                      {a.idade > 0 && a.idade < 120 ? <> — faz {a.idade} anos</> : null}.
                    </div>
                    {wa && (
                      <a href={wa} target="_blank" rel="noreferrer" className="inline-block mt-1 text-xs text-green-700 underline">
                        Mandar parabéns no WhatsApp
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
