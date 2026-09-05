-- =============================================
-- v7: produtos/preços voltam a ser um catálogo ÚNICO,
-- compartilhado entre todas as lojas. O que passa a ser
-- por loja é só o ESTOQUE (quantas peças tem em cada uma).
-- =============================================

-- ---------- produtos deixa de ser "dono" de uma loja ----------
alter table produtos alter column loja_id drop not null;

-- ---------- TABELA DE ESTOQUE POR LOJA ----------
create table if not exists estoque_loja (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references lojas(id) on delete cascade,
  produto_id uuid not null references produtos(id) on delete cascade,
  variante_id uuid references produto_variantes(id) on delete cascade,
  -- 'simples' quando o produto não tem variação de tecido/espessura,
  -- senão o id da variante em texto — existe só pra permitir um UNIQUE
  -- sem dor de cabeça com valores nulos.
  chave_variante text not null default 'simples',
  quantidade int not null default 0,
  atualizado_em timestamptz not null default now(),
  unique (loja_id, produto_id, chave_variante)
);

alter table estoque_loja enable row level security;

do $$ begin
  execute (select coalesce(string_agg(format('drop policy if exists %I on estoque_loja;', policyname), ' '), '') from pg_policies where tablename = 'estoque_loja');
end $$;

create policy "acesso_por_loja_estoque" on estoque_loja for all using (
  exists (select 1 from usuarios u where u.id = auth.uid() and (u.funcao = 'admin' or u.loja_id = estoque_loja.loja_id))
);

create index if not exists idx_estoque_loja_loja on estoque_loja(loja_id);
create index if not exists idx_estoque_loja_produto on estoque_loja(produto_id);

-- ---------- MIGRA O ESTOQUE ATUAL PRA TABELA NOVA ----------
-- produtos "simples" (sem variação) — usa produtos.quantidade_estoque
insert into estoque_loja (loja_id, produto_id, variante_id, chave_variante, quantidade)
select p.loja_id, p.id, null, 'simples', coalesce(p.quantidade_estoque, 0)
from produtos p
where p.tipo_precificacao = 'simples' and p.loja_id is not null
on conflict (loja_id, produto_id, chave_variante) do nothing;

-- produtos com tecido/espessura — usa produto_variantes.estoque
insert into estoque_loja (loja_id, produto_id, variante_id, chave_variante, quantidade)
select p.loja_id, v.produto_id, v.id, v.id::text, v.estoque
from produto_variantes v
join produtos p on p.id = v.produto_id
where p.loja_id is not null
on conflict (loja_id, produto_id, chave_variante) do nothing;

-- ---------- ZERA O ESTOQUE DESSE PRODUTO NAS OUTRAS LOJAS (só ainda não existiam) ----------
insert into estoque_loja (loja_id, produto_id, variante_id, chave_variante, quantidade)
select l.id, p.id, null, 'simples', 0
from lojas l
cross join produtos p
where p.tipo_precificacao = 'simples'
on conflict (loja_id, produto_id, chave_variante) do nothing;

insert into estoque_loja (loja_id, produto_id, variante_id, chave_variante, quantidade)
select l.id, v.produto_id, v.id, v.id::text, 0
from lojas l
cross join produto_variantes v
on conflict (loja_id, produto_id, chave_variante) do nothing;

-- ---------- A PARTIR DE AGORA: todo produto/variante novo já ganha uma
-- linha de estoque (zerada) em TODAS as lojas automaticamente ----------
create or replace function criar_estoque_zero_produto_simples()
returns trigger as $$
begin
  if new.tipo_precificacao = 'simples' then
    insert into estoque_loja (loja_id, produto_id, variante_id, chave_variante, quantidade)
    select l.id, new.id, null, 'simples', 0 from lojas l
    on conflict (loja_id, produto_id, chave_variante) do nothing;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_estoque_zero_produto on produtos;
create trigger trg_estoque_zero_produto
  after insert on produtos
  for each row execute function criar_estoque_zero_produto_simples();

create or replace function criar_estoque_zero_variante()
returns trigger as $$
begin
  insert into estoque_loja (loja_id, produto_id, variante_id, chave_variante, quantidade)
  select l.id, new.produto_id, new.id, new.id::text, 0 from lojas l
  on conflict (loja_id, produto_id, chave_variante) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_estoque_zero_variante on produto_variantes;
create trigger trg_estoque_zero_variante
  after insert on produto_variantes
  for each row execute function criar_estoque_zero_variante();

-- e toda loja nova recebe estoque zerado de tudo que já existe no catálogo
create or replace function criar_estoque_zero_loja_nova()
returns trigger as $$
begin
  insert into estoque_loja (loja_id, produto_id, variante_id, chave_variante, quantidade)
  select new.id, p.id, null, 'simples', 0 from produtos p where p.tipo_precificacao = 'simples'
  on conflict (loja_id, produto_id, chave_variante) do nothing;

  insert into estoque_loja (loja_id, produto_id, variante_id, chave_variante, quantidade)
  select new.id, v.produto_id, v.id, v.id::text, 0 from produto_variantes v
  on conflict (loja_id, produto_id, chave_variante) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_estoque_zero_loja_nova on lojas;
create trigger trg_estoque_zero_loja_nova
  after insert on lojas
  for each row execute function criar_estoque_zero_loja_nova();

-- ---------- RLS: produtos e variantes voltam a ser um catálogo único ----------
-- todo mundo logado pode LER; só admin pode criar/editar/excluir (evita bagunça
-- entre lojas mexendo no catálogo compartilhado ao mesmo tempo)
do $$ begin
  execute (select coalesce(string_agg(format('drop policy if exists %I on produtos;', policyname), ' '), '') from pg_policies where tablename = 'produtos');
  execute (select coalesce(string_agg(format('drop policy if exists %I on produto_variantes;', policyname), ' '), '') from pg_policies where tablename = 'produto_variantes');
end $$;

create policy "produtos_select_todos" on produtos for select using (auth.role() = 'authenticated');
create policy "produtos_admin_insert" on produtos for insert with check (
  exists (select 1 from usuarios u where u.id = auth.uid() and u.funcao = 'admin')
);
create policy "produtos_admin_update" on produtos for update using (
  exists (select 1 from usuarios u where u.id = auth.uid() and u.funcao = 'admin')
);
create policy "produtos_admin_delete" on produtos for delete using (
  exists (select 1 from usuarios u where u.id = auth.uid() and u.funcao = 'admin')
);

create policy "produto_variantes_select_todos" on produto_variantes for select using (auth.role() = 'authenticated');
create policy "produto_variantes_admin_insert" on produto_variantes for insert with check (
  exists (select 1 from usuarios u where u.id = auth.uid() and u.funcao = 'admin')
);
create policy "produto_variantes_admin_update" on produto_variantes for update using (
  exists (select 1 from usuarios u where u.id = auth.uid() and u.funcao = 'admin')
);
create policy "produto_variantes_admin_delete" on produto_variantes for delete using (
  exists (select 1 from usuarios u where u.id = auth.uid() and u.funcao = 'admin')
);

-- ---------- PERMITE EXCLUIR USUÁRIO E LOJA ----------
-- (o delete de loja já é coberto pela policy "admin_gerencia_lojas" da v6, for all
-- inclui delete. Só falta permitir excluir usuários pelo admin.)
do $$ begin
  execute (select coalesce(string_agg(format('drop policy if exists %I on usuarios;', policyname), ' '), '') from pg_policies where tablename = 'usuarios');
end $$;

create policy "equipe_le_usuarios" on usuarios for select using (auth.role() = 'authenticated');
create policy "admin_gerencia_usuarios" on usuarios for all using (
  exists (select 1 from usuarios u where u.id = auth.uid() and u.funcao = 'admin')
);
