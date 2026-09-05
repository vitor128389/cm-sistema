"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const router = useRouter();
  const supabase = createClient();
  const searchParams = useSearchParams();
  const desativado = searchParams.get("desativado") === "1";

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setCarregando(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: senha,
    });

    setCarregando(false);

    if (error) {
      setErro(`Erro: ${error.message}`);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-madeira-50 px-4">
      <form onSubmit={entrar} className="w-full max-w-sm">
        <div className="text-center mb-8">
          <p className="font-display text-2xl text-madeira-900">Caruaru Móveis</p>
          <p className="text-sm text-madeira-500 mt-1">painel da equipe</p>
        </div>

        <div className="card p-6 space-y-4">
          {desativado && (
            <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded p-3">
              Esse acesso foi desativado. Fale com o administrador se achar que isso é um engano.
            </div>
          )}
          {erro && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">
              {erro}
            </div>
          )}

          <label className="block">
            <span className="text-xs text-madeira-600 mb-1 block">E-mail</span>
            <input
              type="email"
              required
              className="input-base"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
            />
          </label>

          <label className="block">
            <span className="text-xs text-madeira-600 mb-1 block">Senha</span>
            <input
              type="password"
              required
              className="input-base"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
            />
          </label>

          <button className="btn-primario w-full" disabled={carregando}>
            {carregando ? "Entrando..." : "Entrar"}
          </button>
        </div>

        <p className="text-xs text-madeira-400 text-center mt-6">
          Esqueceu a senha? Peça pro administrador criar um novo acesso pra você
          no painel do Supabase.
        </p>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
