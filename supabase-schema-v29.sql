-- v29: promoção dos estofados — configuração única (vale pras 3 lojas, o catálogo é compartilhado).
create table if not exists public.promocao_config (
  id int primary key default 1 check (id = 1),
  ativo boolean not null default false,
  percentual numeric(5,2) not null default 20 check (percentual >= 0 and percentual <= 100),
  nome text not null default 'Promoção',
  categorias text[] not null default array['Sofás','Poltronas e Namoradeiras','Cabeceiras e Baús','Cadeiras e Puffs'],
  atualizado_em timestamptz not null default now()
);
insert into public.promocao_config (id) values (1) on conflict (id) do nothing;
alter table public.promocao_config enable row level security;
drop policy if exists equipe_le_promocao on public.promocao_config;
create policy equipe_le_promocao on public.promocao_config for select using (auth.role() = 'authenticated');
drop policy if exists admin_gerencia_promocao on public.promocao_config;
create policy admin_gerencia_promocao on public.promocao_config for all
  using (exists (select 1 from public.usuarios u where u.id = auth.uid() and u.funcao = 'admin'))
  with check (exists (select 1 from public.usuarios u where u.id = auth.uid() and u.funcao = 'admin'));
