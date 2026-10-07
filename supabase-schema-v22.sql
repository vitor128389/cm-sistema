-- v22: entrada de nota fiscal (NF-e) no estoque do Depósito.
create table if not exists notas_entrada (
  id uuid primary key default gen_random_uuid(),
  chave_acesso text unique,
  numero text,
  fornecedor text,
  loja_id uuid references lojas(id),
  total numeric(12,2) not null default 0,
  fator_preco numeric(6,3),
  itens jsonb not null default '[]',
  usuario_id uuid,
  criado_em timestamptz not null default now()
);
alter table notas_entrada enable row level security;
create policy notas_entrada_all on notas_entrada for all to authenticated using (true) with check (true);
