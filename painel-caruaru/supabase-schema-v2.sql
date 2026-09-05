-- =============================================
-- PAINEL CARUARU MÓVEIS — Ampliação do schema (v2)
-- Rode isso DEPOIS do supabase-schema.sql original, no mesmo projeto.
-- Cobre tudo que testamos no preview: vendas, caixa, variações de
-- produto por tecido/espessura, cores disponíveis, e permissões.
-- =============================================

create extension if not exists "pgcrypto";

-- ---------- PRODUTOS: ajustes ----------
-- tipo_precificacao define como o preço/estoque do produto funciona:
--   'simples'   -> um preço e um estoque só (ex: Puff, Cabeceira)
--   'tecido'    -> preço e estoque variam por tecido (Suede/Linho/Veludo)
--   'espessura' -> preço e estoque variam por espessura (5cm/7cm/14cm) — usado em Camas
alter table produtos add column if not exists tipo_precificacao text
  not null default 'simples' check (tipo_precificacao in ('simples','tecido','espessura'));

-- ---------- VARIAÇÕES DE PRODUTO (tecido ou espessura) ----------
-- Cada linha é uma variação de um produto com tipo_precificacao != 'simples'.
-- Ex: produto "Sofá Itália", variante "Suede", preço à vista 650, estoque 2.
create table if not exists produto_variantes (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null references produtos(id) on delete cascade,
  nome_variante text not null, -- "Suede", "Linho", "Veludo", "5cm", "7cm", "14cm"
  preco_avista numeric(10,2) not null default 0,
  estoque int not null default 0,
  criado_em timestamptz not null default now(),
  unique (produto_id, nome_variante)
);

-- ---------- TECIDOS E CORES DISPONÍVEIS ----------
create table if not exists tecidos_cores (
  id uuid primary key default gen_random_uuid(),
  tecido text not null, -- "Suede", "Linho", "Veludo"
  codigo text not null, -- "12", "24", "13"...
  nome text not null,   -- "Ivory", "Timber"...
  disponivel boolean not null default true,
  unique (tecido, codigo)
);

-- ---------- CLIENTES: campos que faltavam ----------
alter table clientes add column if not exists numero text;
alter table clientes add column if not exists sem_numero boolean not null default false;
alter table clientes add column if not exists complemento text;
alter table clientes add column if not exists cpf text;
-- múltiplos celulares por cliente
create table if not exists cliente_celulares (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  celular text not null
);

-- ---------- CAIXAS ----------
create table if not exists caixas (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- ---------- TURNOS DE CAIXA (abertura/fechamento) ----------
create table if not exists turnos_caixa (
  id uuid primary key default gen_random_uuid(),
  caixa_id uuid not null references caixas(id) on delete restrict,
  aberto_por uuid references usuarios(id),
  fundo_inicial numeric(10,2) not null default 0,
  status text not null default 'aberto' check (status in ('aberto','fechado')),
  total_vendido numeric(10,2) not null default 0,
  total_dinheiro numeric(10,2) not null default 0,
  total_pix numeric(10,2) not null default 0,
  total_debito numeric(10,2) not null default 0,
  total_credito numeric(10,2) not null default 0,
  aberto_em timestamptz not null default now(),
  fechado_em timestamptz
);

-- ---------- VENDAS ----------
create table if not exists vendas (
  id uuid primary key default gen_random_uuid(),
  turno_caixa_id uuid references turnos_caixa(id) on delete set null,
  cliente_id uuid references clientes(id) on delete restrict,
  forma_pagamento text not null check (forma_pagamento in ('Dinheiro','Pix','Débito','Crédito')),
  parcelas int not null default 1,
  subtotal numeric(10,2) not null default 0,   -- soma dos itens, no preço "a prazo"
  ajuste numeric(10,2) not null default 0,     -- negativo = desconto à vista aplicado
  total numeric(10,2) not null default 0,
  criado_em timestamptz not null default now()
);

-- ---------- ITENS DA VENDA ----------
create table if not exists venda_itens (
  id uuid primary key default gen_random_uuid(),
  venda_id uuid not null references vendas(id) on delete cascade,
  produto_id uuid references produtos(id) on delete restrict,
  nome_produto text not null,       -- guarda o nome no momento da venda (histórico)
  variante text,                    -- "Suede — Cor 12 (Ivory)" ou "Espessura 5cm"
  quantidade int not null default 1,
  valor_unitario numeric(10,2) not null default 0,
  total numeric(10,2) not null default 0,
  tipo_entrega text not null default 'pronta' check (tipo_entrega in ('pronta','encomenda'))
);

-- ---------- PERMISSÕES POR FUNÇÃO ----------
create table if not exists permissoes (
  funcao text not null check (funcao in ('admin','vendedor','producao')),
  tela text not null, -- 'vender','produtos','encomendas','notas','caixa','movimento','administracao'
  pode_acessar boolean not null default false,
  primary key (funcao, tela)
);

insert into permissoes (funcao, tela, pode_acessar) values
  ('vendedor','vender',true), ('vendedor','produtos',true), ('vendedor','encomendas',true),
  ('vendedor','notas',true), ('vendedor','caixa',true), ('vendedor','movimento',false), ('vendedor','administracao',false),
  ('producao','vender',false), ('producao','produtos',true), ('producao','encomendas',true),
  ('producao','notas',false), ('producao','caixa',false), ('producao','movimento',false), ('producao','administracao',false),
  ('admin','vender',true), ('admin','produtos',true), ('admin','encomendas',true),
  ('admin','notas',true), ('admin','caixa',true), ('admin','movimento',true), ('admin','administracao',true)
on conflict (funcao, tela) do nothing;

-- ---------- ÍNDICES ----------
create index if not exists idx_produto_variantes_produto on produto_variantes(produto_id);
create index if not exists idx_venda_itens_venda on venda_itens(venda_id);
create index if not exists idx_vendas_turno on vendas(turno_caixa_id);
create index if not exists idx_turnos_caixa_status on turnos_caixa(status);
create index if not exists idx_cliente_celulares_cliente on cliente_celulares(cliente_id);

-- ---------- RLS ----------
alter table produto_variantes enable row level security;
alter table tecidos_cores enable row level security;
alter table cliente_celulares enable row level security;
alter table caixas enable row level security;
alter table turnos_caixa enable row level security;
alter table vendas enable row level security;
alter table venda_itens enable row level security;
alter table permissoes enable row level security;

create policy "equipe_acessa_produto_variantes" on produto_variantes for all using (auth.role() = 'authenticated');
create policy "equipe_acessa_tecidos_cores" on tecidos_cores for all using (auth.role() = 'authenticated');
create policy "equipe_acessa_cliente_celulares" on cliente_celulares for all using (auth.role() = 'authenticated');
create policy "equipe_acessa_caixas" on caixas for all using (auth.role() = 'authenticated');
create policy "equipe_acessa_turnos_caixa" on turnos_caixa for all using (auth.role() = 'authenticated');
create policy "equipe_acessa_vendas" on vendas for all using (auth.role() = 'authenticated');
create policy "equipe_acessa_venda_itens" on venda_itens for all using (auth.role() = 'authenticated');
create policy "equipe_le_permissoes" on permissoes for select using (auth.role() = 'authenticated');
create policy "admin_altera_permissoes" on permissoes for all using (
  exists (select 1 from usuarios u where u.id = auth.uid() and u.funcao = 'admin')
);

-- ---------- CAIXA PADRÃO ----------
insert into caixas (nome) values ('Caixa 001') on conflict (nome) do nothing;
