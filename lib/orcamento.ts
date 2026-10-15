import { formatarMoeda } from "@/lib/format";

export const FATOR_PRAZO = 1.1; // a prazo = à vista + 10% (mesma regra do Vender)

export type FormaExibicao = "ambos" | "avista" | "prazo";
export type StatusOrcamento = "aberto" | "aprovado" | "recusado";

export interface ItemOrcamento {
  chave: string; // só pra React
  produto_id: string | null;
  nome: string;
  variante: string | null;
  quantidade: number;
  valor_avista: number; // unitário
}

export interface OrcamentoSalvo {
  id: string;
  numero: number;
  loja_id: string;
  cliente_id: string | null;
  cliente_nome: string;
  cliente_telefone: string | null;
  cliente_endereco: string | null;
  status: StatusOrcamento;
  validade: string | null;
  prazo_entrega: string | null;
  desconto: number;
  frete: number;
  forma_exibicao: FormaExibicao;
  observacoes: string | null;
  total_avista: number;
  total_prazo: number;
  criado_em: string;
  orcamento_itens: { id: string; produto_id: string | null; nome: string; variante: string | null; quantidade: number; valor_avista: number; ordem: number }[];
}

export const arredondar = (n: number) => Math.round(n * 100) / 100;
export const valorPrazo = (avista: number) => arredondar(avista * FATOR_PRAZO);

export function calcularTotais(itens: { quantidade: number; valor_avista: number }[], desconto: number, frete: number) {
  const subtotalAvista = arredondar(itens.reduce((s, i) => s + i.quantidade * i.valor_avista, 0));
  const subtotalPrazo = arredondar(itens.reduce((s, i) => s + i.quantidade * valorPrazo(i.valor_avista), 0));
  const d = Math.min(Math.max(desconto || 0, 0), subtotalAvista);
  const baseAvista = arredondar(subtotalAvista - d);
  // o desconto é dado em cima do valor à vista; a prazo recalcula em cima do que sobrou
  const basePrazo = arredondar(baseAvista * FATOR_PRAZO);
  const f = Math.max(frete || 0, 0);
  return {
    subtotalAvista,
    subtotalPrazo,
    desconto: d,
    frete: f,
    totalAvista: arredondar(baseAvista + f),
    totalPrazo: arredondar(basePrazo + f),
  };
}

export function dataBrCurta(iso: string | null | undefined): string {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
}

export function somarDias(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function vencido(validade: string | null): boolean {
  if (!validade) return false;
  return validade < somarDias(0);
}

export interface DadosMensagem {
  numero?: number | null;
  clienteNome: string;
  itens: { nome: string; variante: string | null; quantidade: number; valor_avista: number }[];
  desconto: number;
  frete: number;
  forma: FormaExibicao;
  validade: string | null;
  prazoEntrega: string | null;
  observacoes: string | null;
  lojaNome: string;
}

export function textoWhatsAppOrcamento(d: DadosMensagem): string {
  const t = calcularTotais(d.itens, d.desconto, d.frete);
  const primeiro = d.clienteNome.trim().split(" ")[0];
  const l: string[] = [];
  l.push(`Olá, ${primeiro}! Segue o seu orçamento da *${d.lojaNome}*${d.numero ? ` (nº ${d.numero})` : ""}:`);
  l.push("");
  d.itens.forEach((i) => {
    const nome = i.variante && i.variante !== "Padrão" ? `${i.nome} - ${i.variante}` : i.nome;
    const un = d.forma === "prazo" ? valorPrazo(i.valor_avista) : i.valor_avista;
    l.push(`• ${i.quantidade}x ${nome} — ${formatarMoeda(un * i.quantidade)}`);
  });
  l.push("");
  if (t.desconto > 0) l.push(`Desconto: -${formatarMoeda(t.desconto)}`);
  if (t.frete > 0) l.push(`Frete/montagem: ${formatarMoeda(t.frete)}`);
  if (d.forma !== "prazo") l.push(`*À vista: ${formatarMoeda(t.totalAvista)}*`);
  if (d.forma !== "avista") l.push(`*A prazo: ${formatarMoeda(t.totalPrazo)}*`);
  if (d.prazoEntrega) l.push(`Prazo de entrega: ${d.prazoEntrega}`);
  if (d.validade) l.push(`Orçamento válido até ${dataBrCurta(d.validade)}.`);
  if (d.observacoes?.trim()) l.push(`Obs.: ${d.observacoes.trim()}`);
  l.push("");
  l.push("Qualquer dúvida é só chamar! 😊");
  return l.join("\n");
}

export function linkWhatsApp(telefone: string, mensagem: string): string {
  const n = telefone.replace(/\D/g, "");
  const comDDI = n.length <= 11 ? `55${n}` : n;
  return `https://wa.me/${comDDI}?text=${encodeURIComponent(mensagem)}`;
}
