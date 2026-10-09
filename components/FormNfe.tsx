"use client";

import { useState } from "react";
import { buscarCep } from "@/lib/fiscalCliente";

export interface EnderecoForm {
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  municipio: string;
  uf: string;
  codigoMunicipio: string;
}
export interface DadosNfe {
  tipo: "pf" | "pj";
  documento: string;
  nome: string;
  situacaoIe: "contribuinte" | "isento" | "nao_contribuinte";
  inscricaoEstadual: string;
  email: string;
  telefone: string;
  endereco: EnderecoForm;
  entregaDiferente: boolean;
  entrega: EnderecoForm;
}

export const enderecoVazio = (): EnderecoForm => ({
  cep: "",
  logradouro: "",
  numero: "",
  complemento: "",
  bairro: "",
  municipio: "",
  uf: "SE",
  codigoMunicipio: "",
});

function BlocoEndereco({ titulo, v, onChange }: { titulo: string; v: EnderecoForm; onChange: (e: EnderecoForm) => void }) {
  const [buscando, setBuscando] = useState(false);
  const [msg, setMsg] = useState("");
  const set = (c: Partial<EnderecoForm>) => onChange({ ...v, ...c });

  async function procurar() {
    setMsg("");
    setBuscando(true);
    const r = await buscarCep(v.cep);
    setBuscando(false);
    if (!r) {
      setMsg("CEP não encontrado. Confira o número.");
      return;
    }
    set({ logradouro: r.logradouro || v.logradouro, bairro: r.bairro || v.bairro, municipio: r.municipio, uf: r.uf, codigoMunicipio: r.codigoMunicipio });
    setMsg(`${r.municipio} - ${r.uf} (código ${r.codigoMunicipio})`);
  }

  return (
    <div>
      <p className="text-sm font-medium text-madeira-700 mb-2">{titulo}</p>
      <div className="grid grid-cols-6 gap-2">
        <div className="col-span-3 md:col-span-2 flex gap-1">
          <input className="input-base w-full" placeholder="CEP" inputMode="numeric" value={v.cep} onChange={(e) => set({ cep: e.target.value, codigoMunicipio: "" })} />
          <button type="button" className="btn-secundario text-xs px-2" disabled={buscando} onClick={procurar}>
            {buscando ? "..." : "Buscar"}
          </button>
        </div>
        <input className="input-base col-span-6 md:col-span-4" placeholder="Rua / logradouro" value={v.logradouro} onChange={(e) => set({ logradouro: e.target.value })} />
        <input className="input-base col-span-2" placeholder="Número" value={v.numero} onChange={(e) => set({ numero: e.target.value })} />
        <input className="input-base col-span-4" placeholder="Complemento (opcional)" value={v.complemento} onChange={(e) => set({ complemento: e.target.value })} />
        <input className="input-base col-span-6 md:col-span-3" placeholder="Bairro / povoado" value={v.bairro} onChange={(e) => set({ bairro: e.target.value })} />
        <input className="input-base col-span-4 md:col-span-2" placeholder="Cidade" value={v.municipio} onChange={(e) => set({ municipio: e.target.value, codigoMunicipio: "" })} />
        <input className="input-base col-span-2 md:col-span-1" placeholder="UF" maxLength={2} value={v.uf} onChange={(e) => set({ uf: e.target.value.toUpperCase(), codigoMunicipio: "" })} />
      </div>
      <p className={`text-xs mt-1 ${v.codigoMunicipio ? "text-green-700" : "text-amber-700"}`}>
        {msg || (v.codigoMunicipio ? `Município confirmado (código ${v.codigoMunicipio})` : "Digite o CEP e clique em Buscar para confirmar a cidade.")}
      </p>
    </div>
  );
}

interface DadosCnpj {
  nome: string;
  endereco: EnderecoForm;
}

// Consulta pública do CNPJ (BrasilAPI): razão social + endereço + código do município.
async function buscarCnpj(cnpj: string): Promise<DadosCnpj | null> {
  const c = cnpj.replace(/\D/g, "");
  if (c.length !== 14) return null;
  try {
    const r = await fetch(`/api/fiscal/cnpj?cnpj=${c}`);
    if (!r.ok) return null;
    const j = await r.json();
    return {
      nome: String(j.nome || ""),
      endereco: {
        cep: String(j.cep || ""),
        logradouro: String(j.logradouro || ""),
        numero: String(j.numero || ""),
        complemento: String(j.complemento || ""),
        bairro: String(j.bairro || ""),
        municipio: String(j.municipio || ""),
        uf: String(j.uf || ""),
        codigoMunicipio: String(j.codigoMunicipio || ""),
      },
    };
  } catch {
    return null;
  }
}

export default function FormNfe({
  inicial,
  ocupado,
  real,
  onEmitir,
  onCancelar,
}: {
  inicial: DadosNfe;
  ocupado: boolean;
  real: boolean;
  onEmitir: (d: DadosNfe) => void;
  onCancelar: () => void;
}) {
  const [d, setD] = useState<DadosNfe>(inicial);
  const set = (c: Partial<DadosNfe>) => setD((a) => ({ ...a, ...c }));
  const [msgCnpj, setMsgCnpj] = useState("");
  const [buscandoCnpj, setBuscandoCnpj] = useState(false);

  async function procurarCnpj() {
    setMsgCnpj("");
    if (d.documento.replace(/\D/g, "").length !== 14) {
      setMsgCnpj("Digite o CNPJ completo (14 números).");
      return;
    }
    setBuscandoCnpj(true);
    const r = await buscarCnpj(d.documento);
    setBuscandoCnpj(false);
    if (!r) {
      setMsgCnpj("Não consegui buscar esse CNPJ. Preencha o nome e o endereço da empresa à mão.");
      return;
    }
    setD((a) => ({
      ...a,
      nome: r.nome || a.nome,
      endereco: { ...a.endereco, ...Object.fromEntries(Object.entries(r.endereco).filter(([, v]) => v)) } as EnderecoForm,
    }));
    setMsgCnpj(`Empresa encontrada: ${r.nome}. Confira o nome e o endereço.`);
  }

  return (
    <div className="mt-3 p-4 rounded-lg border border-madeira-200 bg-madeira-50 space-y-4">
      <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-1">
          <input type="radio" checked={d.tipo === "pf"} onChange={() => set({ tipo: "pf" })} /> Pessoa física (CPF)
        </label>
        <label className="flex items-center gap-1">
          <input type="radio" checked={d.tipo === "pj"} onChange={() => set({ tipo: "pj", documento: "", nome: "" })} /> Empresa (CNPJ)
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <div className="flex gap-1">
          <input
            className="input-base w-full"
            inputMode="numeric"
            placeholder={d.tipo === "pf" ? "CPF" : "CNPJ"}
            value={d.documento}
            onChange={(e) => set({ documento: e.target.value })}
            onBlur={() => d.tipo === "pj" && d.documento.replace(/\D/g, "").length === 14 && procurarCnpj()}
          />
          {d.tipo === "pj" && (
            <button type="button" className="btn-secundario text-xs px-2 whitespace-nowrap" disabled={buscandoCnpj} onClick={procurarCnpj}>
              {buscandoCnpj ? "..." : "Buscar CNPJ"}
            </button>
          )}
        </div>
        <input className="input-base" placeholder={d.tipo === "pf" ? "Nome completo" : "Razão social"} value={d.nome} onChange={(e) => set({ nome: e.target.value })} />
        {d.tipo === "pj" && (
          <>
            <select className="input-base" value={d.situacaoIe} onChange={(e) => set({ situacaoIe: e.target.value as DadosNfe["situacaoIe"] })}>
              <option value="nao_contribuinte">Não contribuinte de ICMS</option>
              <option value="contribuinte">Contribuinte (tem inscrição estadual)</option>
              <option value="isento">Isento de inscrição</option>
            </select>
            {d.situacaoIe === "contribuinte" && (
              <input className="input-base" placeholder="Inscrição estadual" value={d.inscricaoEstadual} onChange={(e) => set({ inscricaoEstadual: e.target.value })} />
            )}
          </>
        )}
        <input className="input-base" placeholder="E-mail (opcional)" value={d.email} onChange={(e) => set({ email: e.target.value })} />
        <input className="input-base" placeholder="Telefone (opcional)" inputMode="tel" value={d.telefone} onChange={(e) => set({ telefone: e.target.value })} />
      </div>

      {d.tipo === "pj" && msgCnpj && <p className="text-xs text-madeira-600 -mt-2">{msgCnpj}</p>}

      <BlocoEndereco titulo="Endereço do cliente" v={d.endereco} onChange={(endereco) => set({ endereco })} />

      <label className="flex items-center gap-2 text-sm text-madeira-700">
        <input type="checkbox" checked={d.entregaDiferente} onChange={(e) => set({ entregaDiferente: e.target.checked })} />
        Entregar em outro endereço (sai na nota como local de entrega)
      </label>
      {d.entregaDiferente && <BlocoEndereco titulo="Endereço de entrega" v={d.entrega} onChange={(entrega) => set({ entrega })} />}

      <div className="flex gap-2">
        <button
          type="button"
          className="text-sm px-3 py-2 rounded bg-blue-700 text-white font-medium hover:bg-blue-800 disabled:opacity-50"
          disabled={ocupado}
          onClick={() => onEmitir(d)}
        >
          {ocupado ? "Emitindo..." : real ? "🧾 Emitir NF-e" : "🧾 Emitir NF-e (teste)"}
        </button>
        <button type="button" className="btn-secundario text-sm" onClick={onCancelar}>
          Fechar
        </button>
      </div>
    </div>
  );
}
