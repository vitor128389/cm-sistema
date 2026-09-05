export function formatarMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function formatarData(data: string | null): string {
  if (!data) return "—";
  return new Date(data).toLocaleDateString("pt-BR");
}
