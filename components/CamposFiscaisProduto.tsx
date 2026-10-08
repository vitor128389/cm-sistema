"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

// Dados fiscais do produto (NCM, CFOP, CSOSN, unidade) — usados só na emissão de nota fiscal.
// Salva por conta própria, sem mexer no resto do formulário do produto.
export default function CamposFiscaisProduto({ produtoId }: { produtoId: string }) {
  const [ncm, setNcm] = useState("");
  const [cfop, setCfop] = useState("5102");
  const [csosn, setCsosn] = useState("102");
  const [unidade, setUnidade] = useState("UN");
  const [validado, setValidado] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    setMsg("");
    supabase
      .from("produtos")
      .select("ncm, ncm_validado, cfop, csosn, unidade")
      .eq("id", produtoId)
      .maybeSingle()
      .then(({ data }) => {
        setNcm(data?.ncm || "");
        setCfop(data?.cfop || "5102");
        setCsosn(data?.csosn || "102");
        setUnidade(data?.unidade || "UN");
        setValidado(!!data?.ncm_validado);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produtoId]);

  async function salvar() {
    const n = ncm.replace(/\D/g, "");
    if (n && n.length !== 8) {
      setMsg("O NCM tem 8 dígitos.");
      return;
    }
    const { error } = await supabase
      .from("produtos")
      .update({ ncm: n || null, ncm_validado: !!n && validado, cfop, csosn, unidade })
      .eq("id", produtoId);
    setMsg(error ? "Erro: " + error.message : "Dados fiscais salvos ✓");
  }

  return (
    <div className="mb-3 max-w-md border border-madeira-100 rounded-lg p-3 bg-white">
      <p className="text-sm font-medium text-madeira-700 mb-2">Dados fiscais (nota fiscal)</p>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs text-madeira-600 mb-1 block">NCM (8 dígitos)</span>
          <input className="input-base" value={ncm} onChange={(e) => setNcm(e.target.value)} placeholder="94036000" inputMode="numeric" />
        </label>
        <label className="block">
          <span className="text-xs text-madeira-600 mb-1 block">Unidade</span>
          <input className="input-base" value={unidade} onChange={(e) => setUnidade(e.target.value.toUpperCase())} />
        </label>
        <label className="block">
          <span className="text-xs text-madeira-600 mb-1 block">CFOP</span>
          <input className="input-base" value={cfop} onChange={(e) => setCfop(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-xs text-madeira-600 mb-1 block">CSOSN</span>
          <input className="input-base" value={csosn} onChange={(e) => setCsosn(e.target.value)} />
        </label>
      </div>
      <label className="flex items-center gap-2 mt-2 text-xs text-madeira-700">
        <input type="checkbox" checked={validado} onChange={(e) => setValidado(e.target.checked)} />
        NCM conferido pela contadora (obrigatório para nota em produção)
      </label>
      <div className="flex items-center gap-3 mt-2">
        <button type="button" className="btn-secundario text-xs px-2 py-1" onClick={salvar}>
          Salvar dados fiscais
        </button>
        {msg && <span className="text-xs text-madeira-600">{msg}</span>}
      </div>
    </div>
  );
}
