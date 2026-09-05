-- =============================================
-- v5: cargo "Caixa", permissões individuais por usuário,
-- e novos/atualizados produtos (Namoradeira Benny, Cabeceira
-- Queen/King, Painéis, Base Queen/King).
-- =============================================

-- ---------- CARGO "CAIXA" ----------
alter table usuarios drop constraint if exists usuarios_funcao_check;
alter table usuarios add constraint usuarios_funcao_check check (funcao in ('admin','vendedor','producao','caixa'));

alter table permissoes drop constraint if exists permissoes_funcao_check;
alter table permissoes add constraint permissoes_funcao_check check (funcao in ('admin','vendedor','producao','caixa'));

insert into permissoes (funcao, tela, pode_acessar) values
  ('caixa','vender',true), ('caixa','produtos',true), ('caixa','encomendas',true),
  ('caixa','notas',true), ('caixa','caixa',true), ('caixa','movimento',false),
  ('caixa','administracao',false), ('caixa','clientes',true)
on conflict (funcao, tela) do nothing;

-- ---------- PERMISSÕES INDIVIDUAIS POR USUÁRIO (opcional, sobrepõe o cargo) ----------
create table if not exists usuario_permissoes (
  usuario_id uuid not null references usuarios(id) on delete cascade,
  tela text not null,
  pode_acessar boolean not null default false,
  primary key (usuario_id, tela)
);

alter table usuario_permissoes enable row level security;

create policy "admin_gerencia_usuario_permissoes" on usuario_permissoes for all using (
  exists (select 1 from usuarios u where u.id = auth.uid() and u.funcao = 'admin')
);
create policy "usuario_le_propria_permissao" on usuario_permissoes for select using (usuario_id = auth.uid());

-- ---------- NAMORADEIRA BENNY (novo produto) ----------
insert into produtos (nome, categoria, custo, preco_venda, tipo_estoque, quantidade_estoque, tipo_precificacao)
select 'Namoradeira Benny', 'Namoradeiras', 0, 500, 'pronta_entrega', 0, 'tecido'
where not exists (select 1 from produtos where nome = 'Namoradeira Benny');

insert into produto_variantes (produto_id, nome_variante, preco_avista, estoque)
select p.id, v.nome_variante, v.preco_avista, 0
from produtos p
cross join lateral (values
  ('Namoradeira Benny', 'Suede', 500),
  ('Namoradeira Benny', 'Linho', 520),
  ('Namoradeira Benny', 'Veludo', 520)
) as v(produto_nome, nome_variante, preco_avista)
where p.nome = v.produto_nome
on conflict (produto_id, nome_variante) do update set preco_avista = excluded.preco_avista;

-- ---------- CABECEIRA QUEEN E KING (novos) ----------
insert into produtos (nome, categoria, custo, preco_venda, tipo_estoque, quantidade_estoque, tipo_precificacao)
select v.nome, 'Cabeceiras', 0, v.preco_base, 'pronta_entrega', 0, 'tecido'
from (values
  ('Cabeceira Queen', 260),
  ('Cabeceira King', 350)
) as v(nome, preco_base)
where not exists (select 1 from produtos where produtos.nome = v.nome);

insert into produto_variantes (produto_id, nome_variante, preco_avista, estoque)
select p.id, v.nome_variante, v.preco_avista, 0
from produtos p
cross join lateral (values
  ('Cabeceira Queen', 'Suede', 260), ('Cabeceira Queen', 'Linho', 280), ('Cabeceira Queen', 'Veludo', 280),
  ('Cabeceira King', 'Suede', 350), ('Cabeceira King', 'Linho', 370), ('Cabeceira King', 'Veludo', 370)
) as v(produto_nome, nome_variante, preco_avista)
where p.nome = v.produto_nome
on conflict (produto_id, nome_variante) do update set preco_avista = excluded.preco_avista;

-- ---------- PAINÉIS (na mesma categoria de cabeceiras) ----------
insert into produtos (nome, categoria, custo, preco_venda, tipo_estoque, quantidade_estoque, tipo_precificacao)
select v.nome, 'Cabeceiras', 0, v.preco_base, 'pronta_entrega', 0, 'tecido'
from (values
  ('Painel Casal', 150),
  ('Painel Solteiro', 110),
  ('Painel Queen', 180),
  ('Painel King', 220)
) as v(nome, preco_base)
where not exists (select 1 from produtos where produtos.nome = v.nome);

insert into produto_variantes (produto_id, nome_variante, preco_avista, estoque)
select p.id, v.nome_variante, v.preco_avista, 0
from produtos p
cross join lateral (values
  ('Painel Casal', 'Suede', 150), ('Painel Casal', 'Linho', 170), ('Painel Casal', 'Veludo', 170),
  ('Painel Solteiro', 'Suede', 110), ('Painel Solteiro', 'Linho', 130), ('Painel Solteiro', 'Veludo', 130),
  ('Painel Queen', 'Suede', 180), ('Painel Queen', 'Linho', 200), ('Painel Queen', 'Veludo', 200),
  ('Painel King', 'Suede', 220), ('Painel King', 'Linho', 240), ('Painel King', 'Veludo', 240)
) as v(produto_nome, nome_variante, preco_avista)
where p.nome = v.produto_nome
on conflict (produto_id, nome_variante) do update set preco_avista = excluded.preco_avista;

-- ---------- BASE QUEEN E KING ----------
insert into produtos (nome, categoria, custo, preco_venda, tipo_estoque, quantidade_estoque, tipo_precificacao)
select v.nome, 'Camas', 0, v.preco_base, 'pronta_entrega', 0, 'simples'
from (values
  ('Base Queen', 400),
  ('Base King', 500)
) as v(nome, preco_base)
where not exists (select 1 from produtos where produtos.nome = v.nome);

-- se já existirem (com outro preço), atualiza o valor à vista
update produtos set preco_venda = 400 where nome = 'Base Queen';
update produtos set preco_venda = 500 where nome = 'Base King';
