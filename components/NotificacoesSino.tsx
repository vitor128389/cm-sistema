"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useLoja } from "@/contexts/LojaContext";

interface Lembrete {
  id: string;
  titulo: string;
  data_hora: string;
  concluido: boolean;
}

function formatarQuando(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// valor padrão do campo de data/hora: daqui a 1 hora, no fuso do navegador
function padraoDataHora(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

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
  const [lembretes, setLembretes] = useState<Lembrete[]>([]);
  const [agora, setAgora] = useState(() => Date.now());
  const [novoTitulo, setNovoTitulo] = useState("");
  const [novoQuando, setNovoQuando] = useState(padraoDataHora);
  const [criando, setCriando] = useState(false);
  const [copiadoId, setCopiadoId] = useState<string | null>(null);
  const [erroLembrete, setErroLembrete] = useState("");
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

  async function carregarLembretes() {
    const { data } = await supabase
      .from("lembretes")
      .select("id, titulo, data_hora, concluido")
      .eq("concluido", false)
      .order("data_hora", { ascending: true });
    setLembretes((data || []) as Lembrete[]);
    setAgora(Date.now());
  }

  useEffect(() => {
    if (carregando) return;
    carregarLembretes();
    // confere a cada 30s se algum lembrete chegou na hora
    const intervalo = setInterval(carregarLembretes, 30 * 1000);
    return () => clearInterval(intervalo);
  }, [carregando]);

  async function criarLembrete() {
    setErroLembrete("");
    if (!novoTitulo.trim()) return setErroLembrete("Escreva o lembrete.");
    const quando = new Date(novoQuando);
    if (isNaN(quando.getTime())) return setErroLembrete("Escolha o dia e a hora.");
    setCriando(true);
    const { error } = await supabase.from("lembretes").insert({ titulo: novoTitulo.trim(), data_hora: quando.toISOString() });
    setCriando(false);
    if (error) return setErroLembrete("Não consegui salvar: " + error.message);
    setNovoTitulo("");
    setNovoQuando(padraoDataHora());
    carregarLembretes();
  }

  async function concluirLembrete(id: string) {
    await supabase.from("lembretes").update({ concluido: true, concluido_em: new Date().toISOString() }).eq("id", id);
    carregarLembretes();
  }

  async function adiarLembrete(id: string, minutos: number) {
    await supabase
      .from("lembretes")
      .update({ data_hora: new Date(Date.now() + minutos * 60 * 1000).toISOString() })
      .eq("id", id);
    carregarLembretes();
  }

  async function excluirLembrete(id: string) {
    await supabase.from("lembretes").delete().eq("id", id);
    carregarLembretes();
  }

  const vencidos = lembretes.filter((l) => new Date(l.data_hora).getTime() <= agora);
  const futuros = lembretes.filter((l) => new Date(l.data_hora).getTime() > agora);
  const totalBadge = vencidos.length + (lista.length > 0 && !visto ? lista.length : 0);

  // Avisa de verdade: quando chega a hora, abre um aviso no meio da tela
  // (som + título da aba piscando) e só some com "Feito" ou "Adiar".
  const idsAvisados = useRef<Set<string>>(new Set());
  useEffect(() => {
    const novos = vencidos.filter((l) => !idsAvisados.current.has(l.id));
    if (novos.length === 0) return;
    novos.forEach((l) => idsAvisados.current.add(l.id));
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      [0, 0.35, 0.7].forEach((t) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = 880;
        gain.gain.value = 0.15;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + t);
        osc.stop(ctx.currentTime + t + 0.2);
      });
    } catch {
      /* navegador bloqueou o som: o aviso na tela continua */
    }
  }, [vencidos]);

  useEffect(() => {
    if (vencidos.length === 0) return;
    const original = document.title;
    let ligado = false;
    const t = setInterval(() => {
      ligado = !ligado;
      document.title = ligado ? `⏰ Lembrete (${vencidos.length})` : original;
    }, 1000);
    return () => {
      clearInterval(t);
      document.title = original;
    };
  }, [vencidos.length]);

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

  function mensagemParabens(a: Aniversariante): string {
    const primeiro = a.nome.trim().split(" ")[0];
    const nome = primeiro.charAt(0).toUpperCase() + primeiro.slice(1).toLowerCase();
    return (
      `Olá, ${nome}! 🎉🎂\n\n` +
      `A equipe da Caruaru Móveis passa aqui para te desejar um feliz aniversário! ` +
      `Que o seu dia seja cheio de alegria, saúde e muitas conquistas. 🥳💛\n\n` +
      `Obrigado por fazer parte da nossa história! 🏡✨`
    );
  }

  // O WhatsApp Desktop do Windows corrompe emoji que vai no link (aparece "�"),
  // então copiamos a mensagem pronta e abrimos a conversa — é só colar (Ctrl+V).
  async function mandarParabens(a: Aniversariante) {
    const n = (a.telefone || "").replace(/\D/g, "");
    if (n.length < 10) return;
    try {
      await navigator.clipboard.writeText(mensagemParabens(a));
      setCopiadoId(a.id);
      setTimeout(() => setCopiadoId(null), 6000);
    } catch {
      /* sem permissão da área de transferência: abre o chat com o texto sem emoji */
      window.open(`https://wa.me/55${n}?text=${encodeURIComponent(mensagemParabens(a))}`, "_blank", "noopener");
      return;
    }
    window.open(`https://wa.me/55${n}`, "_blank", "noopener");
  }

  return (
    <div className="relative" ref={caixa}>
      {vencidos.length > 0 && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md bg-white rounded-xl shadow-2xl border-4 border-amber-400 p-5">
            <div className="text-lg font-bold text-madeira-900 mb-3">⏰ Lembrete{vencidos.length > 1 ? "s" : ""}</div>
            <ul className="space-y-3 max-h-[60vh] overflow-y-auto">
              {vencidos.map((l) => (
                <li key={l.id} className="rounded-lg bg-amber-50 border border-amber-200 p-3">
                  <div className="text-base font-semibold text-madeira-900">{l.titulo}</div>
                  <div className="text-xs text-madeira-500 mb-2">Marcado para {formatarQuando(l.data_hora)}</div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="text-sm px-3 py-1.5 rounded bg-green-700 text-white font-medium hover:bg-green-800"
                      onClick={() => concluirLembrete(l.id)}
                    >
                      ✓ Feito
                    </button>
                    <button
                      type="button"
                      className="text-sm px-3 py-1.5 rounded border border-madeira-300 text-madeira-700 hover:bg-madeira-50"
                      onClick={() => adiarLembrete(l.id, 10)}
                    >
                      Lembrar em 10 min
                    </button>
                    <button
                      type="button"
                      className="text-sm px-3 py-1.5 rounded border border-madeira-300 text-madeira-700 hover:bg-madeira-50"
                      onClick={() => adiarLembrete(l.id, 60)}
                    >
                      Em 1 hora
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
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
        {totalBadge > 0 && (
          <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-red-600 text-white text-[10px] leading-4 text-center font-semibold">
            {totalBadge}
          </span>
        )}
      </button>

      {aberto && (
        <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-1.5rem)] bg-white border border-estofado-100 rounded-lg shadow-lg z-30">
          <div className="px-3 py-2 border-b border-estofado-100 text-sm font-semibold text-madeira-800">Notificações</div>
          {vencidos.length > 0 && (
            <ul className="divide-y divide-estofado-100 border-b border-estofado-100">
              {vencidos.map((l) => (
                <li key={l.id} className="px-3 py-2 text-sm text-madeira-800 bg-amber-50">
                  <div>
                    ⏰ <strong>{l.titulo}</strong>
                    <span className="block text-xs text-madeira-500">Era para {formatarQuando(l.data_hora)}</span>
                  </div>
                  <button
                    type="button"
                    className="mt-1 text-xs px-2 py-0.5 rounded bg-green-700 text-white hover:bg-green-800"
                    onClick={() => concluirLembrete(l.id)}
                  >
                    ✓ Feito
                  </button>
                </li>
              ))}
            </ul>
          )}
          {lista.length === 0 && vencidos.length === 0 ? (
            <div className="px-3 py-4 text-sm text-madeira-500">Nenhuma notificação hoje.</div>
          ) : lista.length === 0 ? null : (
            <ul className="max-h-80 overflow-y-auto divide-y divide-estofado-100">
              {lista.map((a) => {
                const temTel = (a.telefone || "").replace(/\D/g, "").length >= 10;
                return (
                  <li key={a.id} className="px-3 py-2 text-sm text-madeira-800">
                    <div>
                      🎂 Hoje é aniversário de <strong>{a.nome}</strong>
                      {a.loja_nome ? <> na loja <strong>{a.loja_nome.replace(/^Caruaru Móveis\s+/i, "")}</strong></> : null}
                      {a.idade > 0 && a.idade < 120 ? <> — faz {a.idade} anos</> : null}.
                    </div>
                    {temTel && (
                      <>
                        <button
                          type="button"
                          onClick={() => mandarParabens(a)}
                          className="inline-block mt-1 text-xs text-green-700 underline"
                        >
                          Mandar parabéns no WhatsApp
                        </button>
                        {copiadoId === a.id && (
                          <span className="block text-xs text-madeira-500 mt-0.5">
                            Mensagem copiada! No WhatsApp, é só colar (Ctrl+V) e enviar.
                          </span>
                        )}
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <div className="px-3 py-3 border-t border-estofado-100 bg-estofado-50/40">
            <div className="text-xs font-semibold text-madeira-700 mb-1">Novo lembrete</div>
            <input
              className="input-base mb-1"
              placeholder="Ex.: ligar para a cliente do sofá"
              value={novoTitulo}
              onChange={(e) => setNovoTitulo(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && criarLembrete()}
            />
            <input
              type="datetime-local"
              className="input-base mb-1"
              value={novoQuando}
              onChange={(e) => setNovoQuando(e.target.value)}
            />
            {erroLembrete && <div className="text-xs text-red-700 mb-1">{erroLembrete}</div>}
            <button type="button" className="btn-primario text-xs px-3 py-1" disabled={criando} onClick={criarLembrete}>
              {criando ? "Salvando..." : "Criar lembrete"}
            </button>
            {futuros.length > 0 && (
              <ul className="mt-2 space-y-1">
                {futuros.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-2 text-xs text-madeira-700">
                    <span>
                      🕒 {formatarQuando(l.data_hora)} — {l.titulo}
                    </span>
                    <button type="button" className="text-red-700 underline shrink-0" onClick={() => excluirLembrete(l.id)}>
                      excluir
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
