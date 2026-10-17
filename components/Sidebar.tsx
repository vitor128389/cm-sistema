"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { obterPermissoesEfetivas, type Tela } from "@/lib/permissoes";
import { useLoja } from "@/contexts/LojaContext";
import { useMenu } from "@/contexts/MenuContext";
import Icone, { type NomeIcone } from "@/components/Icones";

type Item = { href: string; label: string; tela: Tela };
type Grupo = { id: string; label: string; icone: NomeIcone; itens: Item[] };

// Painel fica solto no topo; o resto é organizado em grupos que abrem/fecham.
const PAINEL: Item = { href: "/", label: "Painel", tela: "painel" };
const GRUPOS: Grupo[] = [
  {
    id: "cadastros",
    label: "Cadastros",
    icone: "clientes",
    itens: [
      { href: "/produtos", label: "Produtos", tela: "produtos" },
      { href: "/clientes", label: "Clientes", tela: "clientes" },
    ],
  },
  {
    id: "comercial",
    label: "Comercial",
    icone: "vender",
    itens: [
      { href: "/vender", label: "Vender", tela: "vender" },
      { href: "/orcamentos", label: "Orçamentos", tela: "orcamentos" },
      { href: "/encomendas", label: "Encomendas", tela: "encomendas" },
      { href: "/notas", label: "Notas", tela: "notas" },
      { href: "/trocas", label: "Trocas", tela: "trocas" },
    ],
  },
  {
    id: "financeiro",
    label: "Financeiro",
    icone: "caixa",
    itens: [
      { href: "/caixa", label: "Caixa", tela: "caixa" },
      { href: "/movimento", label: "Movimento", tela: "movimento" },
    ],
  },
  {
    id: "suprimentos",
    label: "Suprimentos",
    icone: "deposito",
    itens: [{ href: "/deposito", label: "Depósito", tela: "deposito" }],
  },
  {
    id: "fiscal",
    label: "Fiscal",
    icone: "fiscal",
    itens: [{ href: "/fiscal", label: "Notas fiscais (NFC-e / NF-e)", tela: "fiscal" }],
  },
  {
    id: "config",
    label: "Configurações",
    icone: "administracao",
    itens: [
      { href: "/administracao", label: "Administração", tela: "administracao" },
      { href: "/ia", label: "Assistente IA", tela: "ia" },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [emailUsuario, setEmailUsuario] = useState<string | null>(null);
  const [funcaoUsuario, setFuncaoUsuario] = useState<string | null>(null);
  const [permissoes, setPermissoes] = useState<Record<Tela, boolean> | null>(null);
  const { souAdmin, lojas, lojaAtual, setLojaAtual } = useLoja();
  const { menuAberto, fecharMenu } = useMenu();
  const [fechados, setFechados] = useState<Record<string, boolean>>({});
  const [abertosManual, setAbertosManual] = useState<Record<string, boolean>>({});

  useEffect(() => {
    async function carregarUsuario() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setEmailUsuario(user.email ?? null);

      const { funcao, permissoes: efetivas } = await obterPermissoesEfetivas(supabase, user.id);
      setFuncaoUsuario(funcao);
      setPermissoes(efetivas);
    }
    carregarUsuario();

    // Se a sessão ainda não tinha carregado no primeiro momento (comum logo
    // após o login ou ao abrir a página em outro dispositivo), isso reage
    // assim que ela ficar disponível, sem precisar recarregar a página.
    const { data: listener } = supabase.auth.onAuthStateChange((_evento, session) => {
      if (session?.user) carregarUsuario();
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function sair() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  if (pathname === "/login") return null;

  const podeVer = (item: Item) => !!permissoes && permissoes[item.tela];
  const rotaAtiva = (href: string) => (href === "/" ? pathname === "/" : !!pathname?.startsWith(href));

  return (
    <>
      {/* fundo escurecido atrás da gaveta, só no celular, quando aberta —
          clicar nele fecha o menu */}
      {menuAberto && (
        <div className="fixed inset-0 bg-black/50 z-30 md:hidden" onClick={fecharMenu} />
      )}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-40 w-64 md:w-56 shrink-0 bg-black text-madeira-100 min-h-screen flex flex-col transform transition-transform duration-200 md:translate-x-0 ${
          menuAberto ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="px-6 py-7 border-b border-white/10 text-center">
          <img src="/logo.webp" alt="Caruaru Móveis e Estofados" className="w-full max-w-[150px] mx-auto" />
        </div>
        {souAdmin && lojas.length > 0 && (
          <div className="px-4 pt-4">
            <label className="block">
              <span className="text-[10px] text-madeira-400 uppercase tracking-wide mb-1 block">Loja ativa</span>
              <select
                className="w-full text-xs bg-white/5 border border-white/10 text-white rounded px-2 py-1.5"
                value={lojaAtual ?? ""}
                onChange={(e) => setLojaAtual(e.target.value || null)}
              >
                {lojas.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nome}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto">
          {podeVer(PAINEL) && (
            <Link
              href={PAINEL.href}
              onClick={fecharMenu}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                rotaAtiva("/") ? "bg-[#204411] text-white" : "text-madeira-200 hover:bg-[#204411]/50 hover:text-white"
              }`}
            >
              <Icone nome="painel" tamanho={18} />
              <span>Painel</span>
            </Link>
          )}
          {GRUPOS.map((g) => {
            const visiveis = g.itens.filter(podeVer);
            if (visiveis.length === 0) return null;
            const temAtivo = visiveis.some((i) => rotaAtiva(i.href));
            // aberto se o usuário abriu, ou se a página atual é daqui (a menos que ele tenha fechado)
            const aberto = fechados[g.id] ? false : abertosManual[g.id] || temAtivo;
            return (
              <div key={g.id}>
                <button
                  type="button"
                  onClick={() => {
                    if (aberto) {
                      setFechados((f) => ({ ...f, [g.id]: true }));
                      setAbertosManual((a) => ({ ...a, [g.id]: false }));
                    } else {
                      setFechados((f) => ({ ...f, [g.id]: false }));
                      setAbertosManual((a) => ({ ...a, [g.id]: true }));
                    }
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                    temAtivo ? "text-white" : "text-madeira-200 hover:bg-[#204411]/50 hover:text-white"
                  }`}
                  aria-expanded={aberto}
                >
                  <Icone nome={g.icone} tamanho={18} />
                  <span className="flex-1 text-left truncate">{g.label}</span>
                  <Icone nome="seta" tamanho={14} className={`transition-transform ${aberto ? "rotate-180" : ""}`} />
                </button>
                {aberto && (
                  <div className="ml-[21px] mt-0.5 mb-1 pl-3 border-l border-white/15 space-y-0.5">
                    {visiveis.map((item) => {
                      const ativo = rotaAtiva(item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={fecharMenu}
                          className={`block px-3 py-1.5 rounded-md text-[13px] transition-colors ${
                            ativo
                              ? "bg-[#204411] text-white"
                              : "text-madeira-300 hover:bg-[#204411]/50 hover:text-white"
                          }`}
                        >
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
        <div className="px-6 py-4 border-t border-white/10">
          {emailUsuario && (
            <div className="mb-3">
              <p className="text-xs text-white truncate">{emailUsuario}</p>
              {funcaoUsuario && (
                <p className="text-[10px] text-madeira-400 uppercase tracking-wide mt-0.5">
                  {funcaoUsuario}
                </p>
              )}
            </div>
          )}
          <button
            onClick={sair}
            className="flex items-center gap-2 text-xs text-madeira-300 hover:text-white transition-colors"
          >
            <Icone nome="sair" tamanho={14} />
            Sair
          </button>
        </div>
      </aside>
    </>
  );
}
