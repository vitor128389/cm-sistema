// Miniatura do produto pra listas (foto já salva no cadastro, sem fundo).
// Sem foto: mostra um espaço reservado discreto, pra manter o alinhamento da lista.
export default function FotoMini({ url, nome, tamanho = 40 }: { url?: string | null; nome?: string; tamanho?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center shrink-0 rounded-md overflow-hidden bg-estofado-100 border border-estofado-200 align-middle"
      style={{ width: tamanho, height: tamanho }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={nome || ""} loading="lazy" className="max-w-full max-h-full object-contain" />
      ) : (
        <span aria-hidden className="text-neutral-400" style={{ fontSize: tamanho * 0.45 }}>
          🛋️
        </span>
      )}
    </span>
  );
}
