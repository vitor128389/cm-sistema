-- =============================================
-- v17: reformula Trocas pra suportar N produtos devolvidos por
-- M produtos novos (não só pares 1-a-1), com escolha de tipo de
-- preço (à vista/a prazo) pro cálculo da diferença.
--
-- A tabela `trocas` antiga (da v11) NÃO é apagada — fica preservada
-- com o histórico de trocas simples feitas antes dessa migração.
-- As trocas novas passam a usar essas 3 tabelas relacionadas.
-- =============================================

create table if not exists trocas_grupo (
  id uuid primary key default gen_random_uuid(),
  numero_troca bigserial,
  venda_original_id uuid not null references vendas(id),
  tipo_preco text not null check (tipo_preco in ('avista','aprazo')),
  valor_devolvido_total numeric(10,2) not null,
  valor_novo_total numeric(10,2) not null,
  diferenca numeric(10,2) not null, -- positivo = cliente pagou mais, negativo = loja devolveu
  forma_pagamento_diferenca text,
  turno_caixa_id uuid references turnos_caixa(id),
  loja_id uuid not null references lojas(id),
  criado_em timestamptz not null default now()
);

create table if not exists trocas_devolvidos (
  id uuid primary key default gen_random_uuid(),
  troca_id uuid not null references trocas_grupo(id) on delete cascade,
  venda_item_original_id uuid not null references venda_itens(id),
  produto_id uuid references produtos(id),
  variante_id uuid references produto_variantes(id),
  produto_nome text not null,
  variante text,
  quantidade int not null,
  valor_unitario_avista numeric(10,2) not null,
  valor_unitario_aprazo numeric(10,2) not null
);

create table if not exists trocas_novos (
  id uuid primary key default gen_random_uuid(),
  troca_id uuid not null references trocas_grupo(id) on delete cascade,
  produto_id uuid not null references produtos(id),
  variante_id uuid references produto_variantes(id),
  produto_nome text not null,
  variante text,
  quantidade int not null,
  valor_unitario_avista numeric(10,2) not null,
  valor_unitario_aprazo numeric(10,2) not null
);

alter table trocas_grupo enable row level security;
alter table trocas_devolvidos enable row level security;
alter table trocas_novos enable row level security;

do $$ begin
  execute (select coalesce(string_agg(format('drop policy if exists %I on trocas_grupo;', policyname), ' '), '') from pg_policies where tablename = 'trocas_grupo');
  execute (select coalesce(string_agg(format('drop policy if exists %I on trocas_devolvidos;', policyname), ' '), '') from pg_policies where tablename = 'trocas_devolvidos');
  execute (select coalesce(string_agg(format('drop policy if exists %I on trocas_novos;', policyname), ' '), '') from pg_policies where tablename = 'trocas_novos');
end $$;

create policy "acesso_por_loja_trocas_grupo" on trocas_grupo for all using (
  exists (select 1 from usuarios u where u.id = auth.uid() and (u.funcao = 'admin' or u.loja_id = trocas_grupo.loja_id))
);
create policy "acesso_por_loja_trocas_devolvidos" on trocas_devolvidos for all using (
  exists (
    select 1 from trocas_grupo tg join usuarios u on u.id = auth.uid()
    where tg.id = trocas_devolvidos.troca_id and (u.funcao = 'admin' or u.loja_id = tg.loja_id)
  )
);
create policy "acesso_por_loja_trocas_novos" on trocas_novos for all using (
  exists (
    select 1 from trocas_grupo tg join usuarios u on u.id = auth.uid()
    where tg.id = trocas_novos.troca_id and (u.funcao = 'admin' or u.loja_id = tg.loja_id)
  )
);

create index if not exists idx_trocas_grupo_venda_original on trocas_grupo(venda_original_id);
create index if not exists idx_trocas_grupo_loja on trocas_grupo(loja_id);
create index if not exists idx_trocas_devolvidos_troca on trocas_devolvidos(troca_id);
create index if not exists idx_trocas_novos_troca on trocas_novos(troca_id);
