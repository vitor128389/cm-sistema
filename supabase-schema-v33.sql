-- Pagamento "Na entrega": o cliente paga uma parte agora e o restante quando receber o produto.
-- Libera a forma "Na entrega" nas tabelas de pagamento (as travas antigas só aceitavam Dinheiro/Pix/Débito/Crédito/Link).
do $$
declare r record;
begin
  for r in
    select c.conname, c.conrelid::regclass as tabela
    from pg_constraint c
    where c.contype = 'c'
      and c.conrelid in ('public.venda_pagamentos'::regclass, 'public.vendas'::regclass)
      and pg_get_constraintdef(c.oid) ilike '%forma_pagamento%'
  loop
    execute format('alter table %s drop constraint %I', r.tabela, r.conname);
  end loop;
end $$;

alter table public.venda_pagamentos
  add constraint venda_pagamentos_forma_pagamento_check
  check (forma_pagamento in ('Dinheiro','Pix','Débito','Crédito','Link','Na entrega'));

alter table public.vendas
  add constraint vendas_forma_pagamento_check
  check (forma_pagamento in ('Dinheiro','Pix','Débito','Crédito','Link','Dividido'));

-- Chaves liga/desliga de recursos (a Administração > Recursos usa isso).
create table if not exists public.configuracoes (
  chave text primary key,
  valor text not null default '',
  atualizado_em timestamptz not null default now()
);
alter table public.configuracoes enable row level security;
drop policy if exists configuracoes_ler on public.configuracoes;
create policy configuracoes_ler on public.configuracoes for select to authenticated using (true);
drop policy if exists configuracoes_admin on public.configuracoes;
create policy configuracoes_admin on public.configuracoes for all to authenticated
  using (exists (select 1 from public.usuarios u where u.id = auth.uid() and u.funcao = 'admin'))
  with check (exists (select 1 from public.usuarios u where u.id = auth.uid() and u.funcao = 'admin'));
insert into public.configuracoes (chave, valor) values ('pagamento_na_entrega', 'false') on conflict (chave) do nothing;
