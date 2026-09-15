"use client";

import { useEffect, useRef, useState } from "react";

interface Mensagem {
  role: "user" | "assistant";
  content: string;
}

const SUGESTOES = [
  "Vendas de hoje",
  "Estoque crítico",
  "Pedidos atrasados",
  "Resumo do mês",
  "Produtos mais vendidos",
  "Desempenho das lojas",
];

export default function AssistenteIaPage() {
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [entrada, setEntrada] = useState("");
  const [carregando, setCarregando] = useState(false);
  const fimDaListaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fimDaListaRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens, carregando]);

  async function enviar(textoForcado?: string) {
    const texto = (textoForcado ?? entrada).trim();
    if (!texto || carregando) return;

    const novasMensagens: Mensagem[] = [...mensagens, { role: "user", content: texto }];
    setMensagens(novasMensagens);
    setEntrada("");
    setCarregando(true);

    try {
      const resp = await fetch("/api/ia/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mensagem: texto,
          historico: mensagens.slice(-8),
        }),
      });
      const dados = await resp.json();
      const respostaTexto: string = dados.resposta || "Não consegui responder agora. Tente de novo.";
      setMensagens((atual) => [...atual, { role: "assistant", content: respostaTexto }]);
    } catch {
      setMensagens((atual) => [
        ...atual,
        { role: "assistant", content: "Assistente IA temporariamente indisponível. Tente novamente." },
      ]);
    } finally {
      setCarregando(false);
    }
  }

  function novaConversa() {
    setMensagens([]);
    setEntrada("");
  }

  return (
    <div className="p-4 md:p-8 flex flex-col h-screen max-h-screen">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="font-display text-3xl text-madeira-900">Assistente IA</h1>
          <p className="text-madeira-600 mt-1">
            Pergunte sobre vendas, estoque, encomendas e clientes — direto dos dados reais do sistema.
          </p>
        </div>
        {mensagens.length > 0 && (
          <button className="btn-secundario" onClick={novaConversa}>
            + Nova conversa
          </button>
        )}
      </div>

      <div className="card flex-1 flex flex-col overflow-hidden p-0">
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {mensagens.length === 0 && (
            <div>
              <p className="text-sm text-madeira-500 mb-3">Pergunte algo, ou escolha uma sugestão rápida:</p>
              <div className="flex flex-wrap gap-2">
                {SUGESTOES.map((s) => (
                  <button
                    key={s}
                    className="text-xs px-3 py-1.5 rounded-full border border-madeira-300 text-madeira-600 hover:bg-madeira-50"
                    onClick={() => enviar(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {mensagens.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] md:max-w-[70%] rounded-lg px-4 py-2 text-sm whitespace-pre-wrap ${
                  m.role === "user" ? "bg-madeira-700 text-white" : "bg-madeira-50 text-madeira-900"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}

          {carregando && (
            <div className="flex justify-start">
              <div className="bg-madeira-50 text-madeira-500 rounded-lg px-4 py-2 text-sm">IA analisando...</div>
            </div>
          )}

          <div ref={fimDaListaRef} />
        </div>

        <div className="border-t border-estofado-100 p-4">
          <div className="flex gap-2">
            <input
              className="input-base flex-1"
              placeholder="Pergunte alguma coisa..."
              value={entrada}
              onChange={(e) => setEntrada(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  enviar();
                }
              }}
              disabled={carregando}
            />
            <button className="btn-primario" onClick={() => enviar()} disabled={carregando || !entrada.trim()}>
              Enviar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
