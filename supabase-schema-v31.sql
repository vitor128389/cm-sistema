-- Lembretes pessoais (sino do topo): cada usuário vê só os seus.
create table if not exists lembretes (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  titulo text not null,
  data_hora timestamptz not null,
  concluido boolean not null default false,
  concluido_em timestamptz,
  criado_em timestamptz not null default now()
);
create index if not exists lembretes_usuario_idx on lembretes (usuario_id, concluido, data_hora);
alter table lembretes enable row level security;
create policy "lembretes_do_proprio_usuario" on lembretes
  for all to authenticated
  using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid());
