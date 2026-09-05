-- =============================================
-- v6: multi-loja. Cada loja passa a ter produtos, estoque,
-- clientes, caixas e vendas PRÓPRIOS. Admin continua vendo
-- tudo (todas as lojas juntas); as outras funções só veem a
-- loja em que estão cadastradas.
-- =============================================

-- ---------- TABELA DE LOJAS ----------
create table if not exists lojas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

alter table lojas enable row level security;

do $$ begin
  execute (
    select coalesce(string_agg(format('drop policy if exists %I on lojas;', policyname), ' '), '')
    from pg_policies where tablename = 'lojas'
  );
end $$;

create policy "equipe_le_lojas" on lojas for select using (auth.role() = 'authenticated');
create policy "admin_gerencia_lojas" on lojas for all using (
  exists (select 1 from usuarios u where u.id = auth.uid() and u.funcao = 'admin')
);

-- cria a loja padrão pra receber tudo que já existia
insert into lojas (nome)
select 'Loja Principal'
where not exists (select 1 from lojas);

-- ---------- COLUNA loja_id NAS TABELAS QUE PRECISAM SER SEPARADAS ----------
alter table produtos add column if not exists loja_id uuid references lojas(id);
alter table clientes add column if not exists loja_id uuid references lojas(id);
alter table caixas add column if not exists loja_id uuid references lojas(id);
alter table turnos_caixa add column if not exists loja_id uuid references lojas(id);
alter table vendas add column if not exists loja_id uuid references lojas(id);
alter table usuarios add column if not exists loja_id uuid references lojas(id); -- fica nulo pro admin (vê tudo)

-- ---------- BACKFILL: tudo que já existia vai pra "Loja Principal" ----------
update produtos set loja_id = (select id from lojas order by criado_em limit 1) where loja_id is null;
update clientes set loja_id = (select id from lojas order by criado_em limit 1) where loja_id is null;
update caixas set loja_id = (select id from lojas order by criado_em limit 1) where loja_id is null;
update turnos_caixa set loja_id = (select id from lojas order by criado_em limit 1) where loja_id is null;
update vendas set loja_id = (select id from lojas order by criado_em limit 1) where loja_id is null;
update usuarios set loja_id = (select id from lojas order by criado_em limit 1)
  where loja_id is null and funcao <> 'admin';

alter table produtos alter column loja_id set not null;
alter table clientes alter column loja_id set not null;
alter table caixas alter column loja_id set not null;
alter table turnos_caixa alter column loja_id set not null;
alter table vendas alter column loja_id set not null;
-- usuarios.loja_id fica nullable de propósito (admin sem loja fixa = vê todas)

create index if not exists idx_produtos_loja on produtos(loja_id);
create index if not exists idx_clientes_loja on clientes(loja_id);
create index if not exists idx_caixas_loja on caixas(loja_id);
create index if not exists idx_turnos_caixa_loja on turnos_caixa(loja_id);
create index if not exists idx_vendas_loja on vendas(loja_id);

-- ---------- RLS: cada tabela só libera dados da loja da pessoa (admin vê tudo) ----------
do $$ begin
  execute (select coalesce(string_agg(format('drop policy if exists %I on produtos;', policyname), ' '), '') from pg_policies where tablename = 'produtos');
  execute (select coalesce(string_agg(format('drop policy if exists %I on clientes;', policyname), ' '), '') from pg_policies where tablename = 'clientes');
  execute (select coalesce(string_agg(format('drop policy if exists %I on caixas;', policyname), ' '), '') from pg_policies where tablename = 'caixas');
  execute (select coalesce(string_agg(format('drop policy if exists %I on turnos_caixa;', policyname), ' '), '') from pg_policies where tablename = 'turnos_caixa');
  execute (select coalesce(string_agg(format('drop policy if exists %I on vendas;', policyname), ' '), '') from pg_policies where tablename = 'vendas');
  execute (select coalesce(string_agg(format('drop policy if exists %I on venda_itens;', policyname), ' '), '') from pg_policies where tablename = 'venda_itens');
  execute (select coalesce(string_agg(format('drop policy if exists %I on produto_variantes;', policyname), ' '), '') from pg_policies where tablename = 'produto_variantes');
  execute (select coalesce(string_agg(format('drop policy if exists %I on cliente_celulares;', policyname), ' '), '') from pg_policies where tablename = 'cliente_celulares');
end $$;

create policy "acesso_por_loja_produtos" on produtos for all using (
  exists (select 1 from usuarios u where u.id = auth.uid() and (u.funcao = 'admin' or u.loja_id = produtos.loja_id))
);
create policy "acesso_por_loja_clientes" on clientes for all using (
  exists (select 1 from usuarios u where u.id = auth.uid() and (u.funcao = 'admin' or u.loja_id = clientes.loja_id))
);
create policy "acesso_por_loja_caixas" on caixas for all using (
  exists (select 1 from usuarios u where u.id = auth.uid() and (u.funcao = 'admin' or u.loja_id = caixas.loja_id))
);
create policy "acesso_por_loja_turnos_caixa" on turnos_caixa for all using (
  exists (select 1 from usuarios u where u.id = auth.uid() and (u.funcao = 'admin' or u.loja_id = turnos_caixa.loja_id))
);
create policy "acesso_por_loja_vendas" on vendas for all using (
  exists (select 1 from usuarios u where u.id = auth.uid() and (u.funcao = 'admin' or u.loja_id = vendas.loja_id))
);

-- tabelas "filhas" (não têm loja_id próprio — checam a loja da tabela "mãe")
create policy "acesso_por_loja_venda_itens" on venda_itens for all using (
  exists (
    select 1 from vendas v
    join usuarios u on u.id = auth.uid()
    where v.id = venda_itens.venda_id and (u.funcao = 'admin' or u.loja_id = v.loja_id)
  )
);
create policy "acesso_por_loja_produto_variantes" on produto_variantes for all using (
  exists (
    select 1 from produtos p
    join usuarios u on u.id = auth.uid()
    where p.id = produto_variantes.produto_id and (u.funcao = 'admin' or u.loja_id = p.loja_id)
  )
);
create policy "acesso_por_loja_cliente_celulares" on cliente_celulares for all using (
  exists (
    select 1 from clientes c
    join usuarios u on u.id = auth.uid()
    where c.id = cliente_celulares.cliente_id and (u.funcao = 'admin' or u.loja_id = c.loja_id)
  )
);

-- Observação: tecidos_cores continua global (catálogo único de tecidos/cores pra
-- todas as lojas) — se vocês quiserem cores diferentes por loja no futuro, é só pedir.
