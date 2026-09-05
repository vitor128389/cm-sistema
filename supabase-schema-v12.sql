-- =============================================
-- v12: sangria de caixa — retira dinheiro físico do caixa sem
-- afetar as vendas registradas (pix, cartão, crédito, débito,
-- faturamento e quantidade de produtos continuam intactos).
-- =============================================

create table if not exists sangrias (
  id uuid primary key default gen_random_uuid(),
  turno_caixa_id uuid not null references turnos_caixa(id) on delete cascade,
  loja_id uuid not null references lojas(id),
  valor numeric(10,2) not null check (valor > 0),
  motivo text not null,
  usuario_id uuid references usuarios(id),
  criado_em timestamptz not null default now()
);

alter table sangrias enable row level security;

do $$ begin
  execute (select coalesce(string_agg(format('drop policy if exists %I on sangrias;', policyname), ' '), '') from pg_policies where tablename = 'sangrias');
end $$;

create policy "acesso_por_loja_sangrias" on sangrias for all using (
  exists (select 1 from usuarios u where u.id = auth.uid() and (u.funcao = 'admin' or u.loja_id = sangrias.loja_id))
);

create index if not exists idx_sangrias_turno on sangrias(turno_caixa_id);
create index if not exists idx_sangrias_loja on sangrias(loja_id);
