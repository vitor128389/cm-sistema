"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const NOMES_PAGINA: Record<string, string> = {
  "/": "Painel",
  "/vender": "Vender",
  "/produtos": "Produtos",
  "/clientes": "Clientes",
  "/encomendas": "Encomendas",
  "/notas": "Notas",
  "/caixa": "Caixa",
  "/movimento": "Movimento",
  "/administracao": "Administração",
};

export default function TopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [nome, setNome] = useState("");

  useEffect(() => {
    async function carregar() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: perfil } = await supabase.from("usuarios").select("nome").eq("id", user.id).maybeSingle();
      setNome(perfil?.nome || user.email?.split("@")[0] || "");
    }
    carregar();
  }, []);

  if (pathname === "/login") return null;

  const nomeAtual =
    Object.entries(NOMES_PAGINA).find(([rota]) => pathname === rota || pathname?.startsWith(rota + "/"))?.[1] ||
    "Painel";

  async function sair() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="h-14 bg-white border-b border-estofado-100 flex items-center justify-between px-6 sticky top-0 z-20">
      <div className="flex items-center gap-2 text-sm text-madeira-600 font-medium">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
        <span>{nomeAtual}</span>
      </div>
      <div className="flex items-center gap-4">
        {nome && (
          <span className="text-sm text-madeira-600">
            Bem-vindo, <strong className="text-madeira-900">{nome}</strong>
          </span>
        )}
        <button
          type="button"
          title="Notificações"
          className="relative w-8 h-8 rounded-full border border-estofado-100 flex items-center justify-center text-madeira-600 hover:bg-madeira-50"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </button>
        <button
          type="button"
          title="Sair"
          onClick={sair}
          className="w-8 h-8 rounded-full border border-estofado-100 flex items-center justify-center text-madeira-600 hover:bg-madeira-50"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
