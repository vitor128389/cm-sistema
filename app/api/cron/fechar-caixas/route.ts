import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Roda todo dia à meia-noite (horário de Brasília) via Vercel Cron — ver
// vercel.json. Fecha qualquer turno de caixa que tenha ficado aberto (por
// esquecimento) exatamente na virada do dia, e já abre um turno novo pra
// o dia que está começando, herdando só as vendas de hoje (se alguma já
// tiver entrado antes do cron rodar de verdade).
function calcularMeiaNoiteLocalMaisRecente(agora: Date): Date {
  // Brasília é sempre UTC-3 (sem horário de verão desde 2019) — meia-noite
  // local = 03:00 UTC. Pega o 03:00 UTC mais recente que já passou, pra
  // funcionar certinho mesmo se o cron atrasar um pouco pra rodar.
  const candidato = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate(), 3, 0, 0, 0));
  if (candidato > agora) {
    candidato.setUTCDate(candidato.getUTCDate() - 1);
  }
  return candidato;
}

const CHAVE_FORMA: Record<string, string> = {
  Dinheiro: "total_dinheiro",
  Pix: "total_pix",
  Débito: "total_debito",
  Crédito: "total_credito",
  Link: "total_link",
};

export async function GET(request: Request) {
  const chaveEsperada = process.env.CRON_SECRET;
  const autorizacao = request.headers.get("authorization");
  if (!chaveEsperada || autorizacao !== `Bearer ${chaveEsperada}`) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const meiaNoite = calcularMeiaNoiteLocalMaisRecente(new Date());
  const meiaNoiteIso = meiaNoite.toISOString();

  const { data: turnosAbertos } = await supabase.from("turnos_caixa").select("*").eq("status", "aberto");

  const resultado: { turnoFechado: string; turnoNovo: string | null; lojaId: string }[] = [];

  for (const turno of turnosAbertos || []) {
    // se o turno abriu DEPOIS da meia-noite mais recente, é o turno normal
    // de hoje, aberto do jeito certo — não mexe nele
    if (new Date(turno.aberto_em) >= meiaNoite) continue;

    // vendas que entraram nesse turno já depois da virada do dia (pode
    // acontecer se o cron demorar um pouco pra rodar) — essas precisam
    // migrar pro turno novo, não ficar presas no turno de ontem
    const { data: vendasDeHoje } = await supabase
      .from("vendas")
      .select("id, total, cancelada")
      .eq("turno_caixa_id", turno.id)
      .gte("criado_em", meiaNoiteIso);

    const idsVendasDeHoje = (vendasDeHoje || []).map((v) => v.id);
    const { data: pagamentosDeHoje } =
      idsVendasDeHoje.length > 0
        ? await supabase.from("venda_pagamentos").select("forma_pagamento, valor, venda_id").in("venda_id", idsVendasDeHoje)
        : { data: [] };

    const totaisNovo: Record<string, number> = {
      total_vendido: 0,
      total_dinheiro: 0,
      total_pix: 0,
      total_debito: 0,
      total_credito: 0,
      total_link: 0,
    };
    (pagamentosDeHoje || []).forEach((p) => {
      const chave = CHAVE_FORMA[p.forma_pagamento];
      if (chave) totaisNovo[chave] += parseFloat(String(p.valor)) || 0;
    });
    (vendasDeHoje || [])
      .filter((v) => !v.cancelada)
      .forEach((v) => {
        totaisNovo.total_vendido += parseFloat(String(v.total)) || 0;
      });

    // fecha o turno de ontem com os totais dele MENOS o que foi movido pro novo
    await supabase
      .from("turnos_caixa")
      .update({
        status: "fechado",
        fechado_em: meiaNoiteIso,
        total_vendido: (parseFloat(String(turno.total_vendido)) || 0) - totaisNovo.total_vendido,
        total_dinheiro: (parseFloat(String(turno.total_dinheiro)) || 0) - totaisNovo.total_dinheiro,
        total_pix: (parseFloat(String(turno.total_pix)) || 0) - totaisNovo.total_pix,
        total_debito: (parseFloat(String(turno.total_debito)) || 0) - totaisNovo.total_debito,
        total_credito: (parseFloat(String(turno.total_credito)) || 0) - totaisNovo.total_credito,
        total_link: (parseFloat(String(turno.total_link)) || 0) - totaisNovo.total_link,
      })
      .eq("id", turno.id);

    // abre o turno novo pro dia que está começando, já com o que migrou
    const { data: novoTurno } = await supabase
      .from("turnos_caixa")
      .insert({
        caixa_id: turno.caixa_id,
        loja_id: turno.loja_id,
        aberto_por: turno.aberto_por,
        fundo_inicial: 0,
        status: "aberto",
        aberto_em: meiaNoiteIso,
        total_vendido: totaisNovo.total_vendido,
        total_dinheiro: totaisNovo.total_dinheiro,
        total_pix: totaisNovo.total_pix,
        total_debito: totaisNovo.total_debito,
        total_credito: totaisNovo.total_credito,
        total_link: totaisNovo.total_link,
      })
      .select("id")
      .single();

    if (idsVendasDeHoje.length > 0 && novoTurno) {
      await supabase.from("vendas").update({ turno_caixa_id: novoTurno.id }).in("id", idsVendasDeHoje);
    }

    let nomeLoja: string | null = null;
    const { data: loja } = await supabase.from("lojas").select("nome").eq("id", turno.loja_id).maybeSingle();
    nomeLoja = loja?.nome || null;

    await supabase.from("auditoria").insert({
      categoria: "Caixa",
      acao: "alteracao",
      tipo_execucao: "automatica",
      registro_tipo: "caixa",
      registro_id: turno.id,
      loja_id: turno.loja_id,
      loja_nome: nomeLoja,
      descricao: `Caixa fechado automaticamente à meia-noite (esquecido aberto) — um novo turno já foi aberto pra hoje`,
    });

    resultado.push({ turnoFechado: turno.id, turnoNovo: novoTurno?.id || null, lojaId: turno.loja_id });
  }

  return NextResponse.json({ ok: true, quantidade: resultado.length, detalhes: resultado });
}
