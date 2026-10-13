// Monta o cupom (DANFE NFC-e) a partir do XML autorizado da nota, no modelo do cupom
// fiscal tradicional: selo NFC-e à esquerda, nome da loja centralizado ao lado, itens,
// totais, chave de acesso, QR Code e protocolo. Só roda no servidor.
import { XMLParser } from "fast-xml-parser";
import QRCode from "qrcode";

type No = Record<string, unknown>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false, // mantém tudo como texto (CNPJ, chave, zeros à esquerda)
  isArray: (nome) => nome === "det" || nome === "detPag",
});

const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const num = (v: unknown) => {
  const n = Number(String(v ?? "0").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const brl = (v: unknown) => num(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qtd = (v: unknown) => num(v).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 4 });

function cnpjFmt(c: string) {
  const d = c.replace(/\D/g, "");
  return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : c;
}
function cpfFmt(c: string) {
  const d = c.replace(/\D/g, "");
  return d.length === 11 ? d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4") : c;
}

function dataHora(iso: unknown): string {
  const s = String(iso ?? "");
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}:${m[6]}` : s;
}

const FORMA_PAGAMENTO: Record<string, string> = {
  "01": "Dinheiro",
  "02": "Cheque",
  "03": "Cartão de Crédito",
  "04": "Cartão de Débito",
  "05": "Crédito Loja",
  "10": "Vale Alimentação",
  "11": "Vale Refeição",
  "12": "Vale Presente",
  "13": "Vale Combustível",
  "15": "Boleto Bancário",
  "17": "PIX",
  "99": "Outros",
};

// Selo "NFC-e" simples, em preto e branco (a térmica não reproduz cores).
const SELO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
<circle cx="60" cy="60" r="56" fill="#fff" stroke="#000" stroke-width="6"/>
<g transform="translate(6,6) scale(0.9)">
<path d="M36 22h48v50l-6-4-6 4-6-4-6 4-6-4-6 4-6-4z" fill="#fff" stroke="#000" stroke-width="5" stroke-linejoin="round"/>
<path d="M44 36h32M44 46h32M44 56h20" stroke="#000" stroke-width="5" stroke-linecap="round"/>
</g>
<text x="60" y="92" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="900" font-size="19" fill="#000">NFC-e</text>
</svg>`;

export async function montarCupomNfce(xml: string, logoUri?: string | null): Promise<string | null> {
  let raiz: No;
  try {
    raiz = parser.parse(xml) as No;
  } catch {
    return null;
  }
  const proc = (raiz.nfeProc as No) || raiz;
  const nfe = (proc.NFe as No) || null;
  const inf = (nfe?.infNFe as No) || null;
  if (!inf) return null;

  const ide = (inf.ide as No) || {};
  const emit = (inf.emit as No) || {};
  const ender = (emit.enderEmit as No) || {};
  const dest = (inf.dest as No) || null;
  const itens = (inf.det as No[]) || [];
  const total = ((inf.total as No)?.ICMSTot as No) || {};
  const pag = (inf.pag as No) || {};
  const pagamentos = (pag.detPag as No[]) || [];
  const supl = (nfe?.infNFeSupl as No) || {};
  const prot = ((proc.protNFe as No)?.infProt as No) || {};

  const chave = String(prot.chNFe || String(inf["@_Id"] || "").replace(/^NFe/, ""));
  const gruposChave = chave.replace(/\D/g, "").match(/\d{1,4}/g) || [];
  const chaveGrupos = `${gruposChave.slice(0, 6).join(" ")}<br>${gruposChave.slice(6).join(" ")}`;
  const homolog = String(ide.tpAmb) === "2";

  const qrUrl = String(supl.qrCode || "");
  const qrImg = qrUrl ? await QRCode.toDataURL(qrUrl, { margin: 0, width: 360, errorCorrectionLevel: "M" }) : "";
  // símbolo original da NFC-e (o mesmo do DANFE da Focus); o SVG simples só entra se não vier.
  const seloImg = logoUri || `data:image/svg+xml;base64,${Buffer.from(SELO_SVG).toString("base64")}`;

  const nome = String(emit.xNome || "");
  const fantasia = String(emit.xFant || "");
  const endereco = [
    [ender.xLgr, ender.nro].filter(Boolean).join(", "),
    ender.xBairro,
    [ender.xMun, ender.UF].filter(Boolean).join("/"),
  ]
    .filter(Boolean)
    .join(" - ");

  const linhasItens = itens
    .map((d) => {
      const p = (d.prod as No) || {};
      return `<tr>
        <td class="c">${esc(d["@_nItem"])}</td>
        <td>${esc(p.cProd)}</td>
        <td class="desc">${esc(p.xProd)}</td>
        <td class="r">${qtd(p.qCom)}</td>
        <td class="c">${esc(p.uCom)}</td>
        <td class="r">${brl(p.vUnCom)}</td>
        <td class="r">${brl(p.vProd)}</td>
      </tr>`;
    })
    .join("");

  const qtdItens = itens.length;
  const vDesc = num(total.vDesc);
  const vOutro = num(total.vOutro);
  const vTroco = num(pag.vTroco);

  const linhasPag = pagamentos
    .map(
      (d) =>
        `<div class="par"><span>${esc(FORMA_PAGAMENTO[String(d.tPag)] || "Outros")}</span><span>${brl(d.vPag)}</span></div>`
    )
    .join("");

  const consumidor = dest
    ? `CONSUMIDOR - ${dest.CPF ? "CPF: " + cpfFmt(String(dest.CPF)) : dest.CNPJ ? "CNPJ: " + cnpjFmt(String(dest.CNPJ)) : ""}${
        dest.xNome ? `<br>${esc(dest.xNome)}` : ""
      }`
    : "CONSUMIDOR<br>Consumidor não identificado";

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<title>NFC-e ${esc(ide.nNF)}</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  *{ box-sizing:border-box; }
  html,body{ margin:0; padding:0; background:#fff; }
  body{ width:76mm; margin:0 auto; padding:3mm 1mm 4mm; color:#000;
    font-family:Arial,Helvetica,sans-serif; font-weight:700; font-size:10.5px; line-height:1.3;
    -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .topo{ display:flex; align-items:center; gap:6px; }
  .topo img{ width:15mm; height:15mm; object-fit:contain; flex:none; }
  .empresa{ flex:1; text-align:center; }
  .empresa .nome{ font-size:12.5px; font-weight:900; }
  .empresa .peq{ font-size:9.5px; }
  .tit{ text-align:center; border-top:1.5px dashed #000; border-bottom:1.5px dashed #000; padding:3px 0; margin:5px 0; font-size:9.5px; }
  .aviso{ text-align:center; font-size:9.5px; margin:3px 0; }
  .homolog{ text-align:center; font-weight:900; font-size:11px; margin:4px 0; border:1.5px solid #000; padding:2px; }
  table{ width:100%; border-collapse:collapse; font-size:9.5px; }
  th{ text-align:left; border-bottom:1.5px solid #000; padding:2px 1px; font-weight:900; }
  td{ padding:2px 1px; vertical-align:top; }
  td.desc{ width:38%; word-break:break-word; }
  .r{ text-align:right; } .c{ text-align:center; }
  .sep{ border-top:1.5px dashed #000; margin:5px 0; }
  .par{ display:flex; justify-content:space-between; gap:6px; }
  .par.g{ font-size:12px; font-weight:900; }
  .centro{ text-align:center; }
  .chave{ font-size:11px; letter-spacing:.3px; word-break:break-all; margin:2px 0 4px; }
  .qr{ display:block; margin:4px auto; width:34mm; height:34mm; image-rendering:pixelated; image-rendering:crisp-edges; }
  .peq{ font-size:9px; }
</style></head><body>
  <div class="topo">
    <img src="${seloImg}" alt="NFC-e">
    <div class="empresa">
      <div class="nome">${esc(nome)}</div>
      ${fantasia && fantasia.toUpperCase() !== nome.toUpperCase() ? `<div class="peq">${esc(fantasia)}</div>` : ""}
      <div class="peq">CNPJ: ${esc(cnpjFmt(String(emit.CNPJ || "")))}${emit.IE ? ` &nbsp; IE: ${esc(emit.IE)}` : ""}</div>
      <div class="peq">${esc(endereco)}</div>
    </div>
  </div>

  <div class="tit">DANFE NFC-e - Documento Auxiliar da Nota Fiscal de Consumidor Eletrônica</div>
  <div class="aviso">NFC-e não permite aproveitamento de crédito de ICMS</div>
  ${homolog ? `<div class="homolog">EMITIDA EM AMBIENTE DE HOMOLOGAÇÃO<br>SEM VALOR FISCAL</div>` : ""}

  <table>
    <thead><tr><th class="c">It</th><th>Cód</th><th>Descrição</th><th class="r">Qtde</th><th class="c">Un</th><th class="r">Vl Unit</th><th class="r">Vl Total</th></tr></thead>
    <tbody>${linhasItens}</tbody>
  </table>

  <div class="sep"></div>
  <div class="par"><span>Qtd. total de itens</span><span>${qtdItens}</span></div>
  <div class="par"><span>Valor total R$</span><span>${brl(total.vProd)}</span></div>
  ${vDesc > 0 ? `<div class="par"><span>Desconto R$</span><span>${brl(vDesc)}</span></div>` : ""}
  ${vOutro > 0 ? `<div class="par"><span>Outras despesas R$</span><span>${brl(vOutro)}</span></div>` : ""}
  <div class="par g"><span>VALOR A PAGAR R$</span><span>${brl(total.vNF)}</span></div>
  <div class="par"><span>FORMA PAGAMENTO</span><span>Valor pago R$</span></div>
  ${linhasPag}
  ${vTroco > 0 ? `<div class="par"><span>Troco R$</span><span>${brl(vTroco)}</span></div>` : ""}

  <div class="sep"></div>
  <div class="sep"></div>

  <div class="centro">NFC-e nº ${esc(String(ide.nNF || "").padStart(9, "0"))} &nbsp; Série ${esc(ide.serie)} &nbsp; ${esc(dataHora(ide.dhEmi))}</div>
  <div class="centro peq">Consulte pela Chave de Acesso em<br>${esc(supl.urlChave || "")}</div>
  <div class="centro" style="margin-top:4px">CHAVE DE ACESSO</div>
  <div class="centro chave">${chaveGrupos}</div>

  <div class="centro">${consumidor}</div>
  <div class="centro peq" style="margin-top:4px">Consulte via leitor de QR Code</div>
  ${qrImg ? `<img class="qr" src="${qrImg}" alt="QR Code">` : ""}

  <div class="centro peq">Protocolo de Autorização: ${esc(prot.nProt || "")}<br>Data de Autorização: ${esc(dataHora(prot.dhRecbto))}</div>
  <div class="centro" style="margin-top:6px">OBRIGADO! VOLTE SEMPRE!</div>
</body></html>`;
}
