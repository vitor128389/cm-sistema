"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useLoja } from "@/contexts/LojaContext";
import { ajustarEstoqueLoja } from "@/lib/produtos";
import { avisarProdutosMudaram } from "@/lib/produtosAoVivo";
import { registrarAuditoria } from "@/lib/auditoria";

type Candidato = { id: string; nome: string; categoria: string };
type Variante = { id: string; nome_variante: string };
type LojaSimples = { id: string; nome: string; eh_deposito: boolean | null };
type LinhaEstoque = { loja_id: string; variante_id: string | null; chave_variante: string; quantidade: number };

type Etapa = "inicio" | "analisando" | "opcoes" | "produto" | "novo" | "pronto";

// Reduz a foto pra ~1024px — foto de celular pesa vários MB e a IA não precisa disso.
function reduzirFoto(arquivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(arquivo);
    img.onload = () => {
      const max = 1024;
      const escala = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * escala);
      canvas.height = Math.round(img.height * escala);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não consegui abrir a foto."));
    };
    img.src = url;
  });
}

export default function AdicionarPorFoto({ aoFechar, aoAlterar }: { aoFechar: () => void; aoAlterar: () => void }) {
  const { lojaAtual } = useLoja();
  const [etapa, setEtapa] = useState<Etapa>("inicio");
  const [erro, setErro] = useState("");
  const [foto, setFoto] = useState("");
  const [candidatos, setCandidatos] = useState<Candidato[]>([]);
  const [categoriaSugerida, setCategoriaSugerida] = useState("");
  const [nomeSugerido, setNomeSugerido] = useState("");
  const [escolhido, setEscolhido] = useState<Candidato | null>(null);
  const [lojas, setLojas] = useState<LojaSimples[]>([]);
  const [variantes, setVariantes] = useState<Variante[]>([]);
  const [estoque, setEstoque] = useState<LinhaEstoque[]>([]);
  const [varianteId, setVarianteId] = useState<string>("");
  const [lojaDestino, setLojaDestino] = useState<string>(lojaAtual || "");
  const [quantidade, setQuantidade] = useState("1");
  const [salvando, setSalvando] = useState(false);
  const [mensagemFinal, setMensagemFinal] = useState("");

  // produto novo
  const [nomeNovo, setNomeNovo] = useState("");
  const [categoriaNova, setCategoriaNova] = useState("");
  const [precoNovo, setPrecoNovo] = useState("");
  const [categorias, setCategorias] = useState<string[]>([]);
  const [ouvindo, setOuvindo] = useState(false);
  const inputFoto = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase
      .from("lojas")
      .select("id, nome, eh_deposito")
      .order("nome")
      .then(({ data }) => {
        const l = (data || []) as LojaSimples[];
        setLojas(l);
        setLojaDestino((atual) => atual || l.find((x) => !x.eh_deposito)?.id || "");
      });
    supabase
      .from("produtos")
      .select("categoria")
      .eq("ativo", true)
      .then(({ data }) => {
        setCategorias(Array.from(new Set((data || []).map((p) => p.categoria).filter(Boolean))).sort());
      });
  }, []);

  async function aoEscolherFoto(arquivo: File | undefined) {
    if (!arquivo) return;
    setErro("");
    setEtapa("analisando");
    try {
      const imagem = await reduzirFoto(arquivo);
      setFoto(imagem);
      const resp = await fetch("/api/ia/foto-produto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imagem }),
      });
      const dados = await resp.json();
      if (!resp.ok) throw new Error(dados.error || "Erro ao analisar a foto.");
      setCandidatos(dados.candidatos || []);
      setCategoriaSugerida(dados.categoria_sugerida || "");
      setCategoriaNova(dados.categoria_sugerida || "");
      setNomeSugerido(dados.nome_sugerido || "");
      setNomeNovo(dados.nome_sugerido || "");
      setEtapa("opcoes");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao analisar a foto.");
      setEtapa("inicio");
    }
  }

  async function escolherProduto(p: Candidato) {
    setEscolhido(p);
    setErro("");
    const [{ data: vs }, { data: est }] = await Promise.all([
      supabase.from("produto_variantes").select("id, nome_variante").eq("produto_id", p.id).order("nome_variante"),
      supabase
        .from("estoque_loja")
        .select("loja_id, variante_id, chave_variante, quantidade")
        .eq("produto_id", p.id),
    ]);
    setVariantes((vs || []) as Variante[]);
    setEstoque((est || []) as LinhaEstoque[]);
    setVarianteId("");
    setQuantidade("1");
    setEtapa("produto");
  }

  // regra do sistema: se tem variantes, conta só as linhas das variantes; senão só a "simples"
  function qtdNaLoja(lojaId: string, vid: string | null): number {
    return estoque
      .filter((e) => e.loja_id === lojaId && (vid ? e.chave_variante === vid : e.chave_variante === "simples"))
      .reduce((s, e) => s + (e.quantidade || 0), 0);
  }
  function totalNaLoja(lojaId: string): number {
    if (variantes.length > 0) {
      return variantes.reduce((s, v) => s + qtdNaLoja(lojaId, v.id), 0);
    }
    return qtdNaLoja(lojaId, null);
  }

  async function adicionar() {
    if (!escolhido) return;
    const qtd = parseInt(quantidade, 10);
    if (!qtd || qtd <= 0) return setErro("Digite quantas unidades chegaram.");
    if (!lojaDestino) return setErro("Escolha em qual loja adicionar.");
    if (variantes.length > 0 && !varianteId) return setErro("Escolha a cor/variação.");
    setSalvando(true);
    setErro("");
    try {
      const antes = qtdNaLoja(lojaDestino, variantes.length > 0 ? varianteId : null);
      await ajustarEstoqueLoja(supabase, lojaDestino, escolhido.id, variantes.length > 0 ? varianteId : null, qtd);
      const nomeLoja = lojas.find((l) => l.id === lojaDestino)?.nome || "";
      const nomeVar = variantes.find((v) => v.id === varianteId)?.nome_variante;
      const nomeCompleto = nomeVar ? `${escolhido.nome} — ${nomeVar}` : escolhido.nome;
      registrarAuditoria({
        lojaId: lojaDestino,
        categoria: "Estoque",
        acao: "entrada_estoque",
        registroTipo: "produto",
        registroId: escolhido.id,
        registroNome: nomeCompleto,
        descricao: `Entrada por foto: +${qtd} de "${nomeCompleto}" em ${nomeLoja} (de ${antes} para ${antes + qtd})`,
        dadosAntes: { estoque: antes },
        dadosDepois: { estoque: antes + qtd },
      });
      avisarProdutosMudaram();
      aoAlterar();
      setMensagemFinal(`✅ +${qtd} de ${nomeCompleto} em ${nomeLoja}. Agora tem ${antes + qtd}.`);
      setEtapa("pronto");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao adicionar.");
    } finally {
      setSalvando(false);
    }
  }

  function ouvirNome() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Rec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Rec) return setErro("Seu navegador não tem ditado por voz — digite o nome.");
    const r = new Rec();
    r.lang = "pt-BR";
    r.interimResults = false;
    r.onstart = () => setOuvindo(true);
    r.onend = () => setOuvindo(false);
    r.onerror = () => setOuvindo(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    r.onresult = (ev: any) => setNomeNovo(String(ev.results[0][0].transcript || "").toUpperCase());
    r.start();
  }

  async function criarNovo() {
    const nome = nomeNovo.trim().toUpperCase();
    const qtd = parseInt(quantidade, 10);
    if (!nome) return setErro("Digite o nome do produto.");
    if (!categoriaNova.trim()) return setErro("Escolha a categoria.");
    if (!qtd || qtd <= 0) return setErro("Digite quantas unidades.");
    if (!lojaDestino) return setErro("Escolha a loja.");
    setSalvando(true);
    setErro("");
    try {
      const { data: existe } = await supabase.from("produtos").select("id").ilike("nome", nome).limit(1);
      if (existe && existe.length > 0) {
        throw new Error("Já existe um produto com esse nome — volte e escolha ele na lista.");
      }
      const preco = parseFloat(precoNovo.replace(",", ".")) || 0;
      const { data: novo, error } = await supabase
        .from("produtos")
        .insert({
          nome,
          categoria: categoriaNova.trim(),
          custo: 0,
          preco_venda: preco,
          tipo_estoque: "pronta_entrega",
          tipo_precificacao: "simples",
          ativo: true,
          quantidade_estoque: 0,
        })
        .select("id, nome")
        .single();
      if (error || !novo) throw new Error(error?.message || "Erro ao criar o produto.");
      await ajustarEstoqueLoja(supabase, lojaDestino, novo.id, null, qtd);
      const nomeLoja = lojas.find((l) => l.id === lojaDestino)?.nome || "";
      registrarAuditoria({
        lojaId: lojaDestino,
        categoria: "Produtos",
        acao: "criacao",
        registroTipo: "produto",
        registroId: novo.id,
        registroNome: novo.nome,
        descricao: `Produto "${novo.nome}" criado por foto com ${qtd} un. em ${nomeLoja}`,
        dadosDepois: { categoria: categoriaNova, preco_venda: preco, estoque: qtd },
      });
      avisarProdutosMudaram();
      aoAlterar();
      setMensagemFinal(
        `✅ Produto novo "${novo.nome}" criado com ${qtd} un. em ${nomeLoja}.` +
          (preco ? "" : " Falta colocar o preço de venda (Administração → Estoque → editar).")
      );
      setEtapa("pronto");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao criar.");
    } finally {
      setSalvando(false);
    }
  }

  const seletorLoja = (
    <div>
      <label className="text-xs text-neutral-600">Adicionar em qual loja?</label>
      <select className="input w-full !bg-white !text-neutral-900 !border-neutral-300" value={lojaDestino} onChange={(e) => setLojaDestino(e.target.value)}>
        <option value="">Escolha…</option>
        {lojas.map((l) => (
          <option key={l.id} value={l.id}>
            {l.nome}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white text-neutral-900 w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl p-4 space-y-3">
        <div className="flex justify-between items-center">
          <h2 className="font-bold text-neutral-900">📷 Adicionar por foto</h2>
          <button className="text-2xl leading-none px-2" onClick={aoFechar} aria-label="Fechar">
            ×
          </button>
        </div>

        {erro && <p className="text-sm text-red-600 bg-red-50 rounded p-2">{erro}</p>}

        <input
          ref={inputFoto}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            aoEscolherFoto(e.target.files?.[0]);
            e.target.value = "";
          }}
        />

        {etapa === "inicio" && (
          <div className="space-y-3 text-center">
            <p className="text-sm text-neutral-700">Tire uma foto do produto que chegou. A IA tenta achar qual é.</p>
            <button className="btn-primario w-full py-4 text-lg" onClick={() => inputFoto.current?.click()}>
              📷 Tirar foto
            </button>
          </div>
        )}

        {etapa === "analisando" && <p className="text-center py-8 text-neutral-700">🔎 Olhando a foto…</p>}

        {(etapa === "opcoes" || etapa === "produto" || etapa === "novo") && foto && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={foto} alt="Foto do produto" className="w-full max-h-48 object-contain rounded bg-neutral-100" />
        )}

        {etapa === "opcoes" && (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-neutral-900">
              {candidatos.length > 0 ? "Parece ser algum desses. Toque no certo:" : "Não achei nada parecido."}
            </p>
            {candidatos.map((c) => (
              <button
                key={c.id}
                className="w-full text-left border rounded-lg p-3 bg-white text-neutral-900 border-neutral-300 hover:bg-neutral-100 active:bg-neutral-200"
                onClick={() => escolherProduto(c)}
              >
                <div className="font-semibold text-sm">{c.nome}</div>
                <div className="text-xs text-neutral-600">{c.categoria}</div>
              </button>
            ))}
            <button className="btn-secundario w-full !bg-white !text-neutral-900 !border-neutral-400" onClick={() => setEtapa("novo")}>
              + Produto novo (não é nenhum desses)
            </button>
            <button className="text-sm underline w-full text-neutral-800" onClick={() => inputFoto.current?.click()}>
              Tirar outra foto
            </button>
          </div>
        )}

        {etapa === "produto" && escolhido && (
          <div className="space-y-3">
            <div>
              <div className="font-bold text-neutral-900">{escolhido.nome}</div>
              <div className="text-xs text-neutral-600">{escolhido.categoria}</div>
            </div>
            <div className="border border-neutral-300 rounded-lg divide-y divide-neutral-200 text-sm text-neutral-900">
              {lojas.map((l) => (
                <div key={l.id} className="flex justify-between px-3 py-2">
                  <span>{l.nome}</span>
                  <span className="font-bold">{totalNaLoja(l.id)} un.</span>
                </div>
              ))}
            </div>
            {variantes.length > 0 && (
              <div>
                <label className="text-xs text-neutral-600">Qual cor/variação?</label>
                <select className="input w-full !bg-white !text-neutral-900 !border-neutral-300" value={varianteId} onChange={(e) => setVarianteId(e.target.value)}>
                  <option value="">Escolha…</option>
                  {variantes.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.nome_variante}
                      {lojaDestino ? ` (tem ${qtdNaLoja(lojaDestino, v.id)})` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {seletorLoja}
            <div>
              <label className="text-xs text-neutral-600">Quantas unidades chegaram?</label>
              <input
                className="input w-full !bg-white !text-neutral-900 !border-neutral-300 text-lg"
                type="number"
                inputMode="numeric"
                min={1}
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
              />
            </div>
            <button className="btn-primario w-full py-3" disabled={salvando} onClick={adicionar}>
              {salvando ? "Salvando…" : "Adicionar ao estoque"}
            </button>
            <button className="text-sm underline w-full text-neutral-800" onClick={() => setEtapa("opcoes")}>
              ← Voltar
            </button>
          </div>
        )}

        {etapa === "novo" && (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-neutral-900">Produto novo</p>
            <div>
              <label className="text-xs text-neutral-600">
                Nome{nomeSugerido ? " (a IA sugeriu — pode mudar)" : ""}
              </label>
              <div className="flex gap-2">
                <input
                  className="input flex-1 !bg-white !text-neutral-900 !border-neutral-300"
                  value={nomeNovo}
                  onChange={(e) => setNomeNovo(e.target.value)}
                  placeholder="Ex.: ROUPEIRO TORINO"
                />
                <button className="btn-secundario !bg-white !text-neutral-900 !border-neutral-400" onClick={ouvirNome} type="button">
                  {ouvindo ? "🎙️ …" : "🎤"}
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs text-neutral-600">
                Categoria{categoriaSugerida ? ` (IA sugeriu: ${categoriaSugerida})` : ""}
              </label>
              <select className="input w-full !bg-white !text-neutral-900 !border-neutral-300" value={categoriaNova} onChange={(e) => setCategoriaNova(e.target.value)}>
                <option value="">Escolha…</option>
                {categorias.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-neutral-600">Preço de venda (pode deixar pra depois)</label>
              <input
                className="input w-full !bg-white !text-neutral-900 !border-neutral-300"
                inputMode="decimal"
                value={precoNovo}
                onChange={(e) => setPrecoNovo(e.target.value)}
                placeholder="0,00"
              />
            </div>
            {seletorLoja}
            <div>
              <label className="text-xs text-neutral-600">Quantas unidades?</label>
              <input
                className="input w-full !bg-white !text-neutral-900 !border-neutral-300 text-lg"
                type="number"
                inputMode="numeric"
                min={1}
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
              />
            </div>
            <button className="btn-primario w-full py-3" disabled={salvando} onClick={criarNovo}>
              {salvando ? "Salvando…" : "Criar produto e adicionar"}
            </button>
            <button className="text-sm underline w-full text-neutral-800" onClick={() => setEtapa(candidatos.length ? "opcoes" : "inicio")}>
              ← Voltar
            </button>
          </div>
        )}

        {etapa === "pronto" && (
          <div className="space-y-3 text-center">
            <p className="font-semibold text-neutral-900">{mensagemFinal}</p>
            <button
              className="btn-primario w-full py-3"
              onClick={() => {
                setEtapa("inicio");
                setFoto("");
                setCandidatos([]);
                setEscolhido(null);
                setNomeNovo("");
                setPrecoNovo("");
                setQuantidade("1");
                setTimeout(() => inputFoto.current?.click(), 50);
              }}
            >
              📷 Adicionar outro
            </button>
            <button className="text-sm underline w-full text-neutral-800" onClick={aoFechar}>
              Fechar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
