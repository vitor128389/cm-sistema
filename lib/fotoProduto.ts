"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { useLoja } from "@/contexts/LojaContext";

// A foto do produto só sai na notinha impressa da loja de Glória.
export const LOJA_GLORIA_ID = "061b11a6-997b-46d2-972c-982a7f6555b0";
export const lojaImprimeFoto = (lojaId: string | null | undefined) => lojaId === LOJA_GLORIA_ID;


const BUCKET = "produtos-fotos";
const TAMANHO_MAX = 700; // px — foto só pra mostrar/imprimir bem pequena

// Tira o fundo da foto NO NAVEGADOR (modelo de IA roda no próprio aparelho,
// não precisa de chave nem de servidor). Na primeira vez baixa o modelo
// (~40 MB) e demora um pouco; depois fica em cache.
// Devolve um PNG com fundo transparente, já cortado rente ao produto.
export async function removerFundoDaFoto(arquivo: Blob): Promise<Blob> {
  const { removeBackground } = await import("@imgly/background-removal");
  const semFundo = await removeBackground(arquivo, {
    output: { format: "image/png", quality: 0.9 },
  });
  return cortarEReduzir(semFundo);
}

// Corta as bordas transparentes (fica só o produto) e reduz pra TAMANHO_MAX.
async function cortarEReduzir(png: Blob): Promise<Blob> {
  const url = URL.createObjectURL(png);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Não consegui abrir a foto sem fundo."));
      i.src = url;
    });
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, c.width, c.height);
    let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        if (data[(y * c.width + x) * 4 + 3] > 24) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    if (x1 < 0) throw new Error("A IA não achou o produto na foto. Tente uma foto com o produto mais visível.");
    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    const escala = Math.min(1, TAMANHO_MAX / Math.max(w, h));
    const out = document.createElement("canvas");
    out.width = Math.max(1, Math.round(w * escala));
    out.height = Math.max(1, Math.round(h * escala));
    out.getContext("2d")!.drawImage(c, x0, y0, w, h, 0, 0, out.width, out.height);
    return await new Promise<Blob>((resolve, reject) =>
      out.toBlob((b) => (b ? resolve(b) : reject(new Error("Erro ao gerar a foto."))), "image/png")
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Guarda a foto (já sem fundo) no storage e grava o endereço no produto.
export async function salvarFotoDoProduto(
  produtoId: string,
  png: Blob,
  cliente: SupabaseClient = supabase
): Promise<string> {
  const caminho = `${produtoId}.png`;
  const { error } = await cliente.storage
    .from(BUCKET)
    .upload(caminho, png, { upsert: true, contentType: "image/png", cacheControl: "3600" });
  if (error) throw new Error(`Não consegui guardar a foto: ${error.message}`);
  const { data } = cliente.storage.from(BUCKET).getPublicUrl(caminho);
  // ?v= força trocar a foto antiga em cache quando substituir
  const url = `${data.publicUrl}?v=${Date.now()}`;
  const { error: erroUpdate } = await cliente.from("produtos").update({ foto_url: url }).eq("id", produtoId);
  if (erroUpdate) throw new Error(`Foto guardada, mas não consegui ligar ao produto: ${erroUpdate.message}`);
  cacheFotos.set(produtoId, url);
  return url;
}

export async function apagarFotoDoProduto(produtoId: string, cliente: SupabaseClient = supabase) {
  await cliente.storage.from(BUCKET).remove([`${produtoId}.png`]);
  const { error } = await cliente.from("produtos").update({ foto_url: null }).eq("id", produtoId);
  if (error) throw new Error(error.message);
  cacheFotos.set(produtoId, null);
}

// ---- leitura pra impressão -------------------------------------------------

const cacheFotos = new Map<string, string | null>();

// Busca as fotos dos produtos (uma consulta só) e já pré-carrega as imagens,
// pra estarem prontas na hora de imprimir. `carregando` fica true até acabar.
export function useFotosProdutos(produtoIds: (string | null | undefined)[]): {
  fotos: Map<string, string | null>;
  carregando: boolean;
} {
  const { lojaAtual } = useLoja();
  const imprime = lojaImprimeFoto(lojaAtual);
  const ids = imprime ? Array.from(new Set(produtoIds.filter((x): x is string => !!x))) : [];
  const chave = ids.sort().join(",");
  const [, forcar] = useState(0);
  const [carregando, setCarregando] = useState(() => ids.some((id) => !cacheFotos.has(id)));

  useEffect(() => {
    const faltam = ids.filter((id) => !cacheFotos.has(id));
    if (faltam.length === 0) {
      setCarregando(false);
      return;
    }
    let vivo = true;
    setCarregando(true);
    (async () => {
      try {
        const { data } = await supabase.from("produtos").select("id, foto_url").in("id", faltam);
        const achadas = new Map((data || []).map((p) => [p.id as string, (p.foto_url as string | null) || null]));
        await Promise.all(
          faltam.map(async (id) => {
            const url = achadas.get(id) || null;
            cacheFotos.set(id, url);
            if (url) {
              await new Promise<void>((resolve) => {
                const i = new Image();
                i.onload = () => resolve();
                i.onerror = () => resolve();
                i.src = url;
              });
            }
          })
        );
      } catch {
        faltam.forEach((id) => {
          if (!cacheFotos.has(id)) cacheFotos.set(id, null);
        });
      }
      if (vivo) {
        setCarregando(false);
        forcar((n) => n + 1);
      }
    })();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);

  return { fotos: cacheFotos, carregando };
}

// ---- PDF (jsPDF) -------------------------------------------------------------

export type FotoParaPdf = { dataUrl: string; largura: number; altura: number };

// Baixa as fotos dos produtos e devolve prontas pro jsPDF (data URL + tamanho).
// Qualquer falha numa foto só deixa aquele produto sem foto — nunca trava o PDF.
export async function carregarFotosParaPdf(
  produtoIds: (string | null | undefined)[],
  lojaId: string | null | undefined
): Promise<Map<string, FotoParaPdf>> {
  const resultado = new Map<string, FotoParaPdf>();
  if (!lojaImprimeFoto(lojaId)) return resultado;
  const ids = Array.from(new Set(produtoIds.filter((x): x is string => !!x)));
  if (ids.length === 0) return resultado;
  try {
    const faltam = ids.filter((id) => !cacheFotos.has(id));
    if (faltam.length > 0) {
      const { data } = await supabase.from("produtos").select("id, foto_url").in("id", faltam);
      const achadas = new Map((data || []).map((p) => [p.id as string, (p.foto_url as string | null) || null]));
      faltam.forEach((id) => cacheFotos.set(id, achadas.get(id) || null));
    }
  } catch {
    return resultado;
  }
  await Promise.all(
    ids.map(async (id) => {
      const url = cacheFotos.get(id);
      if (!url) return;
      try {
        const resp = await fetch(url);
        if (!resp.ok) return;
        const blob = await resp.blob();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result));
          r.onerror = () => reject(new Error("leitura"));
          r.readAsDataURL(blob);
        });
        const dim = await new Promise<{ w: number; h: number }>((resolve, reject) => {
          const i = new Image();
          i.onload = () => resolve({ w: i.naturalWidth, h: i.naturalHeight });
          i.onerror = () => reject(new Error("imagem"));
          i.src = dataUrl;
        });
        if (dim.w > 0 && dim.h > 0) resultado.set(id, { dataUrl, largura: dim.w, altura: dim.h });
      } catch {
        /* sem foto nesse produto */
      }
    })
  );
  return resultado;
}
