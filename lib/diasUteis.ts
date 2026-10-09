// Dias úteis: pula sábado, domingo e feriados (nacionais + estaduais de Sergipe).
// Feriado municipal não está na lista (varia por cidade).

function pascoa(ano: number): Date {
  // Algoritmo de Meeus/Jones/Butcher
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(ano, mes - 1, dia);
}

const chave = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const cache = new Map<number, Set<string>>();

export function feriadosDoAno(ano: number): Set<string> {
  const guardado = cache.get(ano);
  if (guardado) return guardado;
  const fixos: Array<[number, number]> = [
    [1, 1], // Confraternização Universal
    [21, 4], // Tiradentes
    [1, 5], // Dia do Trabalho
    [7, 9], // Independência
    [12, 10], // Nossa Senhora Aparecida
    [2, 11], // Finados
    [15, 11], // Proclamação da República
    [20, 11], // Consciência Negra
    [25, 12], // Natal
    [24, 6], // São João (Sergipe)
    [8, 7], // Emancipação Política de Sergipe
  ].map(([d, m]) => [d, m] as [number, number]);
  const set = new Set<string>(fixos.map(([d, m]) => chave(new Date(ano, m - 1, d))));
  const p = pascoa(ano);
  const somar = (n: number) => new Date(p.getFullYear(), p.getMonth(), p.getDate() + n);
  set.add(chave(somar(-48))); // Segunda de Carnaval
  set.add(chave(somar(-47))); // Terça de Carnaval
  set.add(chave(somar(-2))); // Sexta-feira Santa
  set.add(chave(somar(60))); // Corpus Christi
  cache.set(ano, set);
  return set;
}

export function ehDiaUtil(d: Date): boolean {
  const dow = d.getDay();
  if (dow === 0 || dow === 6) return false;
  return !feriadosDoAno(d.getFullYear()).has(chave(d));
}

// Soma N dias úteis a partir de hoje. Retorna AAAA-MM-DD.
export function somarDiasUteis(quantidade: number): string {
  const data = new Date();
  data.setHours(0, 0, 0, 0);
  let restantes = quantidade;
  while (restantes > 0) {
    data.setDate(data.getDate() + 1);
    if (ehDiaUtil(data)) restantes--;
  }
  return chave(data);
}
