"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";

export interface Loja {
  id: string;
  nome: string;
  ativo: boolean;
}

interface LojaContextValor {
  carregando: boolean;
  souAdmin: boolean;
  minhaLojaId: string | null; // loja fixa da pessoa (null só pra admin)
  lojas: Loja[]; // todas as lojas cadastradas (só populado pra admin)
  lojaAtual: string | null; // loja "ativa" agora — usada em toda venda/cadastro novo
  setLojaAtual: (id: string | null) => void;
}

const LojaContext = createContext<LojaContextValor | null>(null);

const CHAVE_LOCALSTORAGE = "caruaru-loja-ativa";

export function LojaProvider({ children }: { children: ReactNode }) {
  const [carregando, setCarregando] = useState(true);
  const [souAdmin, setSouAdmin] = useState(false);
  const [minhaLojaId, setMinhaLojaId] = useState<string | null>(null);
  const [lojas, setLojas] = useState<Loja[]>([]);
  const [lojaAtual, setLojaAtualState] = useState<string | null>(null);

  function setLojaAtual(id: string | null) {
    setLojaAtualState(id);
    if (id) localStorage.setItem(CHAVE_LOCALSTORAGE, id);
    else localStorage.removeItem(CHAVE_LOCALSTORAGE);
  }

  async function carregar() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setCarregando(false);
      return;
    }

    const { data: perfil } = await supabase
      .from("usuarios")
      .select("funcao, loja_id")
      .eq("id", user.id)
      .maybeSingle();

    const admin = perfil?.funcao === "admin";
    setSouAdmin(admin);
    setMinhaLojaId(perfil?.loja_id ?? null);

    if (admin) {
      const { data: todasLojas } = await supabase.from("lojas").select("*").eq("ativo", true).order("nome");
      setLojas((todasLojas || []) as Loja[]);

      const salva = localStorage.getItem(CHAVE_LOCALSTORAGE);
      if (salva && todasLojas?.some((l) => l.id === salva)) {
        setLojaAtualState(salva);
      } else if (todasLojas && todasLojas.length > 0) {
        setLojaAtualState(todasLojas[0].id);
      }
    } else {
      setLojaAtualState(perfil?.loja_id ?? null);
    }

    setCarregando(false);
  }

  useEffect(() => {
    carregar();
    const { data: listener } = supabase.auth.onAuthStateChange((_evento, session) => {
      if (session?.user) carregar();
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  return (
    <LojaContext.Provider
      value={{ carregando, souAdmin, minhaLojaId, lojas, lojaAtual, setLojaAtual }}
    >
      {children}
    </LojaContext.Provider>
  );
}

export function useLoja() {
  const ctx = useContext(LojaContext);
  if (!ctx) throw new Error("useLoja precisa estar dentro de <LojaProvider>");
  return ctx;
}
