"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { apagarFotoDoProduto, removerFundoDaFoto, salvarFotoDoProduto } from "@/lib/fotoProduto";
import { registrarAuditoria } from "@/lib/auditoria";
import { avisarProdutosMudaram } from "@/lib/produtosAoVivo";

// Foto do produto (sem fundo) dentro do cadastro: escolhe/tira a foto, a IA
// tira o fundo no próprio aparelho e já fica salva no produto.
export default function FotoDoProduto({ produtoId, nome }: { produtoId: string; nome: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let vivo = true;
    setUrl(null);
    supabase
      .from("produtos")
      .select("foto_url")
      .eq("id", produtoId)
      .maybeSingle()
      .then(({ data }) => vivo && setUrl((data?.foto_url as string | null) || null));
    return () => {
      vivo = false;
    };
  }, [produtoId]);

  async function aoEscolher(arquivo: File | undefined) {
    if (!arquivo) return;
    setErro("");
    setProcessando(true);
    try {
      const png = await removerFundoDaFoto(arquivo);
      const novaUrl = await salvarFotoDoProduto(produtoId, png);
      setUrl(novaUrl);
      registrarAuditoria({
        categoria: "Produtos",
        acao: "alteracao",
        registroTipo: "produto",
        registroId: produtoId,
        registroNome: nome,
        descricao: `Foto do produto "${nome}" ${url ? "trocada" : "adicionada"}`,
      });
      avisarProdutosMudaram();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar a foto.");
    } finally {
      setProcessando(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remover() {
    setErro("");
    setProcessando(true);
    try {
      await apagarFotoDoProduto(produtoId);
      setUrl(null);
      avisarProdutosMudaram();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao remover a foto.");
    } finally {
      setProcessando(false);
    }
  }

  return (
    <div className="flex items-center gap-3 mb-3 p-3 rounded-lg border border-madeira-200">
      <div
        className="w-20 h-20 rounded-md flex items-center justify-center overflow-hidden shrink-0"
        style={{
          backgroundColor: "#fff",
          backgroundImage:
            "linear-gradient(45deg,#e5e5e5 25%,transparent 25%,transparent 75%,#e5e5e5 75%),linear-gradient(45deg,#e5e5e5 25%,transparent 25%,transparent 75%,#e5e5e5 75%)",
          backgroundSize: "12px 12px",
          backgroundPosition: "0 0,6px 6px",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {url ? <img src={url} alt={nome} className="max-w-full max-h-full object-contain" /> : <span className="text-xs text-neutral-500">sem foto</span>}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-madeira-800">Foto do produto</p>
        <p className="text-xs text-madeira-600 mb-2">
          {processando
            ? "Tirando o fundo… na primeira vez demora um pouco mais (baixa a IA)."
            : "A IA tira o fundo e fica só o produto. Sai pequena na impressão, ao lado do nome."}
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secundario !py-1 !px-3" disabled={processando} onClick={() => input.current?.click()}>
            {processando ? "Processando…" : url ? "📷 Trocar foto" : "📷 Adicionar foto"}
          </button>
          {url && !processando && (
            <button type="button" className="text-xs underline text-red-700" onClick={remover}>
              Remover foto
            </button>
          )}
        </div>
        {erro && <p className="text-xs text-red-700 mt-1">{erro}</p>}
      </div>
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => aoEscolher(e.target.files?.[0])} />
    </div>
  );
}
