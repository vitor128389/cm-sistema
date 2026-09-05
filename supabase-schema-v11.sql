-- =============================================
-- v11: sistema de trocas de produtos. Troca um item de uma venda
-- por outro produto, ajusta estoque das duas pontas e registra a
-- diferença de valor no caixa corretamente.
-- =============================================

create table if not exists trocas (
  id uuid primary key default gen_random_uuid(),
  numero_troca bigserial,
  venda_original_id uuid not null references vendas(id),
  venda_item_original_id uuid not null references venda_itens(id),
  produto_original_nome text not null,
  variante_original text,
  quantidade int not null default 1,
  produto_novo_id uuid not null references produtos(id),
  variante_novo_id uuid references produto_variantes(id),
  produto_novo_nome text not null,
  variante_novo text,
  valor_produto_original numeric(10,2) not null,
  valor_produto_novo numeric(10,2) not null,
  diferenca numeric(10,2) not null, -- positivo = cliente pagou mais, negativo = loja devolveu
  forma_pagamento_diferenca text,
  turno_caixa_id uuid references turnos_caixa(id),
  loja_id uuid not null references lojas(id),
  criado_em timestamptz not null default now()
);

alter table trocas enable row level security;

do $$ begin
  execute (select coalesce(string_agg(format('drop policy if exists %I on trocas;', policyname), ' '), '') from pg_policies where tablename = 'trocas');
end $$;

create policy "acesso_por_loja_trocas" on trocas for all using (
  exists (select 1 from usuarios u where u.id = auth.uid() and (u.funcao = 'admin' or u.loja_id = trocas.loja_id))
);

create index if not exists idx_trocas_venda_original on trocas(venda_original_id);
create index if not exists idx_trocas_loja on trocas(loja_id);

-- marca visualmente, na própria venda_itens, que aquele item já foi trocado
alter table venda_itens add column if not exists trocado boolean not null default false;

-- permissões padrão pra tela nova (Trocas) — vendedor e caixa têm acesso,
-- produção não. Admin sempre tem acesso a tudo, independente dessa tabela.
insert into permissoes (funcao, tela, pode_acessar) values
  ('vendedor', 'trocas', true),
  ('caixa', 'trocas', true),
  ('producao', 'trocas', false)
on conflict (funcao, tela) do nothing;
